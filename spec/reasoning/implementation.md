# Implementation Plan — Reasoning Quality (complete blocker coverage)

| | |
| --- | --- |
| **Feature** | Diagnose & surface all four blocker types — flags for the non-actionable ones |
| **Version** | 0.1.0 |
| **Status** | Plan PR — awaiting review/merge |
| **Implements** | `spec.md` (same folder) |

> SDD step 2 (Plan): *how* the spec is built — layout, decisions/trade-offs, and how each acceptance
> criterion (G1–G6) is met and verified. Task breakdown at the end (the code PR).

---

## 1. Architecture

A small extension to the existing plan pipeline — no new components. The orchestrator's JSON plan gains
a `flags` array; the driver exposes it; the UI renders it read-only beneath the approval cards.

```
src/driver/
  types.ts     # ADD Flag; ProposedPlan gains flags: Flag[]
  plan.ts      # zod: optional flags array; parsePlan defaults to []
  adapter.ts   # PLAN_INSTRUCTION: add flags to the JSON shape; identify all four; delegate to @discharge
  driver.ts    # stash current flags; flags() accessor
src/app/
  api/driver/flags/route.ts    # NEW GET -> Flag[]
  components/FlaggedBlockers.tsx # NEW read-only list (no buttons)
  page.tsx                      # flags state; refresh() fetches flags; render under ApprovalCards
  globals.css                   # flag styling
.opencode/agents/orchestrator.md # tighten: surface non-actionable blockers as flags, delegate detail
```

## 2. Component design

### 2.1 Contract — `types.ts`, `plan.ts` (G1)
```ts
interface Flag { patientId: string; wardId: string; blocker: "allied_health" | "placement"; reason: string }
interface ProposedPlan { gaps; interventions; flags: Flag[] }
```
The zod schema makes `flags` **optional** (a sparse model reply still parses); `parsePlan` defaults it
to `[]`. Interventions remain exactly as before (G4).

### 2.2 Prompt — `adapter.ts` + `orchestrator.md` (G2)
`PLAN_INSTRUCTION` gains the `flags` field in the required JSON and an instruction: *for every not-ready
discharge, identify its blocker across all four types; propose actions only for pharmacy/transport;
list the rest (allied-health, placement) under `flags` so they're visible without a one-click fix; you
may delegate per-patient blocker detail to `@discharge`.* The word **"diagnose" is avoided** in any
scanned file (it's on the safety denylist) — we use "identify". `orchestrator.md` gets a matching line.

### 2.3 Driver — `driver.ts` (G1)
`plan()` stashes `plan.flags` (default `[]`); a `flags()` accessor returns a copy. The decision-log
`plan` record's rationale notes the flag count. Approve/reject are unchanged (flags are read-only).

### 2.4 Route + UI — `flags/route.ts`, `FlaggedBlockers.tsx`, `page.tsx` (G3)
`GET /api/driver/flags` returns `getDriver().flags()`. `refresh()` fetches it alongside proposals/records.
`FlaggedBlockers` renders a muted "Flagged — no one-click fix" sub-section under the approval cards:
one row per flag (patient · ward · blocker · reason), **no Approve/Reject**.

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **The LLM populates `flags`** (not the driver deterministically) | It's the agent's *diagnosis* (R5) — the whole point is the agent reporting them. | Flags aren't deterministic, so they're verified live (G6), not by a seeded test; the schema/UI are tested with an injected planner. |
| **`flags` is optional in the schema** | A sparse or imperfect model reply still parses — never a hard failure over a missing array. | A lazy reply could omit flags; the live check (G6) confirms the real agent populates them. |
| **Read-only UI sub-section, no buttons** | Exactly R6 — surfaced for visibility, no one-click fix; can't be mistaken for an action. | Slightly more UI; kept minimal. |
| **Delegate to `@discharge` is best-effort, not required** | The orchestrator already diagnoses inline; forced delegation is model-dependent and brittle. | We don't *prove* delegation happened — acceptable; the subagent stays configured and available. |

## 4. Verification (maps to acceptance criteria)

| Criterion | How verified |
| --- | --- |
| G1 | `tests/driver.test.ts`: an injected planner returning `flags` → `driver.flags()` returns them; `parsePlan` accepts a plan with flags and defaults to `[]` when absent. |
| G2 | Prompt inspection; covered behaviourally by G6. |
| G3 | Live browser + build: the flagged sub-section renders with no action buttons. |
| G4 | Existing driver tests (approve/reject/records) stay green unchanged. |
| G5 | `tests/safety.test.ts` green (no "diagnose"/clinical terms in scanned files); full suite green. |
| G6 | Live: run Assess on a state with allied_health/placement blocked patients; confirm they appear as flags. |

## 5. Task breakdown (SDD step 3) — the code PR

1. `types.ts` + `plan.ts` — `Flag`, optional `flags`, parse default (G1).
2. `adapter.ts` + `orchestrator.md` — prompt for all-four + flags + delegate (G2), avoiding "diagnose".
3. `driver.ts` — stash + `flags()` (G1).
4. `api/driver/flags` route + `FlaggedBlockers` + `page.tsx` wiring + CSS (G3).
5. `tests/driver.test.ts` — flags via injected planner + parse (G1); keep safety/suite green (G5).
6. Live Assess check on a flagged state (G6); gate green.

## 6. Out of scope (restated)

New actions for allied_health/placement (still no v1 lever), the real-agent eval mode, Playwright e2e,
any change to the gate/simulator/KPIs, and any clinical concept.
