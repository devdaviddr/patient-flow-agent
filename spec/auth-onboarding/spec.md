# Spec — Onboarding & administration (invite sign-up · superadmin · account lifecycle)

| | |
| --- | --- |
| **Feature** | Layer onboarding + administration onto the `0.4.0` auth foundation: **invite-gated sign-up** (50 single-use, hashed, role-bearing keys), a **`superadmin`** tier with a **user-administration area**, and **self-service change-password / delete-account**. |
| **Target release** | `0.5.0` |
| **Status** | 📝 Queued — split out of `0.4.0` on multi-agent review advice (ship the auth headline first). |
| **Builds on** | `spec/auth/` (`0.4.0`): Better Auth + SQLite/Drizzle, server sessions, `viewer`/`coordinator` roles, default-deny `withPolicy` enforcement, `DecisionRecord.actor`. |
| **Prior detail** | A fuller first draft of the invite + admin design (with the same decisions) is preserved in git history at `spec/auth/{spec,implementation}.md` before the `0.4.0` split — recover it when this release starts. |

> SDD step 1. Concise here by intent — fleshed to full `implementation.md` detail when `0.5.0` begins.
> The review's must-fixes for this material are **already baked into the decisions below** so they are not
> re-discovered.

---

## 1. Problem / fit

`0.4.0` makes auth real but **seed-only**: there is no way to onboard a new person, no administrator to
manage the user base, and no self-service account management. This release adds those three, extending the
same role hierarchy to **`viewer ⊂ coordinator ⊂ superadmin`** and the same fail-closed enforcement.

## 2. Roles (extends 0.4.0)

- **`superadmin`** — everything `coordinator` can, **plus administration**: list/search users, edit a user
  (name, role), delete a user (revoking sessions), change roles, revoke sessions, view invite overview.
  **Never self-assignable** — seed-bootstrapped, then granted only by an existing superadmin.

## 3. Acceptance criteria

| # | Criterion |
| --- | --- |
| B1 | **Invite-gated sign-up.** A public sign-up page requires a **valid, unused invite key** (with email + password); the new account gets the **role encoded on the key** (`viewer` or `coordinator` — never `superadmin`). Invalid/used key or duplicate email → non-leaky error; success → signed in. |
| B2 | **Invite keys — 50, single-use, hashed.** Exactly 50 keys; each single-use and **atomically claimed** (concurrent same-key redemptions: exactly one wins); stored **hashed** (a slow KDF / HMAC-with-secret, not bare SHA-256), plaintext emitted **once** to a gitignored file; key entropy ≥128-bit with a format that actually carries it (≈26 base32 chars). When none remain, sign-up closes with a clear message. |
| B3 | **Claim is correct under failure.** Onboarding uses **claim-then-compensate** (not "one transaction"): create the user first (catching duplicate-email) → single conditional `UPDATE invite SET used_by=:realId WHERE code_hash=? AND used_by IS NULL` (treat `rowsAffected!==1` as the race loser) → on user-create failure, run a **compensating release**. `used_by` stays NULL until a real user id exists (no FK sentinel); creation uses the **admin plugin `auth.api.createUser`** (built-in sign-up stays disabled) followed by an explicit sign-in/`setSession`. |
| B4 | **Superadmin user administration.** A superadmin can list/search users, edit (name, role), delete (revoking sessions), and change roles, via a superadmin-only admin area + API (Better Auth **admin plugin**). |
| B5 | **No lockout — all paths.** The **last `superadmin` cannot be deleted or demoted**, enforced on **every** path: the admin mutation path **and** the self-service delete-account path (B6) — via a DB-level/before-hook guard the plugin cannot bypass. Covered by a concurrent-mutation test. |
| B6 | **Self-service lifecycle.** A signed-in user can **change password** (current password required) and **delete their own account** (confirm → sessions cascade → `/login`); prior `DecisionRecord`s **survive** (denormalized actor, from `0.4.0`). Subject to B5. |
| B7 | **Admin surface gated.** The admin area + API require **`superadmin`**; lower roles / unauthenticated are refused (`403`/`401`) even via direct call — added to the `0.4.0` enforcing enumeration test, including an explicit probe of the admin-plugin endpoints. |
| B8 | **No regressions / safety.** Existing suite + S12/S13 green (AUTHORED_FILES extended to new sign-up/admin copy); docs (PRD/Architecture) updated + version-bumped for the new onboarding/admin surface. |

## 4. Key decisions (review-hardened)

1. **Adopt Better Auth's admin plugin** for superadmin user CRUD; superadmin is the admin-capable role.
2. **Built-in sign-up stays disabled**; onboarding goes through a custom `/api/register` route using
   `auth.api.createUser` + explicit session start (per B3) — `signUpEmail` returns `signup_disabled`.
3. **Claim-then-compensate** invite redemption; the conditional `UPDATE … WHERE used_by IS NULL` is the
   atomic race guard; no FK sentinel; `PRAGMA foreign_keys = ON`.
4. **Invite keys** hashed with a KDF/HMAC; ≥128-bit; plaintext emitted once to a gitignored file; grant
   `viewer`/`coordinator` only.
5. **Last-superadmin invariant on every path** (admin + self-delete), DB/hook-level so the plugin can't
   bypass it.
6. **Superadmin credentials are never advertised** on the public login screen — bootstrap-only,
   out-of-band (gitignored seed output or per-deploy random password). The login screen surfaces only the
   `viewer`/`coordinator` demo accounts.
7. **Public allow-list stays narrow**; `/api/auth/admin/*` gets an independent superadmin assertion so the
   plugin is not the sole gate.

## 5. Scope

**In:** invite system + seed of 50 keys, public sign-up page, superadmin role + admin area + admin plugin,
change-password + delete-account, doc + version updates.
**Out (later/never):** email verification, forgot-password-via-email, MFA, passkeys, OAuth, multi-tenant,
self-service invite generation, simulator/decision-record persistence. Desktop only.
