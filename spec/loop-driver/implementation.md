# Implementation Plan — Loop Driver + Approval Gate

| | |
| --- | --- |
| **Feature** | Loop driver, real approval gate, re-planning, decision records |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (D1–D8) — code PR open |
| **Implements** | `spec.md` (same folder) |

> SDD step 2 (Plan): *how* the spec is built — layout, key decisions/trade-offs, and how each
> acceptance criterion (D1–D8) is met and verified. Task breakdown at the end (the code PR).

---

## 1. Architecture

The driver runs **in the Next.js process**, alongside the simulator singleton. That matters: the driver
reads sim state and executes approved actions **in-process** via `getSimulator()` — it never self-HTTPs
the sim. The only network hop the driver makes is to `opencode serve` (the agent), through one adapter.

```
src/driver/
  adapter.ts     # the ONLY @opencode-ai/sdk importer — session + promptOrchestrator(text)
  types.ts       # CapacityGap, Intervention, DecisionRecord, ProposedPlan
  plan.ts        # zod schema + parsePlan(text): extract & validate the agent's JSON plan
  records.ts     # in-process DecisionRecord store (append + list)
  driver.ts      # Driver class: plan() · approve(id) · reject(id) · advanceClock() · records()
```

The agent's role narrows: **it proposes, it does not execute.** The driver instructs the orchestrator
to perceive → forecast → detect gaps → rank fixes, and to **end its turn with a strict JSON plan**.
The driver parses that, surfaces it, and on approval calls `getSimulator().resolveBlocker(...)` itself.

```
Driver.plan()  ── prompt (1×) ─▶ orchestrator ──▶ JSON plan ──▶ parse+validate ──▶ proposals (+ records)
Human/test ── approve(id) ─▶ Driver ── resolveBlocker() ─▶ sim mutates ─▶ record(action)
           ── reject(id)  ─▶ Driver ── record(rejected), no state change
Driver.advanceClock() ─▶ sim.step()           (then plan() again = re-plan)
```

## 2. Component design

### 2.1 Adapter — `adapter.ts` (the SDK boundary, D1)
The single module importing `@opencode-ai/sdk` (added as a pinned dependency). Lazily creates a client
(`createOpencodeClient({ baseUrl: OPENCODE_URL })`) and a session, and exposes
`promptOrchestrator(text): Promise<string>` which runs `session.prompt` against the `orchestrator`
agent and returns the assistant's concatenated text. The exact SDK request/response shape is verified
against the pinned SDK in the code PR; nothing else in the repo imports the SDK.

### 2.2 Plan contract — `plan.ts` (D2)
A zod schema for what the orchestrator must return:

```ts
ProposedPlan = {
  gaps: { wardId, atTime, projectedDeficit, factors: string[] }[]
  interventions: {
    type: "expedite_script" | "request_transport",
    targetPatientId: string, addressesGap: string,
    impactScore: number, rationale: string
  }[]   // ranked, highest impact first
}
```

`parsePlan(text)` extracts the last fenced ```json block, `JSON.parse`s it, and validates. The driver
**assigns stable `id`s** to interventions after parsing (the agent needn't supply them). On a
parse/validation failure the adapter re-prompts **once** with a terse "return valid JSON only"
correction; a second failure surfaces as an error (no silent empty plan).

### 2.3 Decision records — `records.ts` (D5)
An in-process append-only list of `DecisionRecord { at, type: 'gap'|'plan'|'action', stateRef,
rationale, payload }`. `stateRef` is the sim's `at` at the moment of the decision. `plan()` records the
gaps and the plan; `approve()`/`reject()` record the action and its outcome.

### 2.4 Driver — `driver.ts` (D3, D4, D6, D7)
```ts
class Driver {
  constructor(deps?: { planner?: () => Promise<ProposedPlan> })  // planner defaults to the real adapter
  plan(): Promise<ProposedPlan>          // prompt + parse + record + stash current proposals
  approve(interventionId): ActionResult  // execute the matching action via sim, record
  reject(interventionId): void           // record, no state change
  advanceClock(): SimEvent[]             // getSimulator().step()
  records(): DecisionRecord[]
}
```

`approve` maps the intervention type to its blocker (`expedite_script → pharmacy_script`,
`request_transport → transport`) and calls `getSimulator().resolveBlocker(...)` — **the gate is here,
in our code, never the harness `ask`** (D6). Re-planning (D4) is the caller invoking `plan()` again
after `approve()` or `advanceClock()`.

The **injectable `planner`** is the key to D7: tests pass a fake planner returning a crafted plan, so
the whole gate is exercised **headlessly and deterministically** — no model call, no network. The real
adapter-backed planner is used in the live integration check.

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Agent proposes via strict JSON in its final message; driver parses (zod, 1 retry)** | No cross-process tool plumbing; the SDK already returns the assistant text; validation keeps it safe. | LLM JSON can be malformed — mitigated by the retry + hard error (never a silent empty plan). |
| **Driver executes approved actions in-process via `getSimulator()`** | The driver shares the process with the sim singleton; keeps the gate fully in our code; no self-HTTP. | Driver and sim are coupled in one process (fine for v1 local-first; a split would need the HTTP path). |
| **Injectable `planner` for tests** | S6/S7/S9 become deterministic and offline — no model, no flakiness — which is exactly what a *gate* test needs. | The model-backed path is covered by a separate live check, not CI. |
| **Decision records in-process** | Simplest thing that satisfies R10/S9; we control the shape for the future timeline. | Lost on restart — acceptable for v1; persistence is later. |
| **SDK only in `adapter.ts` (+ pinned dep)** | OpenCode APIs drift; one file absorbs the churn. | A grep guard in tests/review keeps it honest. |
| **No driver HTTP API yet** | The UI (Phase 6) will add the routes; Phase 4 only needs a code surface (D7). | The future UI work adds a thin route layer over the Driver class. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| D1 | Grep: only `adapter.ts` imports `@opencode-ai/sdk`. |
| D2 | Driver test with a fake planner: `plan()` returns gaps + ranked interventions and changes no state. |
| D3 / S6 | Inject a plan proposing `expedite_script` for a pharmacy-blocked patient: `approve()` → that patient unblocked + exactly one `blocker_resolved`; `reject()` → state byte-identical. |
| D4 / S7 | After `approve()`, a second `plan()` reflects the change; `advanceClock()` changes `state.at` and the position. |
| D5 / S9 | After plan + approve, `records()` contains `gap`, `plan`, and `action` entries with non-empty rationale + stateRef. |
| D6 | The gate tests run with **no** `opencode serve` and no harness permission events — proving the gate is the driver's. |
| D7 | All the above run headlessly via the Driver class (no UI). |
| D8 | `typecheck`, `lint`, `build`, all tests green. |
| (live) | Manual integration check: real adapter against `opencode serve` + sim — `plan()` returns a valid parsed plan; approve unblocks a patient. Not in CI (needs the model). |

## 5. Task breakdown (SDD step 3) — the code PR

1. Add `@opencode-ai/sdk` (pinned) to `package.json`.
2. `types.ts` + `plan.ts` — contracts + zod schema + `parsePlan` (D2).
3. `adapter.ts` — SDK session + `promptOrchestrator` (D1); verify the SDK shape live.
4. `records.ts` — decision-record store (D5).
5. `driver.ts` — `plan`/`approve`/`reject`/`advanceClock`/`records`, injectable planner (D3, D4, D6, D7).
6. `tests/driver.test.ts` — S6 (approve/reject), S7 (re-plan/advance), S9 (records), D6 (no-harness gate).
7. Live integration check with the real adapter (manual); gate green (D8).

## 6. Out of scope (restated)

The UI and its routes (Phase 6), reasoning quality / ranking depth (Phase 5), the eval harness + KPIs
(Phase 7), durable persistence, and any clinical concept (never).
