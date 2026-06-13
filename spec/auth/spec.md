# Spec — Authentication & attributed approvals (the auth headline)

| | |
| --- | --- |
| **Feature** | Replace the mock client-side auth with real, self-hosted authentication: seeded accounts with hashed passwords, server-side sessions, a **two-role hierarchy** (`viewer` / `coordinator`), **fail-closed** server-side route + action protection, and **attributed decision records** (every approval carries an actor). |
| **Target release** | `0.4.0` |
| **Status** | 📝 Planned → building (post-review) |
| **Branch** | `feat/auth` (plan) → `feat/auth-impl` (code) |
| **Companions** | `releases/0.3.0.md`, `docs/Architecture.md`, `docs/PRD.md` (both updated by this release — A15) |
| **Sequel** | `spec/auth-onboarding/` (`0.5.0`): invite-gated sign-up, superadmin + admin area, self-service change-password / delete-account — **deferred here on review advice** (split a clean seam; ship the reviewer-facing headline first). |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md`. **Scoped down after a multi-agent review**
> (verdict: needs-changes; the split + the must/should fixes are folded in below).

---

## 1. Problem

`0.3.0` shipped a professional shell with **mock auth on purpose**: a single hardcoded `MOCK_USER`, a
`localStorage` flag (`pfo.authed`), no credentials, and a **client-side** route guard
(`src/app/lib/auth.tsx`). That leaves three honest gaps for a portfolio piece judged by reviewers:

1. **There is no real auth.** Anyone can "sign in"; nothing is verified; the guard is a client redirect a
   reviewer can bypass by hitting an API route directly.
2. **Approvals are anonymous.** The app's identity is the **human-in-the-loop approval gate** (R7 — a
   coordinator approves every agent action, recorded in `DecisionRecord`). Today those records have no
   actor: the audit trail can't answer *"who approved this expedite?"*
3. **The mutating API routes are open.** `approve`, `reject`, the sim actions, `step`, `scenario` change
   state with no authentication or authorization.

This release makes auth **real and self-hosted** — credible, modern, deliberately **not prod-grade** — and
uses identity to make the governance story legible: **attributed, role-gated approvals enforced on the
server, fail-closed.** Onboarding (invites) and administration (superadmin) are a deliberate follow-up
(`0.5.0`), so this release stays one tight theme: *auth becomes real; approvals get a name.*

## 2. How this fits the solution

- **It hardens the human-approval gate (R7), it does not change it.** Agent loop, simulator, driver,
  tools, eval keep their behaviour; we add *identity* + *authorization* around the approval seam.
- **It gives the audit trail an actor.** `DecisionRecord` gains an `actor`; the timeline + records read
  *"Approved by Dr. A. Coordinator."* The differentiated, portfolio-worthy part.
- **It enforces protection on the server, fail-closed.** Default-deny middleware + a central route→role
  policy + a `withPolicy` wrapper so a guard can't be omitted — every on-disk route is classified.
- **It updates the authoritative docs.** PRD.md and Architecture.md (which currently scope auth *out*) are
  revised and version-bumped in this release — per the project's "docs win; bump on change" rule.
- **It keeps the safety boundary.** Synthetic users, fake `.test` emails, **no real PII**; auth records
  carry staff identity only — never clinical data (S13). The auth/SQLite layer is **disjoint from the
  seeded simulator**, so determinism (S12) is structurally untouched.
- **It self-hosts cleanly** behind a Cloudflare Tunnel (introduced this release): TLS at the edge, SQLite
  on a volume; no third-party auth SaaS.

## 3. Roles

A two-tier hierarchy — `coordinator` can do everything `viewer` can, plus the operational workflow:

| Role | Capabilities |
| --- | --- |
| **`viewer`** | Read-only: watch the bed-board, proposals, KPIs, decision timeline; ask read-only Q&A. **No** state changes and **no** agent runs. |
| **`coordinator`** | Everything `viewer` can, **plus the operator workflow**: trigger an **assessment / plan** (agent/model runs), **approve/reject** interventions, run sim actions / step / scenario, run the eval. The R7 operator (the in-world "Flow Coordinator"). |

> Naming: the domain noun `coordinator` is kept (continuity with `0.3.0`'s "Flow Coordinator"). The
> administrative `superadmin` tier and user management arrive in `0.5.0`.

## 4. Users

- **The coordinator (in-world "Flow Coordinator")** — signs in, approves/rejects agent actions, and sees
  their name attached to the decisions they make.
- **The viewer / auditor** — signs in read-only; watches the board and the decision trail; cannot change
  state or trigger agent runs.
- **The technical reviewer (real audience)** — should see real, self-hosted auth done soundly: hashing,
  server sessions, fail-closed server-side authorization, least privilege, attributed approvals.
- **The developer** — needs auth added without regressing the verified agent loop, determinism (S12),
  safety (S13), or the existing test suite.

## 5. User stories

- As a user, I land on a **login screen** and sign in with a **real email + password**; bad credentials
  are rejected with a clear, non-leaky message.
- As a signed-in user, my session is **server-side**, survives a reload, and **logout** (reachable in the
  app) ends it.
- As an unauthenticated visitor, hitting any app page **or** a protected API route is **rejected by the
  server** (redirect to `/login` for pages, `401` for APIs) — not just a client redirect.
- As a **coordinator**, I approve/reject the agent's interventions and trigger sim actions; each
  approval/rejection is **recorded against my name**.
- As a **viewer**, the approve/reject and assess controls are unavailable, and a direct API call to a
  mutating or agent-run route is **refused (`403`)** — I read everything, change nothing.
- As anyone reviewing the system, the **decision timeline and records show who made each decision**.
- As the demo presenter, the **login screen lists the two seeded demo accounts** (coordinator, viewer) so
  a reviewer can sign in as either in one click.

## 6. Acceptance criteria

| # | Criterion |
| --- | --- |
| A1 | **Real accounts.** Seeded accounts with **hashed** passwords (a vetted KDF). No plaintext password is stored, logged, or returned anywhere. |
| A2 | **Email/password sign-in.** Valid credentials establish a session; invalid credentials get a **non-leaky** error. Handled by Better Auth. |
| A3 | **Server-side session.** A **server-validated, HTTP-only, SameSite, Secure** (behind the tunnel) cookie backed by a session record; survives reload; **logout destroys the server session**. |
| A4 | **Server-enforced page protection.** Unauthenticated visits to `(app)` routes are redirected to `/login` by **middleware**, replacing the `0.3.0` client guard. |
| A5 | **Two roles.** Every account has a role in `viewer ⊂ coordinator`, stored with the account and carried on the session. |
| A6 | **Role-gated operations (R7, server-side).** Only a **coordinator** can approve/reject, mutate sim state, or trigger agent runs (assess/plan). A **viewer** or unauthenticated caller is refused **`403`** even via a direct API call; UI controls are hidden for viewers. |
| A7 | **Every route explicitly classified.** All 17 on-disk `/api/*` routes are assigned a tier (see implementation §2.5): **operator** (`coordinator`) — `approve`, `reject`, `assess`, `plan`, `sim/actions/*`, `sim/step`, `sim/scenario`, `eval/run`; **authenticated** (any role) — `sim/state`, `driver/records`, `driver/proposals`, `driver/flags`, `driver/assessment`, `driver/ask`, `sim/forecast/*`; **public** — `api/auth/*`. No route relies on the default. |
| A8 | **Attributed decisions.** Every `DecisionRecord` from an **approve or reject** carries an **`actor`** (`{ id, name, role }`). The timeline + `/api/driver/records` show who decided. The `actor` is a **denormalized snapshot** (forward-compatible with deletion in `0.5.0`). |
| A9 | **Persistence.** Accounts + sessions live in **SQLite** on a mounted volume and **survive a container restart**; sign-in works across restarts without re-seeding. |
| A10 | **No regressions / safety intact.** Existing suite green; **S12 (determinism)** unaffected (auth layer disjoint from the seeded sim); **S13 (no clinical output)** green, with the safety scan's authored-file list **extended to cover the new auth strings** (seed display titles, login UI copy). `typecheck`/`lint`/`build` clean. |
| A11 | **Demo affordance.** The login screen lists the **two seeded demo accounts** (coordinator, viewer) with **named, committed, demo-only passwords** and click-to-fill. Marked demo-only; no PII. |
| A12 | **Rate-limited sign-in.** The sign-in endpoint is **rate-limited per IP** (`429` on abuse), keyed on the **real client IP (`CF-Connecting-IP`)** behind the tunnel. |
| A13 | **Fail-closed authorization.** Default-deny: middleware requires a session for every `(app)` page + `/api/*` route except the public allow-list; the central policy defaults any **unclassified** route to the **most restrictive tier**; handlers are wrapped by a **`withPolicy`** helper so a guard **cannot be omitted**; a test **enumerates every `app/api/**` handler, asserts an explicit policy entry (the default fails CI), and fires unauthenticated + wrong-role requests asserting `401`/`403`**. |
| A14 | **In-app logout.** Logout is reachable from the app shell at any time and ends the server session. |
| A15 | **Authoritative docs reconciled.** `PRD.md` (remove "no logins") and `Architecture.md` (auth provider in §3; `DecisionRecord.actor` in §5; Cloudflare ingress + SQLite volume in §9) are **revised and version-bumped** with changelog rows — per the "docs win; bump on change" rule. |

## 7. Scope

### In scope
- **Better Auth** (self-hosted) email/password over a **SQLite/Drizzle** store on a Docker volume; a
  **seed** for the two demo accounts (no public sign-up this release — accounts are seed-only).
- **Server sessions** (HTTP-only, Secure, DB-backed) replacing the `localStorage` flag; **logout**.
- The **two-role hierarchy** (`viewer`/`coordinator`) on the session.
- **Default-deny `middleware.ts`** + a **central route→role policy** + a **`withPolicy` wrapper**, with
  **every on-disk route explicitly classified** and an **enforcing enumeration test**.
- **`DecisionRecord.actor`** threaded through `approve`/`reject`; surfaced in timeline + records API.
- **Rate-limited sign-in** keyed on `CF-Connecting-IP`.
- **Client rewire**: `lib/auth.tsx`, the login page (real + demo hints), logout, role-gated shell controls.
- **Docs**: revise + version-bump PRD.md and Architecture.md.
- **Deploy**: introduce the Cloudflare Tunnel ingress + SQLite volume to the Docker stack.

### Out of scope → `0.5.0` (`spec/auth-onboarding/`)
- **Invite-gated sign-up + the 50-key system**, **superadmin tier + admin area + Better Auth admin
  plugin**, **self-service change-password / delete-account**.

### Out of scope (later / never)
- Email verification, forgot-password-via-email, MFA, passkeys, OAuth/social login (all need infra),
  multi-tenant orgs, persisting the simulator/decision records across restart (groundwork only here), and
  any agent/sim/eval behaviour change beyond the `actor` seam and the authorization checks. Desktop only.

## 8. Dependencies & assumptions

- Builds on the `0.3.0` shell and the existing `/api/*` routes — reused, re-guarded, not rewritten.
- Adds **Better Auth**, **Drizzle ORM**, a **SQLite driver**, each pinned **exact** (repo rule).
- Requires `BETTER_AUTH_SECRET` (strong, gitignored `.env`), `BETTER_AUTH_URL` (the public HTTPS URL), and
  `AUTH_DB_PATH` (a file on a mounted volume).
- **Single self-hosted instance** behind a **Cloudflare Tunnel** (introduced this release): TLS at the
  edge → `Secure` cookie holds; the origin is **not directly routable** (app port un-published; cloudflared
  dials outbound) so `CF-Connecting-IP` can be trusted for rate-limit keying. Cloudflare WAF/DDoS is
  defence-in-depth; the app's own authn/authz is the source of truth.
- **Determinism boundary (invariant):** the auth/SQLite layer is disjoint from the seeded in-process
  simulator and is never read by sim/forecast code — S12 is structurally unaffected.
- Synthetic accounts only — `.test` emails, **no real PII**.

## 9. Resolved decisions (detail in implementation.md)

1. **Library** → **Better Auth** (self-hosted, owns its data, native email/password + DB sessions,
   TypeScript-native). Over Auth.js (Credentials forces JWT), hand-rolled (plumbing without domain value),
   and SaaS (undercuts self-hosting). The **admin plugin is *not* pulled in this release** (no superadmin
   until `0.5.0`).
2. **Store** → **SQLite via Drizzle** on a volume — survives restart, inspectable; groundwork for the
   roadmap Persistence item.
3. **Sessions** → **DB-backed, HTTP-only, SameSite, Secure cookie** (not JWT) — server-revocable.
4. **Roles** → two-tier `viewer ⊂ coordinator` on the session; guards `requireAuth` / `requireOperator`.
   Domain noun kept (`coordinator`, not `user`).
5. **Enforcement** → default-deny **middleware** (pages + `/api/*`); a **central policy** + a **`withPolicy`
   wrapper** so guards can't be omitted; unclassified ⇒ most restrictive; an **enforcing** enumeration test
   (explicit entry required; fires unauth/wrong-role probes). `getSessionCookie` in middleware is an
   **optimistic** check only — the wrapped route guard is the **sole authoritative** check (Node runtime,
   where `better-sqlite3` runs).
6. **Attribution** → `DecisionRecord.actor: { id, name, role }`, a **denormalized snapshot**; approve/reject
   routes read the session and pass it into the driver. Both approve **and reject** are covered.
7. **Demo accounts** → seed **two** (coordinator, viewer) with **named, committed demo-only passwords**;
   surface both on the login screen with click-to-fill. (No superadmin to advertise this release.)
8. **CSRF** → SameSite + Better Auth's CSRF token cover its endpoints; the hand-written mutating routes
   additionally **verify `Origin`/`Referer` against `BETTER_AUTH_URL`** (cheap, effective for same-origin
   fetch) — stated as the explicit CSRF posture.
9. **Rate limiting** → Better Auth's limiter on sign-in, per-IP, in-memory (single instance), sourced from
   `CF-Connecting-IP` via the explicit IP-header config (verified against the pinned version).
10. **Docs win** → PRD.md + Architecture.md revised and version-bumped this release (A15).
