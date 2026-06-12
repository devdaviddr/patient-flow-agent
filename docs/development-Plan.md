# Patient Flow Orchestrator — Development Plan

| | |
| --- | --- |
| **Version** | 1.0.0 |
| **Status** | Draft |
| **Owner** | David |
| **Date** | 2026-06-11 |
| **Companions** | `PRD.md` (what & why), `Architecture.md` (how it fits), `OpenCode-Harness.md` (the agent runtime) |

> This is the **build plan**: how to set up the repository, how to run branches as a solo developer, and the
> phase-by-phase order in which to construct the system. Each phase names what to build, which PRD requirement it
> satisfies, and the acceptance gate that says it's done. The other docs say *what* and *how it fits*; this says
> *in what order you actually write it.*

---

## 1. How to read this plan

The work is sequenced so that **every phase produces something testable before the next one depends on it.** You build the world before the things that read the world, the tools before the agent that calls them, and the agent before the UI that renders it. The evaluation harness comes last because it needs all the moving parts in place.

The ordering follows the dependency arrows in `Architecture.md §4`: Simulator → Tools bridge → OpenCode harness → Loop driver → Web UI → Eval harness. Safety and reproducibility tests are not a phase — they are written *alongside* the code they guard, and they must stay green from the moment they exist.

Three rules hold across every phase:

- **Synthetic only.** No real data, ever. The safety invariant test (Phase 2) exists from early on and must never go red.
- **Seed everything in the environment.** Determinism lives in the simulator, never the model.
- **Keep `main` releasable.** Trunk-based means `main` always runs the demo; broken work stays on a branch.

## 2. Repository setup

### 2.1 Create the repo

A single repository holds everything — the Next.js app, the simulator, the `.opencode/` harness config, and the docs. There is no reason to split this across repos for a v1 portfolio piece.

```bash
mkdir patient-flow-orchestrator && cd patient-flow-orchestrator
git init
npx create-next-app@latest . --typescript --app --eslint
```

Then move the three existing planning docs into a `docs/` folder so the repo is self-documenting:

```
docs/
  PRD.md
  Architecture.md
  OpenCode-Harness.md
  DEVELOPMENT_PLAN.md   ← this file
```

### 2.2 Target directory layout

Build toward this shape. It mirrors the components in `Architecture.md §4` and the file layout in `OpenCode-Harness.md §4`.

```
patient-flow-orchestrator/
  .opencode/
    agents/
      orchestrator.md          # primary agent
      discharge.md             # read-only subagent
      demand.md                # read-only subagent
    tools/
      world_state.ts           # read tool
      forecast_discharges.ts   # read tool
      forecast_demand.ts       # read tool
      expedite_script.ts       # action tool (gated)
      request_transport.ts     # action tool (gated)
  opencode.json                # default provider/model + global config
  src/
    sim/                       # the Simulator (environment)
      state.ts                 # WorldState + types
      events.ts                # SimEvent + reducer
      clock.ts                 # seedable clock
      forecast.ts              # transparent heuristics
      scenarios/               # normal-weekday, flu-surge seeds
      server.ts                # HTTP surface: /state, /forecast/*, /actions/*
    driver/                    # the Loop driver (outer loop)
      adapter.ts               # the ONE module that wraps @opencode-ai/sdk
      tick.ts                  # one session.prompt per tick + approval gate
    eval/                      # the Eval harness
      run.ts                   # with/without-agent runs → FlowKPIs
    app/                       # Next.js App Router (UI)
      page.tsx                 # bed-board
      components/              # approval cards, KPI panel, decision timeline
      api/                     # route handlers the UI calls
  tests/
    safety.test.ts             # no-clinical-output invariant (S13)
    determinism.test.ts        # same seed → identical run (S12)
  .env.example                 # SIM_URL, OPENCODE_URL, ANTHROPIC_API_KEY
  README.md
```

### 2.3 Tooling and hygiene

Set these up once, in the bootstrap branch, so quality is automatic rather than remembered:

- **TypeScript strict mode**, ESLint, and Prettier — already partly scaffolded by `create-next-app`.
- **Vitest** (or Jest) for the test suite. The safety and determinism tests live here.
- **A `.env.example`** listing `SIM_URL`, `OPENCODE_URL`, and `ANTHROPIC_API_KEY` — never commit real keys.
- **Pin the OpenCode version** in `package.json` (a known risk in `OpenCode-Harness.md §9`). Pin `@opencode-ai/sdk` and `@opencode-ai/plugin` to exact versions, not ranges.
- **A simple CI check** (GitHub Actions): on every push, run `lint`, `typecheck`, and `test`. This is what makes "keep `main` green" enforceable rather than aspirational.

### 2.4 Conventions

- **Conventional Commits** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) — gives you a readable history and a tidy portfolio artifact.
- **One adapter rule:** every call into the OpenCode SDK goes through `src/driver/adapter.ts`. Nothing else imports the SDK. When OpenCode's API drifts, one file changes (`Architecture.md §11`, `OpenCode-Harness.md §8`).

## 3. Branching strategy (solo, trunk-based)

You're building alone, so the workflow is deliberately light: **one long-lived branch (`main`) plus short-lived feature branches that merge back fast.** The discipline isn't about coordinating people — it's about keeping a demo-able `main` at all times and giving yourself a clean history.

### 3.1 The model

- **`main` is always releasable.** At any commit on `main`, you can start `opencode serve` and the Next.js dev server and run the demo. If a change would break that, it stays on a branch until it doesn't.
- **One short-lived branch per phase task**, named for its slice of work:

  ```
  feat/sim-world-state
  feat/tools-read
  feat/orchestrator-agent
  feat/ui-bed-board
  test/safety-invariant
  fix/forecast-rationale
  ```

- **Merge within a day or two, not weeks.** Short-lived branches are the whole point of trunk-based — they keep merges small and conflicts near zero. Rebase on `main` before merging to keep history linear.
- **Tag milestones.** Tag the end of each phase (`v0.1-sim`, `v0.2-tools`, …) so you can always check out a known-good state and so the portfolio story is legible.

### 3.2 Per-branch loop

```bash
git checkout main && git pull
git checkout -b feat/sim-world-state
# ... build the slice, write its test ...
npm run lint && npm run typecheck && npm test     # must pass
git rebase main                                   # stay current
git checkout main && git merge --no-ff feat/sim-world-state
git tag v0.1-sim                                  # at phase boundaries
git branch -d feat/sim-world-state
```

The `--no-ff` keeps each feature visible as a unit in history without the overhead of pull-request review (which a solo project doesn't need). If you'd rather have a paper trail of self-review, push branches to GitHub and open a PR you merge yourself — optional, not required.

### 3.3 What you don't need

No `develop` branch, no release branches, no GitFlow. Those exist to coordinate teams and parallel releases; for one developer shipping one local-first v1, they're pure overhead. Keep it to `main` + feature branches until there's a second contributor.

## 4. Phased build

Eight phases, each mapped to the PRD requirements (R1–R11) and success criteria (S1–S13) it satisfies, each with an acceptance gate. Don't start a phase until the previous gate is green and merged to `main`.

```mermaid
flowchart LR
    P0["0 · Bootstrap"] --> P1["1 · Simulator"]
    P1 --> P2["2 · Tools + Safety"]
    P2 --> P3["3 · Harness"]
    P3 --> P4["4 · Loop driver"]
    P4 --> P5["5 · Reasoning"]
    P5 --> P6["6 · Web UI"]
    P6 --> P7["7 · Eval + KPIs"]
    P7 --> P8["8 · Polish & demo"]

    classDef a fill:#1e3a5f,stroke:#4a90d9,color:#e8f0fe;
    class P0,P1,P2,P3,P4,P5,P6,P7,P8 a;
```

---

### Phase 0 — Bootstrap

**Goal:** an empty but correct skeleton on `main`.

Scaffold the Next.js app (§2.1), commit the directory layout (§2.2) as empty stubs, wire up TypeScript strict mode, ESLint, Prettier, Vitest, and the CI check (§2.3). Add `.env.example`. Move the docs into `docs/`. Pin OpenCode versions.

**Branch:** `chore/bootstrap` → tag `v0.0-skeleton`
**Gate:** `npm run lint && npm run typecheck && npm test` passes on a near-empty repo; CI is green; `README.md` says how to run it.

---

### Phase 1 — Simulator (the environment)

**Goal:** a synthetic hospital that advances on a seedable clock and emits typed events. This is the foundation everything else reads (`Architecture.md §4.1`).

Build, in order:

1. **The data model** — `WorldState`, `Ward`, `Bed`, `Patient`, `BedStatus`, `BlockerType` exactly as typed in `Architecture.md §5`.
2. **The world shape** — one ED plus **two inpatient wards of 10 beds each** (PRD §10).
3. **`SimEvent` + reducer** — the five event kinds (`admission`, `discharge`, `blocker_resolved`, `bed_cleaned`, `ed_arrival`); the reducer is the *only* thing that mutates state.
4. **The seedable clock** — a seeded PRNG drives event generation so the same seed replays an identical stream.
5. **Two scenarios** — `normal-weekday` and `flu-surge` (more ED arrivals), each a named seed (PRD §10).
6. **The HTTP surface** — `GET /state`, plus stubs for `/forecast/*` and `/actions/*` (filled in next phases).

Write `tests/determinism.test.ts` now: same seed + scenario run twice → identical event stream.

**Satisfies:** R1 (simulate over time), R2 (live picture), the reproducibility property (PRD §6, `Architecture.md §8`).
**Branch:** `feat/sim-world-state`, `feat/sim-events`, `feat/sim-scenarios` → tag `v0.1-sim`
**Gate:** S1 (a seeded day produces events in order, live picture matches) and S12 (same seed twice → identical) both pass. You can `GET /state` and step the clock.

---

### Phase 2 — Tools bridge + safety invariant

**Goal:** the typed tool layer that translates between the agent's neutral vocabulary and the simulator's HTTP API — and the safety test that guards the boundary forever after (`Architecture.md §4.2, §7`).

1. **Forecast heuristics** in the simulator — `POST /forecast/discharges` and `POST /forecast/demand`, each returning predictions *with a plain-English `rationale`* (the rationale is part of the contract, `Architecture.md §5`). Transparent rule set, no model (PRD §4, key decision in §8).
2. **Action endpoints** — `POST /actions/expedite_script` and `POST /actions/request_transport`, each emitting a `SimEvent`.
3. **The five tools** as TypeScript `tool()` + Zod files in `.opencode/tools/` (templates in `OpenCode-Harness.md §6`): three read tools, two action tools. Tools only call the simulator over HTTP — they are the *only* hospital-aware code.
4. **The safety invariant test** (`tests/safety.test.ts`): assert that no tool input/output schema and no system output ever carries acuity, triage, diagnosis, or treatment vocabulary. This is the code-enforced version of the no-clinical-output rule.

**Satisfies:** R3 (forecasts as tools with reasons), the safety boundary (PRD §6, `Architecture.md §7`), groundwork for R5/R6 actions.
**Branch:** `feat/sim-forecast`, `feat/tools-read`, `feat/tools-action`, `test/safety-invariant` → tag `v0.2-tools`
**Gate:** S2 (each forecast has a human-readable reason) and S13 (no clinical content, asserted by test) pass. Tools callable in isolation against a running simulator.

---

### Phase 3 — OpenCode harness (configured, not coded)

**Goal:** the agent runtime wired up as configuration — one primary agent, two read-only subagents, the permission gate (`OpenCode-Harness.md §4–7`).

1. **`opencode.json`** — default provider/model (hosted Claude via API key, the default demo model in PRD §10).
2. **`orchestrator.md`** — primary agent; all read tools `allow`, both action tools `ask`; system prompt is the perceive → forecast → delegate → rank → propose cycle; explicit "never assign acuity, triage, diagnosis, treatment" line (`OpenCode-Harness.md §5.1`).
3. **`discharge.md`** and **`demand.md`** — subagents on the cheaper/local model, read-only (`"*": deny`), each with a narrow brief (`§5.2, §5.3`). Set the model explicitly so they don't inherit the orchestrator's.
4. **Run it headless** — `opencode serve` on localhost; confirm the harness loads the agents and tools.

**Satisfies:** the harness side of R3–R8; sets up R7's `ask` gate as defence-in-depth.
**Branch:** `feat/opencode-config`, `feat/agents` → tag `v0.3-harness`
**Gate:** `opencode serve` starts, lists the three agents and five tools, and a manual prompt to the orchestrator produces a tool call to `world_state`. No driver yet — this is the harness proving it's wired.

---

### Phase 4 — Loop driver (the outer loop + the real approval gate)

**Goal:** our control loop that owns the clock, re-prompts each tick, and enforces approval (`Architecture.md §4.4`, `OpenCode-Harness.md §8`). **This is genuinely our code, not the harness.**

1. **The adapter** — `src/driver/adapter.ts`, the single module wrapping `@opencode-ai/sdk`. Create a session, expose `prompt()`. Everything SDK-shaped lives here (`Architecture.md §11`).
2. **`tick()`** — one `session.prompt` per simulated clock step; collect the orchestrator's proposed interventions.
3. **The real approval gate** — proposed actions are surfaced (to an API the UI will consume), and the corresponding action tool only runs *after* a human approves, **item-by-item** (R7). Do **not** rely on the harness `ask` to block — the SDK-bypass caveat means our driver is the real gate (`OpenCode-Harness.md §7`, PRD §10). The `ask` config stays as belt-and-braces.
4. **Re-plan triggers** — re-prompt after an approved action *and* when the clock advances (R8).
5. **Decision records** — every gap, plan, and action saved with state + rationale (R10), drawn from the harness session history (`Architecture.md §8`).

**Satisfies:** R7 (human approval before state change), R8 (re-think and re-plan), R10 (audit trail).
**Branch:** `feat/driver-adapter`, `feat/driver-tick`, `feat/driver-approval` → tag `v0.4-driver`
**Gate:** S6 (reject → nothing changes; approve → exactly one event), S7 (after a change, new position traceable to it), S9 (every gap/plan/action has a decision record) pass — testable headlessly before any UI.

---

### Phase 5 — Reasoning quality (gaps, blockers, ranked plan, Q&A)

**Goal:** make the agent actually *reason well* — this is the phase where the orchestrator and subagents earn their keep. Mostly prompt and delegation tuning on top of Phase 3–4 plumbing.

1. **Gap detection** — orchestrator detects where a ward runs short over the horizon and explains *why* (fewer discharges than admissions, etc.) → `CapacityGap` (R4).
2. **Blocker diagnosis** — `@discharge` names the specific blocker for each not-ready discharge across *all four* types (pharmacy_script, transport, allied_health, placement) with a one-line reason (R5).
3. **Demand detail** — `@demand` estimates incoming load over the horizon with a reason.
4. **Ranked plan** — orchestrator produces a ranked `Intervention` list, each tied to the gap/blocker it addresses, ordered by impact. In v1 only two are *actionable* (`expedite_script`, `request_transport`); a blocker with no v1 action is still surfaced, just without a one-click fix (R6).
5. **Plain-language Q&A** — the orchestrator answers free-text questions ("what's tonight looking like?", "why is 4B blocked?") from the live picture (R9).

**Satisfies:** R4, R5, R6, R9.
**Branch:** `feat/reasoning-gaps`, `feat/reasoning-blockers`, `feat/reasoning-plan`, `feat/reasoning-qa` → tag `v0.5-reasoning`
**Gate:** S3 (gap reported with explanation), S4 (each not-ready discharge gets a specific blocker + reason), S5 (plan is a ranked list, each tied to its gap), S8 (plain-language answers consistent with live picture) pass.

---

### Phase 6 — Web UI

**Goal:** the human surface — bed-board, approval cards, decision timeline, KPI panel, question box (`Architecture.md §4.5`).

1. **Bed-board** — live position: wards, beds and their status, ED queue, predicted discharges. Driven by `GET /state` each tick.
2. **Approval cards** — the R7 surface: each proposed intervention rendered as a card with approve/reject, item-by-item, wired to the driver's gate.
3. **Decision timeline** — the audit trace: gaps → plans → approved actions, from the decision records (R10).
4. **KPI panel** — the slot for R11 evidence (filled by Phase 7).
5. **Question box** — free-text input wired to the orchestrator Q&A (R9).
6. **Clock controls** — step, play, speed, load named scenario (demo-friendliness, PRD §6).

**Satisfies:** the UI surface of R7, R9, R10, R11; PRD §6 demo-friendliness.
**Branch:** `feat/ui-bed-board`, `feat/ui-approval`, `feat/ui-timeline`, `feat/ui-controls` → tag `v0.6-ui`
**Gate:** a human can step the clock, watch the board update, approve/reject a proposed action and see the board change, ask a question and get an answer, and read the decision timeline — end to end in the browser.

---

### Phase 7 — Eval harness + KPIs (the evidence)

**Goal:** hard evidence that the agent helps, not just a demo (`Architecture.md §4.6`, PRD R11). This is the payoff phase.

1. **Headless runner** — `src/eval/run.ts` drives `tick()` across a seeded scenario with no UI.
2. **With/without-agent runs** — run each scenario once *with* the agent's approved actions and once *without* any agent action.
3. **The two KPIs** — compute `FlowKPIs` per run: **access-block hours** (lower better) and **end-of-day headroom** (higher better), as defined in PRD §5.
4. **Handle non-determinism** — the model isn't seeded, so run **N trials per scenario** and report the spread/distribution, not a single replay (PRD §9 risk, `Architecture.md §8`).
5. **Surface in the KPI panel** — both metrics, both runs, both scenarios, in the UI panel from Phase 6.

**Satisfies:** R11, and the headline result S11.
**Branch:** `feat/eval-runner`, `feat/eval-kpis` → tag `v0.7-eval`
**Gate:** S10 (both metrics output for with/without runs in the KPI panel) and **S11** (in *both* scenarios, with-agent shows fewer access-block hours and more end-of-day headroom) pass. This is the project's central claim — treat the gate seriously.

---

### Phase 8 — Polish, docs, and demo

**Goal:** make it a portfolio piece someone can run and read.

Tighten the README (how to run `opencode serve` + the dev server, where the API key goes), record the demo flow, verify the provider swap works (hosted Claude ↔ local Ollama with no change to tools/sim/UI — PRD §6, `Architecture.md §8`), and do a final pass over the full success-criteria checklist S1–S13. Confirm the safety and determinism tests are still green. Tag `0.1.0`.

**Branch:** `chore/polish`, `docs/readme` → tag `0.1.0`
**Gate:** a fresh clone, following only the README, can run the demo and reproduce the eval result.

---

## 5. Requirement & success-criteria coverage map

Every PRD requirement and success criterion lands in a phase. Use this as a checklist.

| Phase | PRD requirements | Success criteria |
| --- | --- | --- |
| 1 · Simulator | R1, R2 | S1, S12 |
| 2 · Tools + safety | R3 | S2, S13 |
| 3 · Harness | (wiring for R3–R8) | — |
| 4 · Loop driver | R7, R8, R10 | S6, S7, S9 |
| 5 · Reasoning | R4, R5, R6, R9 | S3, S4, S5, S8 |
| 6 · Web UI | (surfaces R7, R9, R10, R11) | — |
| 7 · Eval + KPIs | R11 | S10, **S11** |
| 8 · Polish | — | S1–S13 final pass |

## 6. Cross-cutting checks (every phase)

- **`main` stays green** — lint, typecheck, and the full test suite pass before every merge.
- **Safety test never goes red** — once `tests/safety.test.ts` exists (Phase 2), a red result blocks the merge, no exceptions (S13).
- **Determinism holds** — `tests/determinism.test.ts` stays green; if a change makes a seeded run non-reproducible, the environment leaked randomness it shouldn't have (S12).
- **SDK isolation** — nothing outside `src/driver/adapter.ts` imports `@opencode-ai/sdk`. Grep for it before merging.
- **Synthetic only** — no real data path is ever introduced, not even in tests.

## 7. Sequencing rationale (why this order)

- **Environment before everything** — the simulator is the only stateful, domain-aware component; nothing can be tested without it.
- **Tools and the safety test together** — the safety boundary is architectural (`Architecture.md §7`), so the test that guards it must exist as soon as the boundary does, not be retrofitted.
- **Harness before driver** — you can't write the outer loop until the inner loop it prompts exists and responds.
- **Driver before reasoning** — get the approve-then-act plumbing provably correct (S6, S7, S9) before tuning what the agent *thinks*, so reasoning work isn't entangled with control-flow bugs.
- **UI after reasoning** — render real proposals, not placeholders.
- **Eval last** — it needs the whole system to produce the with/without comparison that is the project's headline (S11).

---

## Changelog

| Version | Date | Note |
| --- | --- | --- |
| 1.0.0 | 2026-06-11 | Initial development plan: repo setup, solo trunk-based branching, eight phased milestones mapped to PRD R1–R11 and success criteria S1–S13, coverage map, cross-cutting checks, sequencing rationale. |
