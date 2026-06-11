# Spec — Simulator (the environment)

| | |
| --- | --- |
| **Feature** | Simulator — the synthetic hospital |
| **Phase** | 1 of the development plan |
| **Version** | 0.2.0 |
| **Status** | ✅ Built & verified (B1–B9) — PR #2 open |
| **Branch** | `feat/simulator` |
| **Companions** | `Architecture.md` (§4.1, §5, §8), `PRD.md` (R1, R2, §10), `development-Plan.md` (Phase 1) |

> Spec-Driven Development, step 1 (Specify): *what* this feature is and *why*, plus the acceptance
> criteria and scope boundaries. No implementation detail — that lives in `implementation.md` (written
> after this spec is approved).

---

## 1. Problem

The harness (Phase 3) is built, but its tools have nothing real to read — they return mock data.
Nothing in the system actually *holds* a hospital that changes over time. This feature builds that
**environment**: a synthetic hospital with a live state, a clock that can be advanced, and typed
events that move it forward — all **seedable**, so the same seed replays an identical day.

It is the foundation every later component reads: the tools perceive it, the driver advances it, the
eval harness replays it. Until it exists, the harness is a shell over mock data.

## 2. How this fits the solution

- **It is component 1 of 5 — the environment.** The build chain is **Simulator** → Tools bridge →
  Harness → Loop driver → UI → Eval. Everything downstream reads or drives it. (`Architecture §1, §4.1`)
- **It is the only stateful, domain-aware component.** It holds the `WorldState` and is the single
  place world state changes — via typed `SimEvent`s through one reducer. (`Architecture §4.1`)
- **It is where determinism lives.** Reproducibility is a property of the *environment*, not the
  model: same seed + scenario → identical event stream. This is what makes the later with/without-agent
  evaluation fair. (`Architecture §8`, PRD §6)
- **It sits below the safety boundary.** All domain logic lives here, behind the tools. The simulator
  may know about beds, blockers, and wards; the reasoning layer never sees them directly. (`Architecture §7`)
- **It makes the harness real.** Once it exposes `GET /state`, the Phase 3 tools' mock fallback is
  replaced by real reads — closing the gap left open in the harness spec.

## 3. Users

- **The tools bridge** — reads `GET /state` and (later) the forecast/action endpoints. The immediate
  consumer: replacing the harness tools' mock fallback with real data.
- **The loop driver (Phase 4)** — will advance the clock each tick and read the new position.
- **The eval harness (Phase 7)** — will replay a seeded scenario headlessly to compute KPIs.
- **The developer** — needs to `GET /state`, step the clock, and watch events unfold deterministically.

## 4. User stories

- As the **tools bridge**, I can `GET /state` and receive a `WorldState` matching the agreed contract,
  so the harness perceives a real hospital instead of mock data.
- As the **developer**, I can start the simulator from a named scenario and a seed, then advance the
  clock and see admissions, discharges, cleans, and ED arrivals happen in order.
- As the **developer**, I can run the same seed + scenario twice and get a byte-identical event stream.
- As the **developer**, I can choose between a `normal-weekday` baseline and a `flu-surge` scenario.
- As a **later phase**, I can rely on the simulator being the *only* thing that mutates state — every
  change is a typed event through one reducer, so the audit trail and replay are trustworthy.

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| B1 | The data model matches `Architecture §5` exactly: `WorldState`, `Ward`, `Bed`, `Patient`, `BedStatus`, `BlockerType`. | R2 |
| B2 | The world is shaped as **one ED + two inpatient wards of 10 beds each**. | PRD §10 |
| B3 | State changes **only** via the five `SimEvent` kinds (`admission`, `discharge`, `blocker_resolved`, `bed_cleaned`, `ed_arrival`) applied through a single reducer. | `Architecture §4.1, §5` |
| B4 | The clock is **seedable**: the same seed + scenario replays an identical, ordered `SimEvent` stream. | R1 / S12 |
| B5 | Two named scenarios exist: `normal-weekday` and `flu-surge` (more ED arrivals). | PRD §10 |
| B6 | `GET /state` returns the current `WorldState`; advancing the clock produces events in order and the returned state reflects them. | R1, R2 / S1 |
| B7 | `POST /forecast/*` and `POST /actions/*` exist as **stubs** (routes present, real heuristics/effects deferred to Phase 2). | `Architecture §4.1` |
| B8 | The simulator is reachable at `SIM_URL`, so the Phase 3 harness tools return real state in place of their mock fallback. | (closes harness spec gap) |
| B9 | A determinism test (same seed twice → identical stream, S12) and an ordering test (events in order, live picture matches, S1) are green. | S1, S12 |

## 6. Scope

### In scope
- The `WorldState` data model and the two-ward + ED world shape.
- The five `SimEvent` kinds and the single reducer that applies them.
- A seedable clock / PRNG driving deterministic event generation.
- The two scenarios (`normal-weekday`, `flu-surge`) as named seeds.
- An HTTP surface: `GET /state` (real) plus `POST /forecast/*` and `POST /actions/*` (stubs).
- The determinism (S12) and ordering (S1) tests.
- The **minimum runnable project** needed to build and test the above (TypeScript + a test runner) —
  see §7 for the bootstrap dependency.

### Out of scope (later phases)
- **Forecast heuristics with rationale** and **real action effects** — Phase 2. Here those endpoints
  are stubs only.
- **The safety invariant test** — Phase 2 (it guards the tools/forecast vocabulary that lands then).
- **The loop driver, per-tick prompting, and the approval gate** — Phase 4.
- **The UI and the eval harness** — Phases 6–7.
- **Any clinical concept** — never, anywhere. The simulator models beds and logistics only.

## 7. Dependencies & assumptions

- **No runnable project exists yet** (no `package.json`, no `src/`). Phase 0 bootstrap is a
  prerequisite; this feature needs at least a TypeScript project and a test runner (Vitest) to build
  and prove the simulator. How much of the full Next.js scaffold to do now is an open question (§8).
- The data contracts are taken as given from `Architecture §5`; if they change, this spec changes with
  them.
- `SIM_URL` is currently `http://localhost:3000/api/sim` (a Next.js route shape) in `.env.example` and
  compose; the hosting decision (§8) may revise it.
- Synthetic data only — no real patient data path is ever introduced, including in tests.

## 8. Resolved decisions (detail in implementation.md)

1. **Where the simulator runs** → a **pure TypeScript core** (`src/sim/`, framework-agnostic, fully
   unit-testable) hosted by **Next.js `/api/sim/*` route handlers**. `SIM_URL` stays
   `http://localhost:3000/api/sim`, matching `Architecture §4.1`'s "in-process" intent.
2. **Phase 0 bootstrap** → done now, **Next.js** (App Router) + TypeScript strict + Vitest + ESLint, as
   the client app is Next.js anyway.
3. **Tick** → a **fixed time-step** (default 30 min), with events **generated** each tick by seeded
   rules over the world state (not hand-scripted).
4. **Scenarios** → **parameterised seeded generators** (ED arrival rate, length-of-stay); `flu-surge`
   differs from `normal-weekday` by a higher arrival rate.
