# Implementation Plan — Authentication & attributed approvals (0.4.0)

| | |
| --- | --- |
| **Feature** | Better Auth (email/password) · SQLite/Drizzle · server sessions · `viewer`/`coordinator` RBAC · default-deny + `withPolicy` guards · attributed `DecisionRecord`s · doc reconciliation |
| **Target release** | `0.4.0` |
| **Status** | 📝 Planned → building (post-review) |
| **Implements** | `spec.md` (same folder) — A1–A15 |

> SDD step 2 (Plan): *how* the spec is built. Reflects the multi-agent review: explicit route
> classification, the `withPolicy` wrapper + enforcing enumeration test, the doc-reconciliation task, and
> the deferral of invites/admin/lifecycle to `0.5.0`.

---

## 1. Architecture

Auth is a **new, isolated layer** plus three small seams into existing code (middleware, route guards, one
field on `DecisionRecord`). The agent/sim/eval are untouched; the driver gains an optional `actor` on
`approve`/`reject`.

```
src/
  auth/
    db.ts                 # Drizzle client over better-sqlite3 (AUTH_DB_PATH; PRAGMA foreign_keys = ON)
    schema.ts             # Drizzle tables: user (role: viewer|coordinator), session, account, verification
    auth.ts               # Better Auth: drizzleAdapter, emailAndPassword, role on session, rate limiter, CF IP header
    session.ts            # getSessionUser, requireAuth, requireOperator (coordinator+)
    policy.ts             # central route → required-tier map (every on-disk route; default = operator)
    withPolicy.ts         # HOF wrapping a route handler so its guard cannot be omitted
    seed.ts               # idempotent seed: coordinator + viewer demo accounts (named demo-only passwords)
  app/
    api/auth/[...all]/route.ts   # Better Auth handler (sign-in/out/session)
    lib/auth.tsx          # REWIRED: AuthProvider/useAuth wrap the Better Auth React client (+ user.role)
    login/page.tsx        # REWIRED: real email/password sign-in + 2 demo-account hints (A11)
    (app)/layout.tsx       # guard simplified (middleware redirects; layout reads the user); logout control
    api/**/route.ts        # every handler wrapped by withPolicy(tier, handler)
  middleware.ts           # NEW: default-deny over (app) + /api/* (A4, A13)
  driver/
    types.ts              # DecisionRecord gains actor?: DecisionActor
    driver.ts             # approve(id, actor?) / reject(id, actor?) write actor onto the record
drizzle/                  # generated migrations (checked in)
drizzle.config.ts
.env.example              # BETTER_AUTH_SECRET, BETTER_AUTH_URL, AUTH_DB_PATH
docker-compose.yml        # SQLite volume; un-publish app port; Cloudflare Tunnel ingress
docs/PRD.md, docs/Architecture.md   # revised + version-bumped (A15)
```

The shell (`Topbar`, `Sidebar`) keeps using `useAuth()`; the rewired hook keeps the same shape plus
`user.role`, so markup barely changes — viewers get approve/reject + assess controls hidden.

## 2. Component & layer design

### 2.1 Data model — Drizzle + SQLite (A1, A5, A9)
```
user      { id, email (unique), name, role: "viewer"|"coordinator", emailVerified, createdAt, updatedAt }
session   { id, userId → user, token, expiresAt, ipAddress?, userAgent?, createdAt }
account   { id, userId → user, providerId, password (hash), ... }   # KDF hash here
verification { ... }                                                # present; unused flows
```
`db.ts` opens **better-sqlite3** at `AUTH_DB_PATH` and **sets `PRAGMA foreign_keys = ON`** (off by default
in SQLite). Migrations via **Drizzle Kit**, checked into `drizzle/`. Passwords hashed by Better Auth's KDF
(scrypt default); never stored/returned in plaintext (A1).

### 2.2 Better Auth server (`auth.ts`) (A2, A3, A12)
`betterAuth({...})` with the **Drizzle adapter**, `emailAndPassword` enabled (**built-in open sign-up
left disabled** — accounts are seed-only this release), and **`role` on the session payload** (an
`additionalFields`/user field) so guards read it from the validated session. Cookies **HTTP-only,
SameSite=Lax, Secure** (behind the tunnel), signed with `BETTER_AUTH_SECRET`; **DB-backed** sessions
(revocable on logout). Mounted at `/api/auth/[...all]`. The built-in **rate limiter** is enabled (stricter
on sign-in), in-memory (single instance), and the client IP is sourced from **`CF-Connecting-IP`** via the
explicit IP-header option (`advanced.ipAddress.ipAddressHeaders` — **verify the exact option name on the
pinned version**). `BETTER_AUTH_URL` is the public HTTPS URL.

### 2.3 Session helpers + role hierarchy (`session.ts`) (A4, A6, A7)
Hierarchy `viewer(0) < coordinator(1)`; guards compare ranks:
- `getSessionUser(req) → { id, name, role } | null` — authoritative server-side session validation.
- `requireAuth(req)` — any authenticated user, else throws a `401` response.
- `requireOperator(req)` — role ≥ `coordinator`, else `403` (the R7 mutating/agent-run tier).

### 2.4 Middleware — default-deny (`middleware.ts`) (A4, A13)
Matcher covers **every `(app)` page + `/api/*` route**. No valid session → **redirect pages to `/login`**,
**`401`** for APIs. Public allow-list: `/login`, `/api/auth/*`. Middleware does the **optimistic
cookie-presence check** (`getSessionCookie`) only — **it performs no cryptographic/DB validation**; the
wrapped per-route guard (§2.5) is the **sole authoritative** check (route handlers run in the **Node
runtime**, where `better-sqlite3` works).

### 2.5 Authorization — policy + `withPolicy`, every route classified (A6, A7, A13)
`policy.ts` maps each route to a tier; **the default for an unmapped route is `operator`** (most
restrictive). `withPolicy(tier, handler)` wraps a handler so the guard runs first and **cannot be
omitted** — every `route.ts` exports `withPolicy(...)`. Full classification of the 17 on-disk routes:

| Tier | Routes | Guard |
| --- | --- | --- |
| **Operator** (`coordinator`) | `driver/approve`, `driver/reject`, `driver/assess`, `driver/plan`, `sim/actions/expedite_script`, `sim/actions/request_transport`, `sim/step`, `sim/scenario`, `eval/run` | `requireOperator` |
| **Authenticated** (any role) | `sim/state`, `driver/records`, `driver/proposals`, `driver/flags`, `driver/assessment`, `driver/ask`, `sim/forecast/demand`, `sim/forecast/discharges` | `requireAuth` |
| **Public** | `api/auth/*` | none |

> `assess` and `plan` are **operator** (they trigger agent/model runs); `assessment` (poll), `ask`
> (read-only Q&A), and `forecast/*` are **authenticated** reads. This resolves the §3-vs-policy tension the
> review flagged.

**Enforcing enumeration test (A13):** enumerate every `app/api/**/route.ts`; assert each has an **explicit**
entry in `policy.ts` (a route hitting the `operator` *default* with no explicit entry **fails CI**); and for
each, fire an **unauthenticated** request (expect `401`) and a **wrong-role** request (viewer → operator
route, expect `403`) — proving the guard actually executes, not merely that a map entry exists.

### 2.6 Attribution — `DecisionRecord.actor` (A8)
```ts
export interface DecisionActor { id: string; name: string; role: "viewer" | "coordinator" }
export interface DecisionRecord { /* …existing… */ actor?: DecisionActor }
```
`driver.ts` `approve(interventionId, actor?)` / `reject(interventionId, actor?)` write `actor` onto the
`log.add({...})` record (**both paths**). The approve/reject routes read the session user (already required
by `requireOperator`) and pass it. Timeline + `/api/driver/records` render *"Approved by {actor.name}"* when
present; no actor → current anonymous text (old records valid). The snapshot is **denormalized** (not an FK)
— forward-compatible with account deletion in `0.5.0`.

### 2.7 Client rewire (A2, A3, A11, A14)
- `lib/auth.tsx` — `AuthProvider`/`useAuth()` wrap Better Auth's React client (`useSession`), same return
  shape + `user.role`; `login(email,password)` / `logout()` call the client; `localStorage` flag + `MOCK_USER`
  removed.
- `login/page.tsx` — a real email/password form; below it a **"Demo accounts"** note lists the **two**
  seeded credentials (coordinator, viewer) with click-to-fill, using **named, committed, demo-only password
  constants** (A11). Non-leaky error on bad credentials.
- Shell — hide approve/reject + assess controls when `user.role !== "coordinator"`; a **logout** control in
  the shell (A14). Defence-in-depth; the server is the real gate.
- **CSRF:** the hand-written mutating routes verify **`Origin`/`Referer` against `BETTER_AUTH_URL`** (decision 8).

### 2.8 Seed (`seed.ts`) (A1, A9, A11)
**Idempotent**; on an empty store creates two accounts via the KDF path: a **`coordinator`**
(`coordinator@example-hospital.test`, display name "Dr. A. Coordinator / Flow Coordinator") and a
**`viewer`** (`viewer@example-hospital.test`), using **named demo-only password constants** (committed;
acceptable because labelled demo-only, no PII). Re-runs are no-ops.

### 2.9 Docs reconciliation (A15)
- **PRD.md** (Version 1.4.0 → bump): line 44 — replace "No … logins" (auth is now in); adjust the
  deployment note. Add a changelog row.
- **Architecture.md** (Version 1.0.0 → bump): §3 line 66 (there **is** now an auth provider + SQLite store);
  §5 line 208 — add `actor?: DecisionActor` to the `DecisionRecord` interface and note the actor is
  supplied by the **driver/web-session layer** (not the harness); §9 — add the **Cloudflare Tunnel** ingress
  + **SQLite persistence volume**. Add a changelog row. Confirm `OpenCode-Harness.md` needs no change.

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Better Auth** (no admin plugin this release) | Self-hosted, owns data, native email/password + DB sessions, TS-native; admin plugin only needed when superadmin lands (`0.5.0`). | Younger than Auth.js; manages table shape (Drizzle underneath, inspectable). |
| **SQLite via Drizzle** | Real persistence on a volume; inspectable; unblocks roadmap Persistence. | New DB dep + migrations; `PRAGMA foreign_keys` must be set on. |
| **Two roles `viewer < coordinator`** (kept domain noun) | Matches the app's existing operator/auditor split; continuity with "Flow Coordinator"; no superadmin yet. | None material; admin tier deferred. |
| **`withPolicy` wrapper + enforcing enumeration test** | The guard is the sole authoritative check; a wrapper makes omission impossible and the test proves execution (not just map presence). | A little ceremony per route; the policy is the single source of truth. |
| **Default-deny ⇒ operator** | Fail closed; a forgotten route denies. | Must classify every route explicitly so the default never silently hides a real route (the review's `driver/plan` finding). |
| **Attribution snapshot (not FK)** | Audit-trail integrity; forward-compatible with `0.5.0` deletion. | Denormalized value — intentional. |
| **Seed-only accounts (no public sign-up)** | Smallest credible surface for the headline; onboarding is `0.5.0`. | New users need a seed/`0.5.0` invite. |
| **CSRF via Origin/Referer check on custom routes** | Cheap, effective for same-origin fetch; SameSite + Better Auth CSRF cover its endpoints. | A small per-route check. |
| **Split off invites/admin/lifecycle to `0.5.0`** | De-risks the reviewer-facing headline; clean seam; matches one-theme-per-release lineage. | Two releases instead of one. |

## 4. Verification (maps to acceptance criteria)

Fast **unit/integration tests** + a **two-role live walkthrough**.

| Criterion | How verified |
| --- | --- |
| A1 | Test: seeded accounts store a hash, not plaintext; password absent from user/session payloads. |
| A2, A3 | Test: valid creds → session cookie; bad creds → non-leaky reject; session validates across requests; logout invalidates the server session. |
| A4 | Test/walkthrough: unauthenticated GET of an `(app)` page → `/login` (server, JS disabled). |
| A5, A8 | Test: roles persisted; **approve and reject** by a coordinator each write a `DecisionRecord` with the correct `actor`; records API returns it. |
| A6, A7, A13 | Test: the **enforcing enumeration** test — every `app/api/**` route has an explicit policy entry (default fails CI); unauth → `401`, viewer→operator route → `403`, coordinator → `200`; reads allow any authenticated user. |
| A9 | Walkthrough: sign in, restart the container, sign in again without re-seeding. |
| A10 | `npm test` green incl. **S12** (determinism) and **S13** (safety — AUTHORED_FILES extended to the new auth strings); `typecheck`/`lint`/`build` clean. |
| A11 | Walkthrough: login lists the 2 demo accounts; click-to-fill signs in as each. |
| A12 | Test: rapid sign-in attempts from one IP throttled (`429`); a normal attempt unaffected; limiter keys on `CF-Connecting-IP`. |
| A14 | Walkthrough: logout from the shell → `/login`; server session gone. |
| A15 | Review: PRD.md + Architecture.md updated (auth provider, `DecisionRecord.actor`, Cloudflare + SQLite) with bumped versions + changelog rows. |

## 5. Task breakdown (SDD step 3) — the code PR

1. **Deps + config** — add `better-auth`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit` (exact pins);
   `drizzle.config.ts`; `.env.example` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_DB_PATH`).
2. **Data layer** — `src/auth/schema.ts` (user+role, session, account, verification), `db.ts`
   (`PRAGMA foreign_keys = ON`); generate + check in the initial migration.
3. **Better Auth server** — `src/auth/auth.ts` (Drizzle adapter, email/password, role on session, rate
   limiter, `CF-Connecting-IP`, Secure cookie); `app/api/auth/[...all]/route.ts`.
4. **Guards + default-deny** — `session.ts` (`requireAuth`/`requireOperator`); `policy.ts` (classify all 17
   routes; default operator); `withPolicy.ts`; `middleware.ts`.
5. **Apply guards** — wrap every `app/api/**/route.ts` in `withPolicy(tier, handler)` per §2.5; add the
   Origin/Referer CSRF check to the custom mutating routes.
6. **Attribution** — `DecisionRecord.actor` in `types.ts`; thread `actor` through `driver.approve/reject`;
   pass the session user from the approve/reject routes; render the actor in timeline + records.
7. **Client rewire** — `lib/auth.tsx` onto Better Auth; real `login/page.tsx` + 2 demo hints; logout in the
   shell; simplify `(app)/layout.tsx`; role-gate the shell controls.
8. **Seed** — `src/auth/seed.ts` (idempotent: coordinator + viewer, named demo passwords) + an npm script;
   wire into Docker first-boot.
9. **Docker + ingress** — SQLite volume + auth env in `docker-compose.yml`; **un-publish the app port**;
   document the Cloudflare Tunnel ingress (public HTTPS `BETTER_AUTH_URL`, Secure cookies, `CF-Connecting-IP`).
10. **Docs (A15)** — revise + version-bump `PRD.md` and `Architecture.md` per §2.9.
11. **Tests** — the enforcing enumeration test (explicit entry + unauth/wrong-role probes), guards, hashing
    + seed, **approve and reject** attribution, rate-limit (`429`), and **extend `tests/safety.test.ts`
    AUTHORED_FILES** to cover the new auth strings; keep S12 green.
12. **Verify** — full suite + `typecheck`/`lint`/`build`; live two-role walkthrough in Docker.

## 6. Out of scope (restated)

→ **`0.5.0`** (`spec/auth-onboarding/`): invite-gated sign-up + 50-key system, superadmin + admin area +
Better Auth admin plugin, self-service change-password / delete-account.
→ **Later/never**: email verification, forgot-password-via-email, MFA, passkeys, OAuth/social login,
multi-tenant orgs, persisting the simulator/decision records across restart (groundwork only), and any
agent/sim/eval behaviour change beyond the `actor` seam + authorization. Desktop only.
