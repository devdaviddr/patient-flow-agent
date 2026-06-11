# Spec — Tools + Safety

| | |
| --- | --- |
| **Feature** | Tools bridge (real forecasts & actions) + the safety invariant |
| **Phase** | 2 of the development plan |
| **Version** | 0.2.0 |
| **Status** | Plan PR — awaiting review/merge |
| **Branch** | `feat/tools-safety` |
| **Companions** | `Architecture.md` (§4.2, §7), `PRD.md` (R3, R6, S2, S13), `development-Plan.md` (Phase 2) |

> Spec-Driven Development, step 1 (Specify): *what* this feature is and *why*, plus the acceptance
> criteria and scope boundaries. No implementation detail — that lives in `implementation.md` (written
> after this spec is approved).

---

## 1. Problem

The agent can perceive the hospital but it can't yet *predict* or *do*. The forecast endpoints return
empty stubs and the action endpoints acknowledge-but-do-nothing. This feature makes the tools real:
**transparent forecasts that come with a plain-English reason**, and **two actions that actually
unblock a discharge** by emitting a real event into the simulator.

It also draws the line that makes the whole project safe to publish: a **safety invariant test** that
fails the build if any clinical vocabulary ever appears in a tool, prompt, forecast, or output. Until
this test exists, the no-clinical-output rule is a promise; after it, it's enforced in code.

## 2. How this fits the solution

- **It completes the tools bridge — component 2 of 5, the only hospital-aware code.** Reads were wired
  in Phase 1; this adds the real forecast and action behaviour behind the same neutral tool names.
  (`Architecture §1, §4.2`)
- **It makes the agent able to act, not just describe.** `expedite_script` / `request_transport` move
  from stubs to real `blocker_resolved` events — the groundwork R6 needs. (`PRD R6`)
- **It keeps the forecast a transparent rule set, not a model.** Predictions are inspectable and carry
  a rationale, so the agent stays the showcase and every prediction is explainable. (`PRD §4, §8`, S2)
- **It hardens the safety boundary in code.** The invariant test asserts no acuity/triage/diagnosis/
  treatment vocabulary crosses the tools layer — safety as an architectural property, not prompt
  wording. (`Architecture §7`, S13)
- **It does NOT gate the actions.** Calling an action endpoint applies it. The *human approval gate*
  that must precede any state change is the Phase 4 driver's job — out of scope here (§6).

## 3. Users

- **The orchestrator agent** — calls `forecast_discharges` / `forecast_demand` to predict, and (after
  Phase 4's gate) the action tools to fix blockers. This feature gives those tools real behaviour.
- **The discharge & demand subagents** — consume the real forecasts to diagnose blockers / estimate load.
- **The developer & safety reviewer** — can read any tool, prompt, or forecast and confirm there is no
  clinical content, backed by an automated test.

## 4. User stories

- As the **orchestrator**, when I call `forecast_discharges` for a ward I get, per patient, a predicted
  discharge time, a readiness flag, the blocker (if any), and a **plain-English reason** — so I can
  explain a gap, not just assert it.
- As the **orchestrator**, when I call `forecast_demand` I get expected admissions over the horizon
  with a reason.
- As the **orchestrator** (later, through the gate), when I call `expedite_script` for a patient stuck
  on a pharmacy script, the simulator **actually clears that blocker** and the next perception shows it.
- As a **developer**, the same world state always produces the same forecast (transparent + deterministic).
- As a **safety reviewer**, if anyone ever adds clinical wording to a tool, prompt, or forecast, the
  **build goes red**.

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| C1 | `POST /forecast/discharges` returns, per patient in the ward over the horizon: `patientId`, predicted `at`, `ready`, `blocker`, and a non-empty plain-English `rationale`. | R3 / S2 |
| C2 | `POST /forecast/demand` returns `expectedAdmissions` over the horizon with a non-empty `rationale`. | R3 / S2 |
| C3 | Forecasts are a **transparent, deterministic rule set** (no model): the same `WorldState` + args yields the same forecast. | PRD §4, §8 |
| C4 | `POST /actions/expedite_script` for a patient blocked on `pharmacy_script` emits a `blocker_resolved` event; a subsequent `GET /state` shows that patient unblocked (`blocker: none`, `ready: true`). | R6 / S6 (groundwork) |
| C5 | `POST /actions/request_transport` does the same for a `transport` blocker. | R6 |
| C6 | Acting on a patient with **no matching blocker** is a safe no-op (clear response, no state change, no fabricated event). | safety/robustness |
| C7 | The harness tools (`.opencode/tools/*.ts`) call the **real** endpoints — forecasts and actions return real data when the simulator is reachable (no `_mock` / `_stub`). | (closes Phase 1 gap) |
| C8 | `tests/safety.test.ts` asserts that no clinical vocabulary (acuity, triage, diagnosis, treatment, and the agreed denylist) appears in any tool definition, agent prompt, forecast `rationale`, or sampled world/forecast output — and is **green**. | S13 |
| C9 | The full gate is green: `typecheck`, `lint`, `build`, and all tests (incl. determinism + safety). | dev-plan cross-cutting |

## 6. Scope

### In scope
- Real **forecast heuristics** in the simulator (`/forecast/discharges`, `/forecast/demand`) with rationale.
- Real **action effects** (`/actions/expedite_script`, `/actions/request_transport`) that emit
  `blocker_resolved` events, including the safe no-op case.
- Pointing the **harness tools** at the real endpoints (retire the forecast/action mock-stub paths).
- The **safety invariant test** (`tests/safety.test.ts`) + the agreed clinical-vocabulary denylist.

### Out of scope (later phases)
- **The human approval gate** — Phase 4. Here actions apply when called; gating them is the driver's job.
- **Reasoning quality** — how the orchestrator *ranks* fixes or diagnoses across all four blocker types
  is Phase 5. This feature only supplies the raw tool behaviour.
- **The UI, loop driver, eval** — Phases 4, 6, 7.
- **A trained forecaster** — never in v1; the heuristic stays transparent.
- **Any clinical concept** — never, anywhere; this feature is partly *about* enforcing that.

## 7. Dependencies & assumptions

- Builds on the merged simulator (Phase 1) and harness (Phase 3); both are on `main`.
- Forecast logic reads the simulator's existing `WorldState` (predicted discharge times + blockers are
  already modelled there) — it summarises and explains them, it does not invent new clinical data.
- The forecast vocabulary is logistics-only and therefore must itself pass the safety test.

## 8. Resolved decisions (detail in implementation.md)

1. **Action ↔ blocker mapping** → each action clears **only its own** blocker type
   (`expedite_script` → `pharmacy_script`, `request_transport` → `transport`); any other case is a
   safe no-op.
2. **Forecast horizon** → default **8h**; the discharge forecast lists **all** patients with a
   predicted discharge in-window and flags readiness (not just the not-ready ones).
3. **Mock fallback** → **drop** the harness tools' forecast/action stub fallbacks; on a failed call a
   tool returns a clear error rather than fabricating data, so a down simulator is never masked.
4. **Denylist** → `acuity, triage, diagnosis, diagnose, treatment, treat, prognosis, symptom,
   medication, drug` (whole-word, case-insensitive), scanned across the tool files, agent `.md`
   prompts, forecast `rationale`s, and sampled world/forecast outputs. Department/logistics words
   (e.g. "pharmacy", "transport", "script") are **not** clinical and stay allowed.
