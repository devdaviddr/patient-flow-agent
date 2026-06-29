# Implementation — Scope the agent's sim access to read-only (R7 gate)

| | |
| --- | --- |
| **Spec** | `spec/agent-gate/spec.md` |
| **Issue** | [#42](https://github.com/devdaviddr/ai-patient-flow-orchestrator/issues/42) · P0 / CRITICAL |
| **Status** | 📝 SDD step 2 (Design) — no code until the plan PR is approved |
| **Surface** | One function + one constant in `src/auth/session.ts`; one test block in `tests/auth-policy.test.ts`. No new deps, no schema/migration, no API surface change. |

> SDD step 2: *how*. The design, the exact change, the test plan, the verification gates, and the rejected
> alternatives. Implementation lands in the **code PR** (`fix/agent-gate-impl`) after this is approved.

---

## 1. Approach in one paragraph

`policy.ts` already classifies the sim routes correctly: the **read** routes (`state`, `forecast/*`) are
tier `authenticated`; the **mutating** routes (`actions/*`, `step`, `scenario`) are tier `operator`. The
only reason the agent's token can reach a mutating route is that `simServiceCaller` admits it on the whole
`/api/sim/*` prefix **and** the principal carries `role: "coordinator"` (operator rank). We fix both with a
**default-deny allow-list** (the token is a credential only on the three read paths the agent actually
uses) plus a **least-privilege principal** (`viewer`, never operator). After this, the mutating routes have
exactly one caller — `Driver.approve()/reject()` running in-process — so R7 and R10 hold **by
construction**, provable by a test.

## 2. The change — `src/auth/session.ts`

### 2.1 Replace the prefix scope with an explicit read-only allow-list

**Today** (admits the token on the entire sim subtree, including mutating routes):

```ts
const SIM_PATH_PREFIX = "/api/sim"
// …
const { pathname } = new URL(req.url)
if (pathname !== SIM_PATH_PREFIX && !pathname.startsWith(`${SIM_PATH_PREFIX}/`)) return null
return SIM_SERVICE_PRINCIPAL
```

**After** (default-deny; the token is a credential only on the agent's three read endpoints — confirmed
against `.opencode/tools/{world_state,forecast_discharges,forecast_demand}.ts`, which call
`SIM_URL/state`, `SIM_URL/forecast/discharges`, `SIM_URL/forecast/demand`):

```ts
// The agent's READ tools reach exactly these three sim endpoints. The token is a
// credential ONLY here — never on the mutating sim routes (/actions/*, /step,
// /scenario), which change beds and stay reachable solely through the driver's
// human-approval gate (R7). Fail-closed: any other path → not a credential.
const SIM_SERVICE_READONLY_PATHS = new Set<string>([
  "/api/sim/state",
  "/api/sim/forecast/discharges",
  "/api/sim/forecast/demand",
])
// …
const { pathname } = new URL(req.url)
if (!SIM_SERVICE_READONLY_PATHS.has(pathname)) return null
return SIM_SERVICE_PRINCIPAL
```

`SIM_PATH_PREFIX` is removed (no other reference).

### 2.2 Downgrade the principal to least privilege

```ts
// Least-privileged synthetic principal: the token grants READ access to the sim
// only, so the principal carries `viewer` (the authenticated, non-operator tier).
// It can never clear an operator check, so even a future route misclassification
// can't hand the agent a mutating endpoint. (Belt-and-braces with the allow-list.)
export const SIM_SERVICE_PRINCIPAL: SessionUser = {
  id: "svc-agent",
  name: "Agent (service)",
  role: "viewer",          // was: "coordinator"
}
```

The stale comment block above the constant (*"Presents as an operator-level synthetic principal"*) is
rewritten to describe the read-only scope.

### 2.3 Why this is sufficient (trace)

| Route | `policy.ts` tier | In allow-list? | Token outcome |
| --- | --- | --- | --- |
| `GET /api/sim/state` | `authenticated` | ✅ | principal returned → `requireAuth` passes → **admitted** |
| `POST /api/sim/forecast/discharges` | `authenticated` | ✅ | admitted |
| `POST /api/sim/forecast/demand` | `authenticated` | ✅ | admitted |
| `POST /api/sim/actions/expedite_script` | `operator` | ❌ | `simServiceCaller` → `null` → no session → **401** |
| `POST /api/sim/actions/request_transport` | `operator` | ❌ | **401** |
| `POST /api/sim/step` | `operator` | ❌ | **401** |
| `POST /api/sim/scenario` | `operator` | ❌ | **401** |
| `POST /api/driver/approve` (and all non-sim) | `operator`/… | ❌ | **401** (unchanged) |

The allow-list is the primary guard (mutating routes → `null` → 401). The `viewer` role is the second
wall: were any mutating route ever added to the allow-list by mistake, `requireOperator` would still reject
the viewer principal with 403. Two independent layers, both fail-closed.

## 3. Tests — `tests/auth-policy.test.ts`

Extend the existing `describe("agent → sim service token …")` block (currently lines ~222–271). The harness
(`fire(pathname, token)` — fires the route handler with the token header and no session) already exists; we
add cases:

- **G1 (read still works):** assert `fire("/api/sim/forecast/discharges", TOKEN)` and
  `fire("/api/sim/forecast/demand", TOKEN)` are **not** 401/403 (the existing `/api/sim/state` case stays).
- **G2 (mutations refused, parametrised):** for each of
  `["/api/sim/actions/expedite_script", "/api/sim/actions/request_transport", "/api/sim/step", "/api/sim/scenario"]`,
  assert `fire(path, TOKEN).status === 401`.
- **G2 (no state change):** for one action route, capture `getSimulator().getState()`, fire it with the
  token, and assert the state is byte-identical (`JSON.stringify` equal) — the refusal didn't mutate.
- **G3:** the existing *"worthless off the sim path → driver stays 401"* case is retained unchanged.
- Update the `describe` title to *"agent → sim service token (read-only sim routes only)"* and the block
  comment to match the new scope.

The **enforcing enumeration test** elsewhere in the file is unaffected — route classification is unchanged;
we only changed which routes the token is a credential for.

### New unit-level guard (optional, cheap)

Add a tiny assertion that `SIM_SERVICE_PRINCIPAL.role === "viewer"` so a future well-meaning bump back to
`coordinator` trips a red test with a comment pointing here.

## 4. What does NOT change (and why that's the point)

- **`.opencode/tools/*.ts`** — untouched. The action tools' `fetch` now receives a 401 and returns their
  existing `{ error: "simulator returned 401" }` shape. The orchestrator is already instructed to *propose,
  not execute* (`PLAN_INSTRUCTION` in `adapter.ts`), and the harness keeps `ask` on those tools — so in
  normal operation the tools aren't called anyway; the 401 is the safety net for when something tries.
- **`opencode.json`** — the `ask` permission stays as defence-in-depth (no longer the real gate).
- **Simulator, driver, eval, UI, prompts** — untouched. `Driver.approve()` is now the *sole* writer, which
  is exactly the invariant we want.
- **Docs** — `grep` confirms the service token is **not described** in `PRD.md` / `Architecture.md` /
  `OpenCode-Harness.md` (it arrived in a post-`0.5.0` fix). So there is **nothing to correct**; optionally
  add a one-line note to `Architecture.md §7` that the agent's sim credential is read-only, version-bumped.
  Treated as optional — not gating this PR.

## 5. Verification

- **Unit:** `npm test` — the extended `auth-policy` block green; full suite (currently 174) stays green.
- **Gates:** `npm run typecheck && npm run lint && npm run build` clean.
- **Invariants:** `tests/determinism.test.ts` (S12) and `tests/safety.test.ts` (S13) untouched and green.
- **Live (Docker):** sign in as coordinator → run an assessment (agent still perceives + forecasts +
  proposes) → approve an intervention → bed-board changes. Then, manually, `curl` a mutating sim action
  with the service token and confirm **401** with no board change:
  ```
  curl -i -X POST http://localhost:3000/api/sim/actions/expedite_script \
    -H "content-type: application/json" -H "x-sim-service-token: $SIM_SERVICE_TOKEN" \
    -d '{"patientId":"<id>"}'      # expect HTTP/1.1 401, state unchanged
  ```

## 6. Risks & mitigations

- **Risk: an agent read tool calls a sim path not in the allow-list → agent loop breaks (G6).** Mitigated:
  the three paths were confirmed by reading all three read tools; a missed path would fail the live check
  immediately. If a *new* read tool/endpoint is added later, it must be added to the allow-list — the same
  fail-closed discipline `policy.ts` already imposes (documented in the code comment).
- **Risk: a consumer depended on the principal being `coordinator`.** Checked: the principal is consumed
  only by the guards (`requireAuth`/`requireOperator`) and is never used for attribution (the token can't
  reach approve/reject). `grep` for `SIM_SERVICE_PRINCIPAL` shows no role-specific consumer. Low risk.
- **Risk: refusal status mismatch breaks a caller expecting a specific code.** The action tools treat any
  non-`ok` as an error string; 401 vs 403 is immaterial to them.

## 7. Rejected alternatives

1. **Deny-list the mutating routes instead of allow-listing the read routes.** Rejected — a new mutating
   sim route added later would be reachable until someone remembered to deny it. Allow-list fails closed.
2. **Only downgrade the role to `viewer`, keep the `/api/sim/*` prefix scope.** This *does* block the
   mutating routes today (they're operator-tier → viewer 403). Rejected as the *sole* mechanism because it
   leaves the token a valid credential across the whole sim subtree, so a misclassified mutating route
   would leak; and it yields 403 (authenticated-but-forbidden) rather than the cleaner "not a credential
   here → 401". We keep the role downgrade only as the second layer.
3. **Convert the action tools to propose-only stubs (no mutating fetch at all).** A clean end-state, but a
   change to the agent's tool contract + prompts — larger blast radius than a P0 security fix warrants.
   Deferred to an optional follow-up; the token scoping already makes the tools harmless.
4. **Remove the harness `ask`.** Rejected — it's now harmless defence-in-depth; removing it reduces layers
   for no gain.

## 8. Rollout

- Plan PR (`fix/agent-gate`): these two docs only. Merge first.
- Code PR (`fix/agent-gate-impl`): the `session.ts` change + the test extension + `releases/0.5.1.md`.
  Closes #42.
