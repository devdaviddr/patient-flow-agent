# Spec — Loop Driver + Approval Gate

| | |
| --- | --- |
| **Feature** | The outer control loop: clock, per-tick prompting, the real human-approval gate, re-planning, decision records |
| **Phase** | 4 of the development plan |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (D1–D8) — code PR open |
| **Branch** | `feat/loop-driver` (plan) → `feat/loop-driver-impl` (code) |
| **Companions** | `Architecture.md` (§4.4, §6), `OpenCode-Harness.md` (§7–8), `PRD.md` (R7, R8, R10, S6, S7, S9), `development-Plan.md` (Phase 4) |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md`.

---

## 1. Problem

Today *you* are the loop: you run the agent by hand, and there's nothing stopping the agent from
changing state without asking. This feature builds the **outer loop that makes the system agentic over
time** and **the human-approval gate that makes it safe** — both genuinely our code, not the harness.

Each tick, the driver advances the clock, prompts the agent once to assess and **propose** fixes,
surfaces those proposals for **item-by-item human approval**, executes only the approved ones, records
every decision, and re-plans. The agent *proposes*; a person *decides*; only then does anything change.

## 2. How this fits the solution

- **It is component 4 of 5 — the loop driver, our code.** It owns the clock and re-prompts each tick;
  the harness only reasons within a tick. This is the "outer loop" of the two-nested-loops design.
  (`Architecture §1, §4.4`, `OpenCode-Harness §2`)
- **It is where the *real* approval gate lives.** A known issue lets the SDK bypass the harness `ask`,
  so the gate that actually blocks a state change is in the driver — the agent only proposes; the
  driver executes approved items. (`OpenCode-Harness §7`, `PRD §10`)
- **It closes the agentic loop.** Re-prompting on the new state after an approved action or a clock
  tick is what makes the system agentic *over time*. (`Architecture §6`, R8)
- **It produces the audit trail.** Every gap, plan, and action is saved as a `DecisionRecord` with the
  state it was based on and the reasoning behind it. (`Architecture §8`, R10)
- **It isolates the SDK.** Every `@opencode-ai/sdk` call sits behind one adapter module, so API drift
  touches one file. (`Architecture §11`, `OpenCode-Harness §8`)
- **It is headless.** No UI here — the driver exposes the interfaces the Phase 6 UI and the Phase 7
  eval will drive; everything is testable from code.

## 3. Users

- **The developer / tests** — drive `tick()` and the approve/reject interface headlessly and assert
  the loop behaves (reject → nothing changes; approve → exactly one event).
- **The Phase 6 UI** — will render the proposals as approval cards and call the driver's approve/reject.
- **The Phase 7 eval harness** — will reuse `tick()` to run a scenario with and without agent actions.
- **The flow coordinator (in-world)** — ultimately the human who approves, via the UI.

## 4. User stories

- As the **driver**, each tick I advance the clock, prompt the orchestrator once, and receive its
  **proposed** capacity gaps and ranked interventions — with **no** state change yet.
- As a **human (or test)**, I see each proposed intervention and approve or reject it **individually**;
  approving runs exactly that one action, rejecting runs nothing.
- As the **driver**, after an approved action takes effect I **re-plan** on the new state, and I also
  re-plan when the clock advances.
- As an **auditor**, I can read a record of every gap, plan, and action — each with the state it was
  based on and its rationale — in order.
- As a **maintainer**, I can see that only one module touches the OpenCode SDK.

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| D1 | A single adapter (`src/driver/adapter.ts`) is the **only** module importing `@opencode-ai/sdk`; it manages a session and exposes a `prompt()` call. | `Architecture §11` |
| D2 | `tick()` sends **exactly one** prompt per clock step and returns the orchestrator's proposed `CapacityGap`s + ranked `Intervention`s — **without executing** any state-changing action. | R8 / `Architecture §6` |
| D3 | No state-changing action runs until a human approves it, **item-by-item**. Approve → exactly that one action executes (one `blocker_resolved`); reject → state unchanged. | **R7 / S6** |
| D4 | After an approved action, and when the clock advances, the driver re-plans; the new position is traceable to the change. | R8 / **S7** |
| D5 | Every gap, plan, and action is saved as a `DecisionRecord` (state reference + rationale), retrievable in order. | R10 / **S9** |
| D6 | The gate is enforced in the driver, **not** the harness `ask` — proven by a test that approves/rejects without relying on any harness permission event. | `OpenCode-Harness §7` |
| D7 | The whole loop is exercisable **headlessly** (no UI): the driver exposes the proposal + approve/reject interface to code. | `development-Plan §4` |
| D8 | The gate is green: `typecheck`, `lint`, `build`, and all tests (incl. the S6/S7/S9 driver tests). | dev-plan cross-cutting |

## 6. Scope

### In scope
- `src/driver/adapter.ts` — the one SDK wrapper (session + `prompt()`).
- `src/driver/tick.ts` — one prompt per clock step; collect proposed gaps + interventions (no execution).
- The **real approval gate** — surface proposals, run an approved action via the simulator, item-by-item.
- **Re-plan triggers** — after an approved action and on clock advance.
- **Decision records** — an in-process store of gaps/plans/actions with state + rationale, retrievable.
- A **headless test surface** so S6/S7/S9 are provable before any UI.

### Out of scope (later phases)
- **The UI** — approval cards, bed-board, timeline (Phase 6). The driver only exposes interfaces.
- **Reasoning quality** — how *well* the orchestrator detects gaps / ranks fixes / diagnoses blockers
  across all four types (Phase 5). This feature accepts whatever the agent proposes and gates it.
- **The eval harness + KPIs** (Phase 7), though it will reuse `tick()`.
- **Persistence** — decision records live in process for v1; durable storage is a later concern.

## 7. Dependencies & assumptions

- Builds on the merged simulator (Phase 1), tools+actions (Phase 2), and harness (Phase 3) on `main`.
- Assumes a running `opencode serve` reachable at `OPENCODE_URL`, and the simulator reachable at
  `SIM_URL` — the driver coordinates the two.
- Assumes the orchestrator can return its plan in a form the driver can read reliably (see §8).
- The driver executes approved actions by calling the simulator action endpoints **directly** — it
  never depends on the harness to run (or to block) an action.

## 8. Resolved decisions (detail in implementation.md)

1. **Structured proposals** → the orchestrator ends its turn with a **strict JSON plan**; the driver
   parses + zod-validates it (one retry on failure). No cross-process tool plumbing.
2. **Executing approved actions** → the driver runs them **in-process** via
   `getSimulator().resolveBlocker(...)` (it shares the process with the sim singleton) — the gate lives
   entirely in our code, never the harness `ask`.
3. **Decision records** → recorded **in the driver** from `plan()`/`approve()`/`reject()`, in process,
   retrievable in order.
4. **Clock control** → the **driver coordinates**: prompt on the current state, then `advanceClock()`
   via the sim, then re-plan. Tests drive these steps explicitly; a real run loops them.
