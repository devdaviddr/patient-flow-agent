# Implementation Plan — Simulator (the environment)

| | |
| --- | --- |
| **Feature** | Simulator — the synthetic hospital |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (B1–B9) — PR #2 open |
| **Implements** | `spec.md` (same folder) |

> Spec-Driven Development, step 2 (Plan): *how* the spec is built — layout, key decisions and
> trade-offs, and how each acceptance criterion (B1–B9) is met and verified. Task breakdown at the end.

---

## 1. Architecture

A **pure, framework-agnostic simulator core** under `src/sim/`, wrapped by **thin Next.js route
handlers** under `src/app/api/sim/`. The core holds no HTTP knowledge and is unit-tested directly; the
routes only translate HTTP ↔ core. This matches `Architecture §4.1` ("in-process") and keeps
`SIM_URL = http://localhost:3000/api/sim`.

```
src/
  sim/                         # PURE CORE — no HTTP, no framework, fully testable
    state.ts                   # WorldState, Ward, Bed, Patient, BedStatus, BlockerType (Architecture §5)
    events.ts                  # SimEvent union + reduce() — the ONLY state mutator
    rng.ts                     # seedable PRNG (mulberry32) — deterministic, no Math.random
    clock.ts                   # fixed time-step tick; advances time + asks the generator for events
    generate.ts                # seeded event-generation rules over the world state
    scenarios.ts               # normal-weekday & flu-surge params + seeds + initial world builder
    forecast.ts                # STUB shapes only (real heuristics = Phase 2)
    simulator.ts               # Simulator class: holds state, seed; step(), getState(), reset()
    index.ts                   # barrel export
  app/
    api/sim/
      state/route.ts           # GET  -> WorldState            (real)
      step/route.ts            # POST -> advance clock one tick (real; dev/eval control)
      forecast/discharges/route.ts   # POST -> stub
      forecast/demand/route.ts       # POST -> stub
      actions/expedite_script/route.ts   # POST -> stub
      actions/request_transport/route.ts # POST -> stub
    layout.tsx, page.tsx       # minimal placeholder (real UI = Phase 6)
tests/
  determinism.test.ts          # S12 — same seed twice -> identical event stream
  simulator.test.ts            # S1  — events in order, live picture matches; B1–B3 shape
```

## 2. Core design

### 2.1 Types — `state.ts`
Exact transcription of `Architecture §5`: `BedStatus`, `BlockerType`, `Ward`, `Bed`, `Patient`,
`WorldState`. No clinical fields. (B1)

### 2.2 Events + reducer — `events.ts`
The `SimEvent` union (five kinds) and `reduce(state, event) -> WorldState`, a **pure** function that
is the single mutator. Returns a new state (no in-place mutation), so replay and audit are trustworthy. (B3)

### 2.3 Determinism — `rng.ts`
A small seedable PRNG (mulberry32). **Nothing in `src/sim/` calls `Math.random()` or `Date.now()`** —
all randomness and time flow from the seed and the clock. This is what guarantees B4/S12.

### 2.4 Clock + generator — `clock.ts`, `generate.ts`
`clock` advances simulated time by a fixed step (default 30 min). Each step, `generate` consumes the
PRNG + current state + scenario params to emit zero or more `SimEvent`s (ED arrivals at the scenario's
rate, discharges as predicted times pass, bed cleans after discharge, blocker resolutions). Events are
then folded through `reduce`. Same seed + scenario ⇒ identical stream. (B4, B6)

### 2.5 Scenarios — `scenarios.ts`
Two named scenarios as parameter sets (arrival rate, length-of-stay spread, initial occupancy) + a
fixed seed each. `flu-surge` = higher ED arrival rate than `normal-weekday`. Also builds the initial
world: 1 ED + two 10-bed wards. (B2, B5)

### 2.6 Simulator wrapper — `simulator.ts`
`new Simulator(scenario, seed)` holds the world state and exposes `getState()`, `step()` (returns the
events it emitted), and `reset()`. A module-level singleton backs the dev server so HTTP reads share
one evolving world.

### 2.7 Route handlers — `src/app/api/sim/*`
Thin: `GET /state` returns `simulator.getState()`; `POST /step` advances one tick (dev/eval control,
ahead of the Phase 4 driver). Forecast/action routes return typed **stubs** so the harness tools'
endpoints resolve, with real heuristics/effects deferred to Phase 2. (B6, B7)

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Pure core + thin Next.js routes** | Core is unit-testable with zero HTTP/framework setup; routes stay trivial; `SIM_URL` unchanged. | Two layers to keep in sync (kept trivial by design). |
| **Bootstrap Next.js now (hand-rolled, not `create-next-app`)** | The repo already has `docs/`, `spec/`, `.opencode/`, `Makefile` — `create-next-app .` refuses to overlay a non-empty dir. Hand-writing `package.json` + config avoids the conflict and lets us pin versions. | We maintain the config by hand instead of generated defaults. |
| **Seeded PRNG; no `Math.random`/`Date.now` in `src/sim/`** | Determinism (S12) is the whole point; ambient randomness/time would leak non-reproducibility. | Slightly more plumbing (thread seed + clock everywhere). |
| **Generated events, not scripted** | Scales to any horizon, makes `flu-surge` a one-parameter change, and stays deterministic via the seed. | Less precise control over an exact demo storyline than a hand-written script. |
| **Module-level singleton sim state** | One simulated hospital (PRD §10); simplest thing that works for the local dev server. | Next.js route handlers can run in separate workers in production — fine for v1 local-first; noted as a later concern. |
| **`POST /step` exposed now** | Lets us advance the clock and test ordering before the Phase 4 driver exists. | A control endpoint the driver will later own; harmless to keep. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| B1 | `state.ts` types compile against `Architecture §5`; `simulator.test.ts` asserts initial shape. |
| B2 | Initial world has 1 ED + 2 wards × 10 beds — asserted in test. |
| B3 | `reduce` is the only export that returns a new `WorldState`; tests drive every event kind. |
| B4 / S12 | `determinism.test.ts`: build two simulators with the same seed+scenario, step N times, assert identical event streams and final state. |
| B5 | Both scenarios load and differ (flu-surge yields more ED arrivals over the horizon). |
| B6 / S1 | `simulator.test.ts`: step the clock, assert events come in time order and `getState()` reflects them; route smoke test for `GET /state`. |
| B7 | Forecast/action routes return their stub shapes (status 200, typed body). |
| B8 | With the dev server running, `opencode run --agent orchestrator …` hits real `/state` (no `_mock` flag in output). |
| B9 | `npm test` runs the determinism + ordering tests green. |

## 5. Task breakdown (SDD step 3)

0. **Bootstrap** — hand-rolled Next.js (App Router) + TS strict + Vitest + ESLint; `package.json`
   scripts (`dev`, `build`, `lint`, `typecheck`, `test`); pin versions; minimal `app/layout.tsx` +
   `page.tsx`. Gate: `npm run dev`, `npm test` (empty) green.
1. `state.ts` — data model (B1).
2. `events.ts` — `SimEvent` + `reduce` (B3).
3. `rng.ts` — seedable PRNG.
4. `clock.ts` + `generate.ts` — fixed-step tick + seeded event generation (B4, B6).
5. `scenarios.ts` — normal-weekday + flu-surge + initial world (B2, B5).
6. `simulator.ts` + `index.ts` — wrapper + singleton.
7. `src/app/api/sim/*` — `GET /state`, `POST /step` real; forecast/action stubs (B6, B7).
8. `tests/` — determinism (S12) + ordering/shape (S1) (B9).
9. Run the harness against the live sim — confirm real state replaces the mock fallback (B8).

## 6. Out of scope (restated)

Forecast heuristics + rationale, real action effects, the safety invariant test (all Phase 2); the loop
driver and approval gate (Phase 4); the UI and eval (Phases 6–7). No clinical concepts, ever.
