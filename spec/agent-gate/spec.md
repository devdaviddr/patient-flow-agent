# Spec — Make the human-approval gate structural: scope the agent's sim access to read-only (R7)

| | |
| --- | --- |
| **Feature** | Restrict the OpenCode agent's SIM **service token** to **read-only** simulator routes, so the only path to a simulator state change is the driver's **item-by-item human-approval gate**. Closes the bypass where the agent could mutate state server-to-server without an approval. |
| **Issue** | [#42](https://github.com/devdaviddr/ai-patient-flow-orchestrator/issues/42) · **P0 / CRITICAL** · milestone *Security & Auth Hardening* |
| **Target release** | `0.5.1` (security patch) |
| **Status** | 📝 SDD step 1 (Specify) |
| **Branch** | `fix/agent-gate` (plan) → `fix/agent-gate-impl` (code) |
| **Companions** | `spec/auth/` (the service-token seam it tightens), `docs/PRD.md` (R7), `docs/Architecture.md` (§3, §7), `CLAUDE.md` (R7 prohibition) |

> SDD step 1: *what* this fixes and *why*, plus acceptance criteria and scope. No implementation
> detail — that lives in `implementation.md`. Found by the E2E review (path traced + confirmed by hand).

---

## 1. Problem

The project's core safety guarantee (R7) is: **the agent proposes; a human approves every state change,
item-by-item, in our driver.** `CLAUDE.md` makes this a hard rule — *"DO NOT change state without
item-by-item human approval in our driver (R7); never rely on OpenCode's `ask`."*

Today there are **two doors to mutate the simulator**, and the human gate guards only one:

1. **Intended (gated):** UI → `POST /api/driver/approve` → `Driver.approve()` → `sim.resolveBlocker()`.
   Human-attributed, recorded in a `DecisionRecord`.
2. **Ungated:** the orchestrator's `expedite_script` / `request_transport` **action tools** do a
   server-to-server `fetch` to `POST /api/sim/actions/*` carrying the **SIM service token**. That route is
   `withPolicy("operator")`; the service principal presents as **`role: "coordinator"`**, so it clears the
   operator check. `checkSameOrigin` passes (the tool sends no `Origin` header). `resolveBlocker()` then
   runs on the **same simulator singleton** the driver reads.

The token is scoped to `/api/sim/*` — but that prefix **includes the mutating routes** (`/actions/*`,
`/step`, `/scenario`), not just the read routes the agent actually needs. The **only** thing standing
between the agent and an unapproved mutation is OpenCode's harness `ask` permission — exactly the thing
`CLAUDE.md` says must never be the real gate. In headless `opencode serve` there is no human to answer
`ask`.

**Two invariants are at risk, not one:**

- **R7 (human approval).** A path-2 mutation changes beds with no human in the loop.
- **R10 (audit trail).** A path-2 mutation produces **no `DecisionRecord` and no `actor`** — the
  `DecisionLog` only records what flows through `Driver.approve()/reject()`. A silent, unattributed change.

The gate is currently true *by the agent's good behaviour plus a harness setting*. It must be true **by
construction.**

## 2. How this fits the solution

- **It hardens R7, it does not change it.** The agent loop, simulator, tools' read behaviour, driver, and
  eval keep their behaviour. We narrow *what the agent's credential is allowed to reach*.
- **It reuses the existing authorization model.** `policy.ts` already classifies sim routes correctly:
  the read routes (`state`, `forecast/*`) are tier **`authenticated`**; the mutating routes
  (`actions/*`, `step`, `scenario`) are tier **`operator`**. The fix makes the service token confer only
  the **read** tier — so the existing classification does the work; no new policy surface.
- **It restores the audit guarantee for free.** Once path 2 is closed, **every** simulator mutation flows
  through `Driver.approve()`, so every change carries a `DecisionRecord` with an `actor` (R10) by
  construction.
- **It keeps the safety boundary.** No change to synthetic data, no clinical output, no model seeding. The
  auth/SQLite layer stays disjoint from the seeded simulator — S12 untouched.

## 3. Users

- **The coordinator (in-world Flow Coordinator)** — must remain the *only* actor who can move beds; the
  agent must never move them without their approval.
- **The technical reviewer (real audience)** — should see that "a human approves every state change" is an
  architectural fact, provable by a test, not a behavioural hope resting on a harness `ask`.
- **The agent** — keeps full read access (perceive + forecast) and keeps *proposing* interventions; it
  simply can no longer *execute* them.
- **The developer** — needs the fix to land without regressing the agent loop, the existing suite, S12, or
  S13.

## 4. User stories

- As a **coordinator**, when the agent proposes an expedite, **nothing changes** until I approve it — even
  if the agent (or a buggy/compromised harness) tries to call the action tool directly.
- As an **auditor**, **every** bed change in the decision timeline has a name against it; there is no path
  that produces an unattributed change.
- As the **agent**, I can still read the world (`world_state`) and call the forecast tools to reason, and I
  still return a ranked plan — I just cannot reach a mutating endpoint.
- As a **reviewer**, I can read one test that fires the agent's own service token at every mutating sim
  route and see it **refused**, proving the gate is structural.

## 5. Acceptance criteria

| # | Criterion |
| --- | --- |
| **G1** | **Read access intact.** With the service token and **no browser session**, the agent is admitted (not 401/403) on the read-only sim routes it uses: `GET /api/sim/state`, `POST /api/sim/forecast/discharges`, `POST /api/sim/forecast/demand`. |
| **G2** | **Mutating routes refused.** With the service token and no session, **every** mutating sim route is **refused** and performs **no state change**: `POST /api/sim/actions/expedite_script`, `POST /api/sim/actions/request_transport`, `POST /api/sim/step`, `POST /api/sim/scenario`. |
| **G3** | **Still worthless off the sim path.** The token remains refused on all non-sim routes (`/api/driver/*`, `/api/admin/*`, `/api/account/*`) — unchanged from today. |
| **G4** | **Least privilege.** The service principal is no longer `coordinator`; it carries the least-privileged role compatible with the read routes, and **no code path depends on the old `coordinator` role**. |
| **G5** | **Gate is structural (R7 + R10).** The **only** path to a simulator mutation is `Driver.approve()/reject()`; therefore every mutation produces a `DecisionRecord` with an `actor`. Asserted by test, not by inspection. |
| **G6** | **Agent loop still works end-to-end.** Perceive (`world_state`) and both forecast tools succeed; the orchestrator returns a parseable plan; a human approve still moves the bed-board. **No change** to `.opencode/tools/*`, agent prompts, the simulator, or eval. |
| **G7** | **No regressions / safety intact.** Full suite green incl. the **extended** `auth-policy` enumeration test; `typecheck`/`lint`/`build` clean; **S12** (determinism) and **S13** (no clinical output) unaffected. |

## 6. Scope

### In scope
- **`src/auth/session.ts`** — the service-token authorization: admit the principal **only** on an explicit
  read-only sim allow-list; **default-deny** every other path (including mutating sim routes); downgrade
  the principal to least privilege. Update the now-inaccurate code comment.
- **`tests/auth-policy.test.ts`** — extend the existing *"agent → sim service token"* block with the G2
  refusal cases (each mutating sim route) and a G1 case for the forecast routes; keep G3.
- **Docs reconciliation** — if `docs/Architecture.md` (§3/§7) describes the token as operator-scoped,
  correct it to **read-only** and version-bump per the "docs win; bump on change" rule.

### Out of scope → follow-ups (separate issues)
- **Redesigning the action tools into pure propose-only stubs** that never call a mutating endpoint. The
  token scoping already renders the tools harmless (their `fetch` now 401s); converting them to stubs is a
  cleanup, not a safety requirement. *(Optional small follow-up.)*
- **Removing the harness `ask` permission.** Keep it as defence-in-depth — it is no longer the *real* gate.
- Decision-record persistence (#33), assessment timeout (#48), LLM-route rate limiting (#47), the other
  review findings — independent issues.

### Out of scope (never, here)
- Any change to the simulator, the agent's reasoning/prompts, the eval, or the approval UX. Determinism and
  the clinical-safety boundary are untouched.

## 7. Dependencies & assumptions

- **No blocking dependency.** This is self-contained in the auth layer and should land **first** among the
  hardening issues (it is the only P0).
- Builds on the existing `withPolicy` + `policy.ts` classification (from `0.4.0`, `spec/auth/`), which
  already separates read (`authenticated`) from mutating (`operator`) sim routes — the fix relies on that
  separation being correct (it is; guarded by the enforcing enumeration test).
- The agent's read tools call exactly three sim endpoints (`/state`, `/forecast/discharges`,
  `/forecast/demand`); the action tools call `/actions/*`. Confirmed by reading `.opencode/tools/*`.
- Synthetic only; no PII; the auth layer never read by the seeded simulator → S12 structurally safe.

## 8. Resolved decisions (detail in `implementation.md`)

1. **Default-deny allow-list, not a deny-list.** The token is honoured only on an explicit set of
   read-only sim paths; everything else (mutating sim routes included) falls through to the session check.
   Fail-closed, consistent with `policy.ts`'s "unclassified ⇒ most restrictive" philosophy.
2. **Also downgrade the principal to least privilege** (belt-and-braces): even within the allowed paths it
   should not carry operator rank, so a future misclassification can't hand it a mutating route.
3. **Refusal semantics = `401`** on mutating sim routes (the token is simply *not a credential* there),
   matching the existing *"worthless off the sim path → 401"* behaviour — one uniform mental model.
4. **Keep the action tools as-is** for this PR (their `fetch` now refused), and keep the harness `ask` —
   both become redundant defence-in-depth. Surgical change; stub redesign deferred.
5. **Docs win.** Reconcile any operator-scoped description of the token to read-only and bump the doc.
