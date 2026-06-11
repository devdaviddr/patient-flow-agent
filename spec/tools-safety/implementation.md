# Implementation Plan — Tools + Safety

| | |
| --- | --- |
| **Feature** | Tools bridge (real forecasts & actions) + safety invariant |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (C1–C9) — code PR open |
| **Implements** | `spec.md` (same folder) |

> Spec-Driven Development, step 2 (Plan): *how* the spec is built — layout, key decisions/trade-offs,
> and how each acceptance criterion (C1–C9) is met and verified. Task breakdown at the end.

---

## 1. Architecture

No new components — this fills in behaviour behind the existing simulator endpoints and harness tools,
and adds one test. The forecast logic and action effects live in the **simulator** (the only
hospital-aware code); the harness tools stay thin HTTP callers.

```
src/sim/
  forecast.ts        # CHANGE: stub functions -> real, state-aware heuristics (+ rationale)
  simulator.ts       # ADD: resolveBlocker(patientId, blocker) -> applies a blocker_resolved event
src/app/api/sim/
  forecast/discharges/route.ts   # CHANGE: call real forecast with live state
  forecast/demand/route.ts       # CHANGE: "
  actions/expedite_script/route.ts    # CHANGE: call resolveBlocker(..., 'pharmacy_script')
  actions/request_transport/route.ts  # CHANGE: call resolveBlocker(..., 'transport')
.opencode/tools/
  forecast_discharges.ts, forecast_demand.ts,
  expedite_script.ts, request_transport.ts, world_state.ts   # CHANGE: drop mock/stub fallback,
                                                             #         return a clear error on failure
tests/
  safety.test.ts     # NEW: no-clinical-vocabulary invariant (S13)
  forecast.test.ts   # NEW: forecast shape + determinism; action effect + no-op
```

## 2. Component design

### 2.1 Forecast heuristics — `src/sim/forecast.ts`
Pure functions over `WorldState`, transparent and deterministic.

- `forecastDischarges(state, wardId, horizonHrs)` → for each patient in `wardId` whose
  `predictedDischarge.at` falls within `[state.at, state.at + horizonHrs]`: emit `{ patientId, at,
  ready, blocker, rationale }`. The `rationale` is built from logistics facts only, e.g.
  *"Predicted discharge 14:00; ready — no blocker"* or *"Predicted 14:00 but not ready — waiting on
  transport"*. (C1)
- `forecastDemand(state, wardId, horizonHrs)` → `expectedAdmissions = edQueue.length +
  round(ASSUMED_ARRIVALS_PER_HOUR × horizonHrs)`, with a rationale naming both terms, e.g.
  *"3 waiting in ED now + ~12 expected arrivals over 8h"*. A fixed assumed rate keeps it a transparent
  rule that reads only `WorldState` (it does not peek at scenario internals). (C2)

Both are pure ⇒ same state + args ⇒ same output. (C3)

### 2.2 Action effects — `src/sim/simulator.ts`
Add `resolveBlocker(patientId, blocker): ActionResult`:
- find the patient; if `patient.blocker === blocker`, fold a `blocker_resolved` event (at `state.at`)
  through `reduce` and return `{ applied: true, patientId, blocker, event }`;
- otherwise return `{ applied: false, patientId, reason }` and **leave state unchanged** — the safe
  no-op. (C4, C5, C6)

The action routes map their fixed blocker type: `expedite_script → pharmacy_script`,
`request_transport → transport`.

### 2.3 Harness tools — `.opencode/tools/*.ts`
Remove the mock/stub fallback branches. On a failed fetch, return a clear error payload
(`{ error: "simulator unreachable at SIM_URL" }`) so the agent sees the failure instead of fabricated
state. Real endpoints become the only path. (C7)

### 2.4 Safety invariant — `tests/safety.test.ts`
Assemble a corpus from: the five tool files, the three agent `.md` prompts, and **generated samples** —
`getState()` JSON plus `forecastDischarges`/`forecastDemand` outputs (so rationales are included).
Assert none of the denylist terms (whole-word, case-insensitive) appear. Department/logistics words
stay allowed. (C8, S13)

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Forecast logic in `src/sim`, not the route** | Keeps all hospital-aware logic in one place behind the tools; routes stay thin; unit-testable without HTTP. | Routes must thread live state in (trivial). |
| **Each action clears only its own blocker; else no-op** | Predictable, safe, mirrors reality (expediting a script can't fix a transport gap); no fabricated effects. | The agent may call an action that no-ops — surfaced clearly in the response. |
| **Drop the tools' mock/stub fallback** | A down simulator should be visible, not masked by fake data; the sim is now the source of truth. | Running the harness without the dev server now errors (intended). |
| **Fixed assumed arrival rate in demand forecast** | Keeps the forecast a transparent rule reading only `WorldState`, not sim internals — the agent could not "see" scenario params anyway. | Forecast demand won't perfectly track the generator's actual rate — acceptable; it's an estimate with a stated basis. |
| **Safety test scans code + prompts + sampled outputs** | Catches clinical wording wherever it could leak — static text and generated rationales. | Can't prove the model never emits a clinical word at runtime; it guards everything we author + the deterministic outputs. Documented limit. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| C1, C2 | `forecast.test.ts`: assert per-patient fields incl. non-empty `rationale`; demand has `expectedAdmissions` + `rationale`. |
| C3 | Call a forecast twice on the same state → identical output. |
| C4, C5 | Build a sim, find a `pharmacy_script` / `transport` blocked patient, call `resolveBlocker`, assert `applied` and that `getState()` shows `blocker: none`, `ready: true`. |
| C6 | Call `resolveBlocker` on a non-matching patient → `applied: false`, state unchanged. |
| C7 | Live: with the dev server up, the forecast tool returns real predictions and the action tool unblocks a patient (no `_mock`/`_stub`). |
| C8 | `safety.test.ts` green; add a deliberate clinical word locally to confirm it goes red, then remove. |
| C9 | `npm run typecheck && npm run lint && npm run build && npm test` all green. |

## 5. Task breakdown (SDD step 3) — the code PR

1. `forecast.ts` — real `forecastDischarges` / `forecastDemand` over `WorldState` (C1–C3).
2. `simulator.ts` — `resolveBlocker` + `ActionResult` type (C4–C6).
3. Forecast + action routes — call the real functions with live state.
4. Harness tools — drop fallbacks, return errors on failure (C7).
5. `tests/safety.test.ts` — denylist + corpus (C8).
6. `tests/forecast.test.ts` — forecast shape/determinism + action effect/no-op.
7. Run the gate + live harness check (forecast returns real; action unblocks) (C7, C9).

## 6. Out of scope (restated)

The human approval gate (Phase 4), the orchestrator's ranking/diagnosis reasoning (Phase 5), the UI,
loop driver, and eval (Phases 4/6/7), and any trained forecaster or clinical concept (never).
