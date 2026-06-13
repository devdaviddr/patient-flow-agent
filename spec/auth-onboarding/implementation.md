# Implementation Plan — Onboarding & administration (0.5.0)

| | |
| --- | --- |
| **Feature** | Invite-gated sign-up (50 single-use, hashed, role-bearing keys) · `superadmin` tier + admin area (Better Auth admin plugin) · self-service change-password / delete-account · last-superadmin invariant · doc reconciliation |
| **Target release** | `0.5.0` |
| **Status** | 📝 Planned → awaiting approval (SDD step 2) |
| **Implements** | `spec.md` (same folder) — B1–B8 |
| **Builds on** | `spec/auth/` (`0.4.0`): Better Auth + SQLite/Drizzle, server sessions, `viewer`/`coordinator`, default-deny + `withPolicy`, `DecisionRecord.actor`. |

> SDD step 2 (Plan): *how* the spec is built. The review-hardened decisions in `spec.md` (§4, decisions
> 1–7) are taken as settled and threaded into the design below — claim-then-compensate redemption, the
> admin plugin, built-in sign-up staying disabled, the last-superadmin invariant on every path, and never
> advertising superadmin.

---

## 1. Architecture

`0.5.0` adds three capabilities on top of the `0.4.0` layer **without changing its enforcement model**: the
same default-deny middleware, the same authoritative `withPolicy` per-route guard, the same role-rank
comparison. The role union grows by one (`superadmin`), one new table appears (`invite`), and three new
surfaces are added (public sign-up, superadmin admin area, self-service account settings). The agent / sim /
eval remain untouched.

```
src/
  auth/
    schema.ts            # EXTEND: ROLES += "superadmin"; NEW `invite` table (code_hash, role, used_by?, createdAt)
    session.ts           # EXTEND: RANK += superadmin(2); NEW requireSuperadmin guard
    auth.ts              # EXTEND: register the Better Auth `admin` plugin (admin-capable role = superadmin)
    policy.ts            # EXTEND: classify /api/register (public) + /api/auth/admin/* (superadmin) + account routes
    invite.ts            # NEW: hash (KDF/HMAC), generate-50, claim-then-compensate redemption, remaining-count
    superadmin.ts        # NEW: last-superadmin invariant (count guard) shared by admin + self-delete paths
    seed.ts              # EXTEND: bootstrap 1 superadmin (out-of-band password); generate + emit 50 invite keys
  app/
    api/
      register/route.ts          # NEW: invite-gated sign-up (createUser + claim + explicit session)
      account/password/route.ts  # NEW: change password (current required)
      account/route.ts           # NEW: DELETE self (confirm → sessions cascade), subject to last-superadmin
      auth/[...all]/route.ts      # admin-plugin endpoints surface under /api/auth/admin/* (guarded, see policy)
    register/page.tsx            # NEW: public sign-up form (invite key + email + password)
    admin/page.tsx               # NEW: superadmin-only user administration (list/search/edit/delete/role)
    settings/page.tsx            # NEW: self-service change-password + delete-account
    login/page.tsx               # EXTEND: link to /register; still lists ONLY viewer/coordinator demo accounts
drizzle/                          # NEW migration: invite table + role enum widening
docs/PRD.md, docs/Architecture.md # revised + version-bumped (B8)
.invite-keys.txt                  # gitignored; plaintext keys emitted ONCE by the seed
```

Public allow-list grows by exactly one page (`/register`) and one API (`/api/register`); everything else
stays default-deny.

## 2. Component & layer design

### 2.1 Roles — extend the hierarchy (B-roles, decision 1)
`schema.ts`: `ROLES = ["viewer", "coordinator", "superadmin"] as const`. `session.ts`:
`RANK = { viewer: 0, coordinator: 1, superadmin: 2 }` — the "one-line change" the `0.4.0` comment
anticipated. New guard `requireSuperadmin(req)` mirrors `requireOperator`: `requireAuth` then
`RANK[role] < RANK.superadmin → 403`. `superadmin` is **never** an assignable value on the sign-up path
(B1) — the register route hard-restricts the granted role to `viewer | coordinator`.

### 2.2 Data model — the `invite` table (B2, decision 3)
```
invite { code_hash (PK, unique), role: "viewer"|"coordinator", used_by: text? → user.id, createdAt }
```
- **`code_hash`** stores a slow-KDF/HMAC-with-`BETTER_AUTH_SECRET` digest — **never** the plaintext, and
  **not** a bare SHA-256 (decision 4). Lookup is by hashing the presented key and matching the column.
- **`used_by`** is NULL until a real user id claims it; **no FK sentinel** — `PRAGMA foreign_keys = ON`
  (inherited from `0.4.0`) means a placeholder would violate the FK, so the column legitimately stays NULL
  until claimed (B3). `onDelete` for `used_by` is `set null` (an invite outlives the account it created).
- New Drizzle migration checked into `drizzle/`; widening the `role` enum is a no-op at the SQLite storage
  level (text column) but the migration documents it.

### 2.3 Invite system (`invite.ts`) (B2, B3)
- `hashKey(plaintext)` — the KDF/HMAC; one source of truth for generate + verify.
- `generateInvites(n=50)` — 50 keys, each **≥128-bit entropy** rendered as **~26 base32 chars** (a format
  that actually carries the entropy, decision 4); returns `{ plaintext, role }[]` for one-time emission and
  inserts only the hashes. Role mix is a seed parameter (default split documented in §2.8).
- `remaining()` — count of `used_by IS NULL`; sign-up closes with a clear message at zero (B2).
- **`redeem(plaintextKey, realUserId)` — claim-then-compensate (B3), the core correctness path:**
  1. The user is **already created** (see §2.4) before redeem runs — `realUserId` exists.
  2. Single **conditional** statement:
     `UPDATE invite SET used_by = :realUserId WHERE code_hash = :hash AND used_by IS NULL`.
  3. **`rowsAffected !== 1` ⇒ the race loser** (or an invalid/used key): the caller treats it as failure and
     runs the **compensating release** — delete the just-created user (and cascade its session/account) so a
     lost race leaves no orphan account. This is explicitly **not** "one big transaction" (decision 3); the
     conditional UPDATE is the atomic guard, proven by a concurrent same-key test (exactly one winner).

### 2.4 Sign-up route (`/api/register`) (B1, B3, decision 2)
Built-in Better Auth sign-up **stays disabled** (`signUpEmail` returns `signup_disabled`). Onboarding is a
custom route:
1. Validate body (invite key, email, password) at the boundary with an explicit schema.
2. Pre-check `remaining() > 0` and that the presented key hashes to an **unused** invite; resolve the
   **role encoded on that invite** (never `superadmin`).
3. Create the account via the **admin plugin's `auth.api.createUser`** (catching duplicate-email → non-leaky
   error), with the invite's role.
4. `redeem(key, newUserId)` per §2.3; on `rowsAffected !== 1` run the compensating release and return the
   non-leaky error.
5. On success, start a session explicitly (`auth.api.signInEmail` / `setSession`) and return signed-in.
Order matters: **create → claim → compensate-on-failure**, so `used_by` only ever points at a real id (B3).

### 2.5 Superadmin administration (admin plugin) (B4, B7, decisions 1 & 7)
- Register Better Auth's **`admin` plugin** in `auth.ts`; the admin-capable role is `superadmin`. It surfaces
  user CRUD endpoints under `/api/auth/admin/*` (list/search, set-role, remove user, revoke sessions).
- **Independent gate (decision 7):** the plugin is **not** the sole authority. `policy.ts` classifies
  `/api/auth/admin/*` as a new **`superadmin`** tier, and `withPolicy(superadmin, …)` asserts the role
  **before** the plugin handler runs — so a direct call from a lower role is `403` even if the plugin's own
  check were ever misconfigured. (This narrows the `0.4.0` blanket `/api/auth → public` rule: auth endpoints
  stay public **except** the `admin/*` subtree.)
- `app/admin/page.tsx` — superadmin-only UI: list/search users, edit name + role, delete, revoke sessions,
  and an invite overview (remaining count). Hidden from the shell for non-superadmins (defence-in-depth; the
  server is the gate).

### 2.6 Last-superadmin invariant (`superadmin.ts`) (B5, decision 5)
A single guard — `assertNotLastSuperadmin(targetUserId, change)` — enforced on **every** path that could
remove the final superadmin: the **admin mutation** path (delete / demote via the plugin) **and** the
**self-service delete-account** path (§2.7). Implemented as a **before-hook / DB-level count check** the
plugin cannot bypass: within the mutation, if the target is a superadmin and
`COUNT(role='superadmin' AND id != target) === 0`, reject (`409`/`403`). Covered by a **concurrent-mutation
test** (two simultaneous "demote the last two superadmins" requests: at most one succeeds, ≥1 superadmin
always remains).

### 2.7 Self-service lifecycle (B6, subject to B5)
- `POST /api/account/password` — change password; **current password required** and re-verified server-side;
  `requireAuth`.
- `DELETE /api/account` — delete own account behind an explicit confirm; sessions **cascade** (FK
  `onDelete: cascade` from `0.4.0`); redirect to `/login`. Runs `assertNotLastSuperadmin(self)` first, so a
  lone superadmin cannot self-delete the system into lockout (B5).
- Prior `DecisionRecord`s **survive** deletion — the `0.4.0` `actor` is a **denormalized snapshot**, not an
  FK, so the audit trail is intact (B6).
- `app/settings/page.tsx` hosts both; `app/register/page.tsx` is the public counterpart.

### 2.8 Seed (`seed.ts`) (decisions 4 & 6)
Extends the idempotent `0.4.0` seed:
- Bootstrap **one `superadmin`** with an **out-of-band password** — a per-run random password (or a
  gitignored env), emitted **once** to stdout / a gitignored file, **never** a committed constant and
  **never** surfaced on the login screen (decision 6).
- Generate **50 invite keys** (default role split documented in the seed, e.g. mostly `coordinator`),
  insert hashes, and emit the plaintext **once** to **`.invite-keys.txt`** (gitignored). Re-runs are no-ops
  (don't regenerate if invites already exist) — idempotent like the `0.4.0` accounts.
- The two `viewer`/`coordinator` demo accounts and their click-to-fill hints are unchanged; the login screen
  still advertises **only** those two (decision 6).

### 2.9 Docs reconciliation (B8)
- **PRD.md** (bump): onboarding via invite, a superadmin/admin capability, self-service account management;
  changelog row.
- **Architecture.md** (bump): §3/§5 — new `invite` table + the `superadmin` tier in the role hierarchy; note
  the admin-plugin endpoints + their independent superadmin gate; changelog row. Confirm
  `OpenCode-Harness.md` needs no change.
- **S13 / `AUTHORED_FILES`** extended to cover the new sign-up + admin + settings copy (B8).

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Better Auth `admin` plugin** for superadmin CRUD | Native list/search/set-role/remove/revoke; less hand-rolled admin surface. | A plugin dependency; mitigated by the independent `withPolicy(superadmin)` gate so it isn't the sole authority. |
| **Built-in sign-up stays disabled; custom `/api/register`** | Onboarding must be invite-gated and role-bearing — open `signUpEmail` can't express that. | One hand-written route + explicit session start. |
| **Claim-then-compensate (not one transaction)** | A conditional `UPDATE … WHERE used_by IS NULL` is a clean atomic race guard; avoids holding a tx across user creation. | A compensating delete on the rare user-create-then-lost-race path; covered by test. |
| **Hashed invites, KDF/HMAC, ≥128-bit, base32** | Keys are credentials; a stolen DB shouldn't yield usable keys; bare SHA-256 is brute-forceable for low entropy. | Slightly more work than SHA-256; plaintext exists only in the one-time gitignored emit. |
| **Last-superadmin invariant on every path, DB/hook-level** | The only catastrophic failure is locking out all admins; must hold under concurrency and on both admin + self-delete paths. | A shared count-guard + a concurrent test; a tiny cost per mutation. |
| **Superadmin never advertised / never self-assignable** | Smallest credible admin surface; the public screen and sign-up must not leak or grant it. | Bootstrap is out-of-band (seed output), a small operator step. |
| **`/api/auth/admin/*` independently gated** | Defence-in-depth; the plugin is not trusted as the sole check (mirrors the `0.4.0` `withPolicy` philosophy). | The public allow-list for `/api/auth` is narrowed to exclude the admin subtree. |

## 4. Verification (maps to acceptance criteria)

Fast **unit/integration tests** + a **multi-role live walkthrough** (superadmin, coordinator, viewer, new
invitee).

| Criterion | How verified |
| --- | --- |
| B1 | Test: valid unused key → account created with the **key's** role (never superadmin); invalid/used key + duplicate email → non-leaky error; success → signed in. |
| B2 | Test: exactly 50 keys seeded; stored **hashed** (no plaintext in DB); `remaining()` decrements; at zero, sign-up closes with the clear message; key entropy/format check. |
| B3 | **Concurrency test:** two redemptions of the same key → exactly one wins (`rowsAffected===1`), the loser is compensated (no orphan user); `used_by` never set without a real user id. |
| B4 | Test/walkthrough: a superadmin can list/search, edit (name, role), delete (sessions revoked), change roles via the admin area + API. |
| B5 | **Concurrency test:** the **last superadmin** cannot be deleted or demoted on **either** the admin path **or** self-delete; ≥1 superadmin always remains. |
| B6 | Test/walkthrough: change-password requires the current password; delete-account cascades sessions → `/login`; prior `DecisionRecord`s still render their `actor`. |
| B7 | **Extended enforcing enumeration test:** `/api/auth/admin/*` + account routes require `superadmin`/auth; lower role / unauthenticated → `403`/`401` via direct call, including explicit probes of the admin-plugin endpoints. |
| B8 | `npm test` green incl. **S12** (determinism) + **S13** (safety — `AUTHORED_FILES` extended); `typecheck`/`lint`/`build` clean; PRD + Architecture updated + version-bumped. |

## 5. Task breakdown (SDD step 3) — the code PR

1. **Schema + migration** — `ROLES += superadmin`; new `invite` table; generate + check in the migration;
   keep `PRAGMA foreign_keys = ON`.
2. **Invite core** — `src/auth/invite.ts`: `hashKey`, `generateInvites(50)`, `remaining()`,
   `redeem` (claim-then-compensate); unit + concurrency tests.
3. **Sign-up route** — `app/api/register/route.ts` (boundary schema, `createUser`, redeem, explicit session,
   non-leaky errors) + `app/register/page.tsx`; classify both as public in `policy.ts`.
4. **Superadmin tier + guard** — `RANK += superadmin`; `requireSuperadmin`; register the **admin plugin** in
   `auth.ts`; classify `/api/auth/admin/*` as `superadmin` in `policy.ts`.
5. **Admin area** — `app/admin/page.tsx` (list/search/edit/delete/role + invite overview); superadmin-gate
   the shell entry.
6. **Last-superadmin invariant** — `src/auth/superadmin.ts`; wire into the admin delete/demote path **and**
   self-delete; concurrent-mutation test.
7. **Self-service** — `app/api/account/password/route.ts`, `app/api/account/route.ts` (DELETE),
   `app/settings/page.tsx`; classify routes (`authenticated`).
8. **Seed** — bootstrap 1 superadmin (out-of-band password) + 50 invite keys emitted once to
   `.invite-keys.txt` (gitignored); idempotent; npm script + Docker first-boot wiring.
9. **Login screen** — link to `/register`; still advertise only viewer/coordinator demo accounts.
10. **Docs (B8)** — revise + version-bump `PRD.md` + `Architecture.md` per §2.9; extend `AUTHORED_FILES`.
11. **Tests** — the extended enforcing enumeration (admin + account routes), invite hashing + entropy,
    redemption concurrency, last-superadmin concurrency, change-password / delete-account + record survival;
    keep S12 green.
12. **Verify** — full suite + `typecheck`/`lint`/`build`; live multi-role walkthrough in Docker.

## 6. Out of scope (restated from spec §5)

**Later/never:** email verification, forgot-password-via-email, MFA, passkeys, OAuth/social login,
multi-tenant orgs, self-service invite generation, persisting the simulator / decision records across
restart. Desktop only.
