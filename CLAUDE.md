# Project Rules: Patient Flow Orchestrator

## Context

An AI agent running a perceive → reason → plan → act loop over a *simulated* hospital. Our control loop owns a seedable clock; each tick it prompts an agent (in the OpenCode harness) to assess the bed position, explain capacity gaps, and propose ranked fixes — a human approves each before it runs. Synthetic data throughout; a portfolio piece where the agent design is what's on show.

Authoritative docs (docs win over code; bump the doc version on change): `PRD.md`, `Architecture.md`, `OpenCode-Harness.md`, `development-Plan.md`.

## Tech Stack

* Framework: Next.js (App Router)
* Language: TypeScript (Strict mode enabled)
* Agent runtime: OpenCode (`opencode serve`, headless) via `@opencode-ai/sdk` + `@opencode-ai/plugin`
* Models: OpenCode Zen free tier `opencode/big-pickle` (default) · Anthropic API · or local Ollama — swappable
* Simulator: in-process, seedable; HTTP surface `GET /state`, `POST /forecast/*`, `POST /actions/*`
* Testing: Vitest, Playwright

## Coding Principles

* Prefer clarity over cleverness — write code that reads plainly; name things for what they do.
* Keep functions small and single-purpose; keep modules cohesive and loosely coupled.
* Lean on the type system: no `any`, prefer precise types, make illegal states unrepresentable.
* Validate at boundaries (inputs, API edges, tool args) with explicit schemas; trust internal types after.
* Handle errors explicitly — no silent catches; fail loud and early with useful messages.
* No magic values — name constants; no dead code, no commented-out blocks.
* Keep functions pure where practical; isolate side effects (I/O, network, state) behind clear seams.
* Match the style, naming, and patterns of the surrounding code.
* Every change ships with tests; keep them fast and deterministic.
* Comment the *why*, not the *what*; let the code explain the what.

## Prohibitions

* **DO NOT** use real patient data anywhere — synthetic only, including tests and fixtures.
* **DO NOT** emit clinical output (acuity, triage, diagnosis, treatment) in any plan, answer, schema, or record. Enforced by `tests/safety.test.ts` (S13).
* **DO NOT** seed the model for determinism — seed the simulator only (S12).
* **DO NOT** change state without item-by-item human approval in our driver (R7); never rely on OpenCode's `ask`.
* **DO NOT** import `@opencode-ai/sdk` outside `src/driver/adapter.ts`.
* **DO NOT** pin OpenCode/SDK to version ranges — use exact versions.
* **DO NOT** start a phase before the previous gate is green and merged.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
