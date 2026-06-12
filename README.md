<div align="center">

# 🏥 Patient Flow Orchestrator

**An AI agent that watches a simulated hospital, predicts where beds will run short, explains why, and proposes ranked fixes — with a human approving every action.**

Perceive → Reason → Plan → Act · Synthetic data only · Zero clinical risk

</div>

---

## What it is

A hospital bed coordinator spends the day working out where capacity will fall short and getting on the phone to fix it. Today's bed-boards *show* the state but can't *think* about it.

This project adds the thinking-and-doing layer: an agent that runs a **perceive → reason → plan → act loop** over a simulated hospital, detects capacity gaps, diagnoses the blockers behind stuck discharges, and proposes a ranked list of fixes — which **a human approves before anything happens**.

It is a **portfolio piece**: it runs entirely on synthetic data, never makes a clinical judgement, and exists to show how an agent is *designed*, not to model medicine.

## How it works

Two nested loops:

- **Outer loop (our code)** — a control loop owns a seedable clock. Each tick it advances the world and sends **one** prompt to the agent, then renders the new position.
- **Inner loop (the OpenCode harness)** — within that prompt, the agent reasons, calls tools, delegates to read-only specialists, and proposes actions behind a permission gate.

> **We own the world and the clock; the harness owns the reasoning within each tick.**

```
┌─ Next.js app (ours) ───────────┐        ┌─ opencode serve (configured) ─┐
│  Bed-board · Approval · KPIs   │        │  Orchestrator (plans)         │
│  Loop driver — owns the clock  │ ─────► │   ├─ Discharge specialist     │
│  Simulator — the environment   │ ◄───── │   └─ Demand specialist        │
└────────────────────────────────┘  SDK   └───────────────────────────────┘
        │                                          │
        └────── Tools bridge (the only ────────────┘
                 hospital-aware code)
```

See [`docs/`](./docs) for the full PRD, architecture, harness companion, and development plan.

## Quick start (Docker)

```bash
cp .env.example .env          # the default model is free — no API key needed
docker compose up --build
```

Open **http://localhost:3000**. The OpenCode harness runs headless alongside the app.

The default reasoning model is the **OpenCode Zen free tier** (`opencode/big-pickle`) — no key, no cost. To use **hosted Claude** instead, add your `ANTHROPIC_API_KEY` to `.env` and point the agents at an `anthropic/*` model.

To run with **local models** (Ollama):

```bash
docker compose --profile local up --build
```

## Local development

Requires Node 20+ and the OpenCode CLI.

```bash
make install      # install dependencies
make dev          # opencode serve (with SIM_URL) + Next.js dev server
make test         # lint + typecheck + unit tests
make eval         # headless with/without-agent KPI comparison
```

Run `make` with no target to list everything. The bed-board, clock, and timeline
work with just `npm run dev`; **Assess** and **Ask** additionally need `opencode serve`.

## Scripts

| Command | What it does |
| --- | --- |
| `make dev` | Start `opencode serve` (pointed at the sim) and the Next.js dev server together |
| `make test` | `lint` + `typecheck` + Vitest unit tests (incl. the safety, determinism & S11 invariants) |
| `make eval` | Run both scenarios with and without the agent, print the two KPIs |
| `make up` / `make down` | Start / stop the Docker Compose stack |
| `make logs` | Tail logs from all services |
| `make clean` | Stop the stack and remove volumes |

## Demo flow

1. `make dev`, open **http://localhost:3000**.
2. Press **Step 30m** a few times — watch the bed-board change as patients arrive, are admitted, and discharge.
3. Press **Assess** — the agent perceives the hospital, detects capacity gaps, and proposes ranked fixes as **approval cards**.
4. **Approve** a card — the action runs, a blocker clears, the board updates, and the **decision timeline** records it. **Reject** changes nothing.
5. Ask a question in the **Ask** box ("why is 4B blocked?").
6. Press **Run eval** in the KPI panel — see the with/without-agent comparison.

## Results — does the agent help?

`make eval` runs each scenario twice (with the agent's interventions, and without any) over a seeded day. The headline (deterministic):

| Scenario | Access-block hours · lower better | End-of-day headroom · higher better |
| --- | --- | --- |
| normal-weekday | **9.0** with · 14.5 without | **2** with · 1 without |
| flu-surge | **44.5** with · 84.5 without | **2** with · 1 without |

In both scenarios the agent's interventions yield **fewer access-block hours and more headroom** — the project's central claim (S11). See [`docs/SUCCESS_CRITERIA.md`](./docs/SUCCESS_CRITERIA.md) for the full S1–S13 checklist and where each is proven.

## Project structure

```
.opencode/          # the agent harness — configured, not coded
  agents/           # orchestrator (primary) + discharge & demand (read-only subagents)
  tools/            # the tools bridge: world_state · forecast_* · expedite_script · request_transport
src/
  sim/              # the Simulator — seedable clock, typed events, transparent forecasts
  driver/           # the loop driver + the single @opencode-ai/sdk adapter
  eval/             # headless with/without-agent KPI runner
  app/              # Next.js UI — bed-board · approval cards · timeline · KPI panel · /api routes
tests/              # safety · determinism · simulator · forecast/actions · driver gate · eval (S11)
spec/               # spec-driven-development records, condensed per release (v1.0, v1.1)
docs/               # PRD · Architecture · OpenCode-Harness · Development Plan · success criteria
```

## Testing & guarantees

- **Safe** — synthetic data only; an invariant test asserts no clinical output (acuity, triage, diagnosis, treatment) ever leaves the system.
- **Repeatable** — the *simulator* is seeded, so the same seed and scenario replay an identical day.
- **Human-gated** — no state changes without item-by-item approval in the driver.
- **Portable** — the reasoning model is swappable (OpenCode Zen ↔ hosted Claude ↔ local Ollama) with no other change.

## Configuration

All settings live in `.env` (see [`.env.example`](./.env.example)):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Hosted Claude access (optional — only if you swap off the free default) |
| `OPENCODE_URL` | Where the app reaches `opencode serve` |
| `SIM_URL` | Where the tools reach the simulator |
| `SCENARIO` | `normal-weekday` or `flu-surge` |
| `SEED` | Fixes the simulated day for reproducible runs |

## License

[MIT](./LICENSE)
