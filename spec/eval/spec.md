# Spec — Eval + KPIs

| | |
| --- | --- |
| **Feature** | The evidence: with/without-agent runs over a seeded day → the two flow KPIs |
| **Phase** | 7 of the development plan |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (F1–F8, S11 holds) — code PR open |
| **Branch** | `feat/eval` (plan) → `feat/eval-impl` (code) |
| **Companions** | `Architecture.md` (§4.6, §8), `PRD.md` (R11, S10, S11), `development-Plan.md` (Phase 7) |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md`.

---

## 1. Problem

Everything runs, but there is no *evidence* the agent actually helps. The whole point of the project —
its headline claim (S11) — is: **run the same day with and without the agent, and show the difference.**
This feature builds that: a headless eval harness that plays a seeded scenario twice (with the agent's
interventions and without any), computes two flow KPIs for each, and surfaces the comparison.

## 2. How this fits the solution

- **It is the eval harness — `Architecture §4.6`.** It reuses the same simulator and intervention path
  the live loop uses, driven headlessly across a scenario.
- **It produces the project's central result.** S11 — *with-agent shows fewer access-block hours and
  more end-of-day headroom, in both scenarios* — is what the whole design is in service of. (`PRD R11`)
- **It fills the KPI panel slot.** Phase 6 left a placeholder; this wires real numbers into it. (S10)
- **It respects the determinism boundary.** Reproducibility lives in the *seeded simulator*; the agent
  is the non-deterministic part, so a real-agent run reports a distribution over N trials, not one
  exact replay. (`Architecture §8`, `PRD §9`)

## 3. The two KPIs (precise)

- **Access-block hours** (lower is better) — total patient-time spent waiting for a bed that isn't
  available. Computed as the sum, over each tick of the day, of (patients still in the ED queue after
  that tick's admissions) × (tick length in hours). A patient in the queue is ready for a bed but has
  no clean, empty one.
- **End-of-day headroom** (higher is better) — the number of `empty_clean` beds in the final state at
  the end of the simulated day.

## 4. Users

- **The technical reviewer (real audience)** — runs the eval and reads the with/without comparison; this
  is the evidence that judges the design.
- **The coordinator (in-world)** — sees the KPI panel populate with the day's numbers.
- **The developer / CI** — runs `npm run eval` headlessly and a test that asserts S11 holds.

## 5. User stories

- As a **reviewer**, I run the eval and get, per scenario, the two KPIs **with** the agent and
  **without** it, so I can see whether the agent helped.
- As a **reviewer**, in both scenarios the with-agent run shows **fewer access-block hours** and **more
  end-of-day headroom** — the headline result.
- As a **developer**, the same seed reproduces the same eval numbers (deterministic mode), so the
  comparison is fair and repeatable.
- As a **coordinator**, the **KPI panel** shows both metrics, both runs, both scenarios.

## 6. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| F1 | An eval module computes `FlowKPIs { accessBlockHours, endOfDayHeadroom }` from a headless run of a scenario over a full simulated day. | R11 |
| F2 | It runs each scenario **with** agent interventions and **without** any, and returns an `EvalResult { scenario, seed, withAgent, withoutAgent }`. | R11 |
| F3 | Both KPIs are computed exactly as defined in §3, from sim state/events. | R11 |
| F4 | **S11** — in **both** scenarios (`normal-weekday`, `flu-surge`), the with-agent run has **fewer access-block hours AND more end-of-day headroom** than without-agent. Asserted by a test. | **S11** |
| F5 | The default (deterministic) eval is **reproducible**: same seed → identical `EvalResult`. | S12 |
| F6 | The results surface in the UI **KPI panel**: both metrics, both runs, both scenarios. | **S10** |
| F7 | `npm run eval` prints the with/without comparison for both scenarios. | dev-plan |
| F8 | The gate is green: typecheck, lint, build, all tests (incl. the S11 test); existing tests stay green. | dev-plan |

## 7. Scope

### In scope
- The eval module (`src/eval/`): the headless runner, the two KPI computations, the with/without driver.
- The **intervention policy** the with-agent run uses (see §9 decision 1).
- An **eval API route** + wiring the KPI panel to display results (S10).
- `npm run eval` headless output (F7) and the **S11 test** (F4).
- An optional **real-agent eval mode** (N trials, reports spread) for authenticity — not in CI.

### Out of scope (later / never)
- A trained forecaster or any change to the heuristic.
- Persistence of eval runs, historical charts.
- Auth, multi-hospital, deployment.
- Any clinical concept.

## 8. Dependencies & assumptions

- Builds on the merged simulator, tools, harness, driver, and UI (Phases 1–6) on `main`.
- Assumes the two actionable interventions (`expedite_script`, `transport`) are the agent's levers; the
  other two blocker types remain unactioned in v1, so the agent improves the *actionable* share.
- Assumes acting on overdue actionable blockers frees beds sooner — the mechanism behind S11. This is an
  **empirical** claim verified in the code PR; if it doesn't hold, the policy/cadence is tuned (it never
  fabricates a result).

## 9. Resolved decisions (detail in implementation.md)

1. **What plays "the agent"** → a **deterministic oracle policy** (resolve overdue actionable
   `pharmacy_script` / `transport` blockers — the same actions the agent proposes) is the **default**:
   reproducible S11, instant KPI panel. The **real LLM agent** is an **optional** mode (N trials +
   spread), off by default and not in CI. The default measures the agent's *intervention policy*, not
   its reasoning — stated plainly.
2. **Day length / cadence** → 48 ticks (24h @ 30m), policy applied **every tick**.
3. **KPI panel UX** → an on-demand **Run eval** button calling `GET /api/eval/run` (deterministic, fast).
4. **Real-agent trials** → **N = 3**, mean ± range, off by default.
