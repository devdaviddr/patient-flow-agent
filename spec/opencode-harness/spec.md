# Spec — OpenCode AI Harness

| | |
| --- | --- |
| **Feature** | OpenCode AI Harness (the agent runtime) |
| **Phase** | 3 of the development plan |
| **Version** | 0.1.0 |
| **Status** | Draft — awaiting approval |
| **Branch** | `feat/opencode-harness` |
| **Companions** | `PRD.md` (§7), `OpenCode-Harness.md`, `Architecture.md` (§4.3), `development-Plan.md` (Phase 3) |

> Spec-Driven Development, step 1 (Specify): *what* this feature is and *why*, plus the acceptance
> criteria and scope boundaries. No implementation detail — that lives in `implementation.md`.

---

## 1. Problem

The system needs a reasoning runtime: something that takes a prompt about the hospital's bed
position, calls tools to perceive and forecast, delegates focused work to specialists, and proposes
ranked fixes — pausing for human approval before anything that changes state. Building that loop
from scratch is most of the work in an agent project. This feature stands up that runtime as
**configuration over the OpenCode harness**, not bespoke code.

It is the third dependency in the build chain (Simulator → Tools → **Harness** → Driver → …). Its
job is narrow: prove the agents and tools are wired and reasoning *can* run. It does **not** own the
clock, the approval enforcement, or reasoning quality — those are later phases.

## 2. How this fits the solution

This feature is one named piece of a larger design; here is the trace back to the solution docs so the
boundaries are explicit and verifiable.

- **It is the "inner loop" of two nested harnesses.** The system is an environment harness (ours,
  the outer loop) wrapping an agent harness (OpenCode, the inner loop). This feature *is* the inner
  loop — it owns reasoning **within a single tick**, never the clock or time. (`PRD §7.1`,
  `OpenCode-Harness §2`, `Architecture §2`)
- **It is component 3 of 5, the "configured, not coded" green zone.** In the component architecture
  (Simulator → Tools bridge → **OpenCode harness** → Loop driver → Web UI → Eval) it sits between the
  tools below and the driver above, and is the only component classed as configuration rather than
  code. (`Architecture §1, §4.3`, `PRD §7.3`)
- **It honours the harness-vs-our-code line.** This feature builds only the harness side of that
  table (agents, tool wiring, provider abstraction); the outer loop, the real approval gate, the
  simulator, the UI, and the eval are explicitly the other side — see §6 scope. (`PRD §7.1`,
  `OpenCode-Harness §10`)
- **It sits on the safety boundary.** The reasoning layer is "clinically blind"; it reaches the
  hospital only through neutral tools. Acceptance criterion A8 (no clinical vocabulary in any prompt
  or tool) enforces this boundary at the harness layer. (`Architecture §7`)
- **It is the non-deterministic part, on purpose.** Reproducibility lives in the *simulator* (seeded),
  not here (the model is not seeded) — which is why evaluation later runs N trials. (`Architecture §8`)
- **Its outputs and audit trail belong to later phases.** The harness *produces* `CapacityGap` /
  `Intervention` by prompting, and its session history becomes the audit trail — but the quality of
  those outputs is Phase 5 (Reasoning) and their export is Phase 4 (Driver). Phase 3 proves only the
  wiring. (`Architecture §5, §8`, `development-Plan §4`)

| Cross-cutting concern (`Architecture §8`) | This feature's role |
| --- | --- |
| Safety | Agents call neutral tools only; no clinical vocab (A8) → §7 boundary |
| Observability | Harness session history is the audit trail (exported in Phase 4) |
| Portability | The provider abstraction is the OpenCode Zen ↔ Claude ↔ Ollama swap |
| Human control | `ask` gate as defence-in-depth; the real gate is the Phase 4 driver |
| Reproducibility | **Not** here — the simulator is seeded, the model is not |

## 3. Users

- **The loop driver (Phase 4)** — the primary consumer. It will prompt the harness once per tick via
  the SDK and read back proposed interventions. This feature must present a runtime it can drive.
- **The developer** — needs to start the harness headless, confirm it loads, and manually prompt the
  orchestrator to see a tool call happen.

## 4. User stories

- As the **loop driver**, I can reach a headless harness over a local API so I can send one prompt
  per tick.
- As the **orchestrator agent**, I can call the five hospital tools and delegate to two read-only
  specialists, so I can perceive, forecast, and diagnose without holding everything in one context.
- As a **specialist subagent**, I am restricted to read-only tools, so the ability to change state
  exists in exactly one agent.
- As the **developer**, I can start `opencode serve` and confirm it lists three agents and five tools.
- As the **developer**, I can prompt the orchestrator and observe it call `world_state`.
- As a **safety reviewer**, I can read every agent prompt and tool definition and find no clinical
  vocabulary (acuity, triage, diagnosis, treatment).

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| A1 | `opencode serve` starts headless and is reachable on a local port. | Phase 3 gate |
| A2 | The harness loads exactly three project agents: `orchestrator` (primary), `discharge` and `demand` (subagents). | PRD §7.2 |
| A3 | The harness registers exactly five project tools: `world_state`, `forecast_discharges`, `forecast_demand`, `expedite_script`, `request_transport`. | PRD §7.4 |
| A4 | The orchestrator may use all five tools; the two action tools are gated for approval. | R7 (defence-in-depth) |
| A5 | Each subagent can reach only its read tools (`world_state` + its one forecast); all other tools, especially the action tools, are denied. | PRD §7.2 |
| A6 | Subagents have their model set **explicitly** (they must not silently inherit the orchestrator's model). | OpenCode-Harness §5 |
| A7 | A manual prompt to the orchestrator produces a tool call to `world_state`. | Phase 3 gate |
| A8 | No agent prompt or tool definition contains clinical vocabulary; tools speak only the neutral hospital-logistics vocabulary. | S13 / safety boundary |
| A9 | The default run path works with **no API key and no local model server** (free OpenCode Zen provider); hosted Claude and local Ollama remain swappable options. | PRD §10 |
| A10 | The OpenCode version is pinned, not floating. | development-Plan §2.3 |

## 6. Scope

### In scope
- The harness configuration: `opencode.json` (default provider/model + per-tool permission defaults).
- Three agent definitions (one primary, two read-only subagents) with models, permissions, and prompts.
- Five tool definitions (three read, two action) that bridge to the simulator's HTTP surface.
- A way to run and verify the harness loads, standalone, before the simulator and driver exist.
- Containerisation of the harness for the local stack.

### Out of scope (later phases)
- **The clock and the per-tick outer loop** — Phase 4 (driver).
- **The real approval gate** — Phase 4. Here the action tools are only marked `ask` as defence-in-depth.
- **Reasoning quality** — gap detection, blocker diagnosis depth, ranked-plan tuning, Q&A — Phase 5.
- **The simulator itself** — Phase 1. This feature targets the simulator's HTTP contract; until that
  exists the tools may stand in with mock data so the harness is runnable.
- **The UI, eval harness, and decision records.**

## 7. Dependencies & assumptions

- Assumes the simulator's HTTP contract from `Architecture.md §4.1` (`GET /state`, `POST /forecast/*`,
  `POST /actions/*`) — even though the simulator is built later.
- Assumes an `ANTHROPIC_API_KEY` is available for any real prompt (A7); loading (A1–A6, A8) needs no key.
- Assumes the OpenCode CLI/SDK API shape of the pinned version; API drift is a known project risk.

## 8. Open questions

- None blocking. The simulator contract is taken as given from `Architecture.md`; if it changes, the
  tools change with it (and this spec's §7 assumption is revisited).
