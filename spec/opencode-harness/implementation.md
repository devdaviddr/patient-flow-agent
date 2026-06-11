# Implementation Plan — OpenCode AI Harness

| | |
| --- | --- |
| **Feature** | OpenCode AI Harness |
| **Version** | 1.0.0 |
| **Status** | ✅ Done — merged to `main` (PR #1) |
| **Implements** | `spec.md` (same folder) |

> Spec-Driven Development, step 2 (Plan): *how* the spec is built — file layout, the key technical
> decisions and their trade-offs, and how each acceptance criterion is met and verified. The task
> breakdown (step 3) follows at the end.

---

## 1. Architecture

The harness is a separate headless process (`opencode serve`) that the Next.js backend will later
drive over the SDK. Everything it needs is declarative and lives in the repo:

```
opencode.json                 # default model + per-tool permission defaults
.opencode/
  agents/
    orchestrator.md           # primary — plans & proposes
    discharge.md              # subagent — read-only blocker diagnosis
    demand.md                 # subagent — read-only demand forecast
  tools/
    world_state.ts            # read
    forecast_discharges.ts    # read
    forecast_demand.ts        # read
    expedite_script.ts        # action (gated)
    request_transport.ts      # action (gated)
opencode.Dockerfile           # pinned, headless harness image
```

Agents are Markdown (YAML front-matter = config, body = system prompt). Tools are TypeScript using
`tool()` + `tool.schema` (Zod) from `@opencode-ai/plugin`. The tools are the **only** hospital-aware
code; they translate the agent's neutral calls into the simulator's HTTP API.

```
orchestrator (primary, capable model)
  ├─ tools: world_state, forecast_*, expedite_script(ask), request_transport(ask)
  ├─ @discharge (subagent, cheap model, read-only)
  └─ @demand    (subagent, cheap model, read-only)
```

## 2. Component design

### 2.1 `opencode.json`
Sets the default model and the global per-tool permission baseline (read tools `allow`, action tools
`ask`). Agents tighten this further. (A3, A4)

### 2.2 Orchestrator — `orchestrator.md`
`mode: primary`, model `opencode/big-pickle` (free OpenCode Zen tier). Permissions: all read tools
`allow`, both action tools `ask`. Prompt
encodes the perceive → forecast → detect-gaps → delegate → rank → propose cycle and an explicit
"never assign acuity, triage, diagnosis, or treatment" line. (A2, A4, A7, A8)

### 2.3 Subagents — `discharge.md`, `demand.md`
`mode: subagent`, model set **explicitly** to `opencode/big-pickle` (so they don't silently inherit
the orchestrator's; on a free tier the cost differentiation is moot, but the explicit set still matters). Each
allows `world_state` + its one forecast tool and denies everything else via `"*": deny` — which
removes the action tools. Narrow, single-purpose prompts; both forbidden from proposing actions. (A2, A5, A6, A8)

### 2.4 Tools — `.opencode/tools/*.ts`
Read tools `GET /state` / `POST /forecast/*`; action tools `POST /actions/*`. Each declares its args
with `tool.schema`. Vocabulary is logistics-only — no clinical concepts. (A3, A8)

### 2.5 Containerisation — `opencode.Dockerfile`
`node:22-slim` + `npm i -g opencode-ai@<pinned>`; serves on `0.0.0.0:4096`. Mounted into the compose
stack with `.opencode/` and `opencode.json` at the working directory. (A1, A9, A10)

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **OpenCode Zen free tier (`opencode/big-pickle`) as the default for all three agents** (docs showed Claude + `ollama/llama3.1`). | Zero-key, zero-cost, zero-local-server demo — anyone can clone and run it. Honours PRD §10's "default demo model" choice (now revised to Zen) and provider portability. Verified end-to-end (A7). | All three agents share one model, so the "cheaper subagents" cost split is lost — moot while the tier is free; revisit if we move the orchestrator to a paid model. Hosted Claude and Ollama stay swappable. |
| **Tools fall back to mock data when the simulator is unreachable.** | The harness must be loadable and demonstrable in Phase 3, before the Phase 1 simulator exists. | Mock code must be removed once the simulator lands; each mock is tagged `_mock: true` to make that explicit. |
| **Build-your-own pinned image, not the official `ghcr.io/anomalyco/opencode`.** | Honours the "pin the version" rule (development-Plan §2.3); the official image's tags lag npm releases. | We maintain a one-line Dockerfile and bump the pin ourselves. |
| **`ask` on action tools is defence-in-depth only.** | A known issue lets the SDK bypass `ask`; the real gate is the Phase 4 driver. | Two places express the gate; must not let `ask` lull us into skipping the driver gate. |
| **One primary + two read-only subagents.** | Keeps the action capability in exactly one agent and each context small. | More moving parts than a single mega-prompt; justified by the safety and focus benefits. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| A1 | Start `opencode serve`; confirm it listens on the port. |
| A2 | Query the harness agent list; assert `orchestrator`, `discharge`, `demand` present with right modes. |
| A3 | Query the harness tool ids; assert the five project tools register. |
| A4–A6 | Inspect the resolved agent config: orchestrator action tools `ask`; subagents read-only with explicit cheap model. |
| A7 | Prompt the orchestrator (`opencode run --agent orchestrator …`); observe a `world_state` tool call. **PASSED** on `opencode/big-pickle` (free) — it called `world_state` and summarised the mock state. |
| A8 | Grep agent prompts + tool files for clinical vocabulary; expect none. (Becomes the Phase 2 safety test's territory.) |
| A9 | Default compose path builds and serves with no Ollama service. |
| A10 | Dockerfile pins `opencode-ai@<version>`; no floating tag. |

A1–A6 were confirmed against a live `opencode serve` (CLI 1.17.3); A7 passed via
`opencode run --agent orchestrator` on the free `opencode/big-pickle` model — the orchestrator called
`world_state` and returned a correct summary of the mock state. A8–A10 hold by construction.

## 5. Task breakdown (SDD step 3)

1. `opencode.json` — default model + permission baseline.
2. `orchestrator.md` — primary agent config + prompt.
3. `discharge.md`, `demand.md` — read-only subagents.
4. Five tool files — three read, two action, with mock fallback.
5. `opencode.Dockerfile` + compose wiring + `OPENCODE_SERVER_PASSWORD`.
6. Verify A1–A6 against a running server; hand A7 to the approver.

## 6. Reconciliation note

Exploratory code for all six tasks already exists on `feat/opencode-harness` (written before this
spec — a process miss now corrected). On approval of this plan, that code is treated as the
implementation of tasks 1–5 and checked against §4; any divergence from the approved spec is fixed
before merge.
