# Implementation Plan — Eval + KPIs

| | |
| --- | --- |
| **Feature** | The eval harness, the two flow KPIs, and the with/without comparison |
| **Version** | 0.1.0 |
| **Status** | Plan PR — awaiting review/merge |
| **Implements** | `spec.md` (same folder) |

> SDD step 2 (Plan): *how* the spec is built — layout, decisions/trade-offs, and how each acceptance
> criterion (F1–F8) is met and verified. Task breakdown at the end (the code PR).

---

## 1. Architecture

A small, **pure** eval module that drives the simulator headlessly. The default eval is fully
deterministic (seeded sim + a deterministic intervention policy), so the S11 headline is reproducible
and CI-safe. It surfaces three ways: a CLI (`npm run eval`), a test (asserts S11), and an API route
(feeds the KPI panel).

```
src/eval/
  kpis.ts     # FlowKPIs, EvalResult types + the two computations
  policy.ts   # the deterministic "oracle" intervention policy
  run.ts      # runScenario(scenario, withAgent) -> FlowKPIs; evaluate() -> EvalResult[]
  cli.ts      # `npm run eval` — prints the with/without table
  index.ts    # barrel
src/app/api/eval/run/route.ts   # GET -> EvalResult[] (deterministic, fast)
src/app/components/KpiPanel.tsx  # CHANGE: render real results + a "Run eval" button
src/app/page.tsx                 # CHANGE: eval state + runEval()
```

**Import note:** `src/eval` imports the sim with **relative** paths (`../sim`), not the `@/` alias, so
`npm run eval` runs under `tsx` with no path-alias config. The test (`@/eval`, vitest) and the API route
(`@/eval`, Next) resolve the alias themselves. The deterministic path never imports the driver/adapter,
so the CLI pulls in no SDK.

## 2. Component design

### 2.1 KPIs — `kpis.ts` (F3)
```ts
interface FlowKPIs { accessBlockHours: number; endOfDayHeadroom: number }
interface EvalResult { scenario: ScenarioName; seed: number; withAgent: FlowKPIs; withoutAgent: FlowKPIs }
```
- **access-block hours** accumulates each tick: `+= edQueueLengthAfterTick × tickHours`.
- **end-of-day headroom** = `empty_clean` beds in the final state.

### 2.2 Oracle policy — `policy.ts` (the agent's stand-in)
`applyOraclePolicy(sim)` takes the **same class of actions the agent proposes**: for each patient whose
predicted discharge is due/overdue and is blocked on an **actionable** type, resolve it —
`pharmacy_script` → `resolveBlocker(...,'pharmacy_script')`, `transport` → `resolveBlocker(...,'transport')`.
`allied_health`/`placement` stay unactioned (no v1 lever), so the agent improves the *actionable* share.

### 2.3 Runner — `run.ts` (F1, F2, F5)
`runScenario(scenario, withAgent)`: fresh `Simulator(scenario)`; loop 48 ticks (24h @ 30m) — if
`withAgent`, apply the policy, then `step()`, then add the tick's access-block. Return `FlowKPIs`.
`evaluate()` runs both scenarios × {with, without} → `EvalResult[]`. Deterministic ⇒ same seed → same
numbers (F5).

### 2.4 CLI — `cli.ts` (F7)
`npm run eval` calls `evaluate()` and prints a readable per-scenario table (with vs without, both KPIs,
and the delta). Run via a pinned `tsx` devDependency.

### 2.5 API + KPI panel — (F6 / S10)
`GET /api/eval/run` returns `EvalResult[]`. `KpiPanel` gains a **Run eval** button (deterministic, fast)
and renders both scenarios, both runs, both metrics, highlighting the with/without delta. `page.tsx`
holds the eval state.

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Deterministic oracle policy is the default "agent" in the eval** | A reproducible, CI-safe S11 and an instant KPI panel; isolates the *value of the agent's actions* from LLM variance. The live loop already showed the real agent proposes exactly these actions. | It is not the LLM in the loop — so we also offer a real-agent mode (below) and are explicit that the default measures the agent's *intervention policy*, not its reasoning. |
| **Real-agent eval is an optional mode (N=3, off by default, not in CI)** | Authenticity when wanted, with a distribution per `PRD §9`. | Slow + flaky; runs via the API/Next (where `@/` + the driver resolve), not the `tsx` CLI. |
| **48 ticks, policy every tick** | A full day; acting promptly on stuck discharges is what frees beds. | A coarser cadence would blunt the effect; every-tick is the clearest demonstration. |
| **`src/eval` uses relative imports** | `npm run eval` runs under `tsx` with zero alias config and no SDK. | Slightly inconsistent with the `@/` style used elsewhere — contained to this module. |
| **On-demand KPI panel button** | The deterministic eval is fast; no need to precompute or persist. | Numbers aren't shown until you click Run eval. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| F1–F3 | `eval.test.ts`: `runScenario` returns both KPIs; values match the §3 definitions on a hand-checkable short run. |
| F4 / **S11** | `eval.test.ts`: for **both** scenarios, `withAgent.accessBlockHours < withoutAgent.accessBlockHours` AND `withAgent.endOfDayHeadroom > withoutAgent.endOfDayHeadroom`. |
| F5 | `evaluate()` twice → identical `EvalResult[]`. |
| F6 | Live: KPI panel "Run eval" populates both scenarios/runs/metrics. |
| F7 | `npm run eval` prints the comparison table. |
| F8 | typecheck · lint · build · all tests green; existing 32 stay green. |

**Empirical risk (stated in spec §8):** S11 is a claim about sim dynamics. If acting on actionable
blockers doesn't beat the baseline on both metrics in both scenarios, the cadence/policy is tuned (e.g.
act slightly earlier, or also count `empty_dirty` toward near-term headroom) — never by fabricating
numbers. The code PR reports the actual deltas.

## 5. Task breakdown (SDD step 3) — the code PR

1. `kpis.ts`, `policy.ts`, `run.ts`, `index.ts` (F1–F3, F5).
2. `cli.ts` + `tsx` devDep + `"eval"` script (F7).
3. `GET /api/eval/run` route (F6).
4. `KpiPanel` results UI + `page.tsx` wiring + Run eval button (F6/S10).
5. `tests/eval.test.ts` — S11 + determinism (F4, F5).
6. Verify: `npm run eval` prints; S11 test green; KPI panel populates live; gate green (F8). Report the
   actual with/without deltas.

## 6. Out of scope (restated)

A trained forecaster, persistence/history, auth/deployment, and any clinical concept.
