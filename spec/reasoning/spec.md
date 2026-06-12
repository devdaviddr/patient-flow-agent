# Spec — Reasoning Quality (complete blocker coverage)

| | |
| --- | --- |
| **Feature** | Diagnose & surface all four blocker types — including the non-actionable ones |
| **Phase** | 5 of the development plan |
| **Version** | 0.1.0 |
| **Status** | Plan PR — awaiting review/merge |
| **Branch** | `feat/reasoning` (plan) → `feat/reasoning-impl` (code) |
| **Companions** | `PRD.md` (R4, R5, R6, R9, S4), `Architecture.md` (§7.2 subagents), `development-Plan.md` (Phase 5) |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md`.

---

## 1. Problem

The agent proposes fixes for the **two actionable** blockers (`pharmacy_script`, `transport`), and that
all works. But a stuck discharge can be blocked on **four** things — the other two (`allied_health`,
`placement`) have no one-click fix in v1, and right now they are **invisible** in the plan and UI. A
coordinator can't see "two beds in 4B are stuck on placement," so they can't chase them off-system.

This feature closes that gap: the agent **diagnoses all four** blocker types and **surfaces the
non-actionable ones as flags** — visible, explained, but without an approve button. It's the
completeness of R5/R6 that the earlier phases deferred.

## 2. How this fits the solution

- **It completes R5/R6.** R5 — *"the agent diagnoses all four blocker types"*; R6 — *"a blocker with no
  v1 action is still surfaced, just without a one-click fix."* The plumbing (Phase 4) and the four
  blocker types (Phase 1) exist; this makes the agent *report all of them*. (`PRD R5, R6`)
- **It uses the discharge specialist's brief.** The `discharge` subagent's whole job is per-patient
  blocker diagnosis across all four types (`Architecture §7.2`); this feature realises that in the
  output the human sees.
- **It changes nothing about the gate.** Flags are read-only visibility — no new actions, no new state
  changes. The approval gate (Phase 4) is untouched.
- **It must still pass the safety boundary.** New prompt/output text stays logistics-only; the safety
  invariant test continues to guard it. (`Architecture §7`, S13)

## 3. Users

- **The coordinator** — sees *every* stuck discharge and why, not just the ones with a one-click fix, so
  they know what to chase manually.
- **The orchestrator / discharge specialist** — diagnoses all four blocker types and reports the
  non-actionable ones as flags.
- **The developer** — has a schema + test that the plan carries flags and the UI renders them.

## 4. User stories

- As a **coordinator**, when I press Assess I see, alongside the actionable approval cards, a **"flagged
  — no one-click fix"** list naming each patient stuck on `allied_health` or `placement` and why.
- As a **coordinator**, a flag has **no Approve button** — it's there so I know to chase it off-system.
- As the **agent**, I diagnose a blocker for *every* not-ready discharge, across all four types.
- As a **safety reviewer**, the new flags/prompts contain no clinical vocabulary — the build stays green.

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| G1 | The proposed plan carries a **`flags`** list: each not-ready discharge blocked on a **non-actionable** type (`allied_health`, `placement`), with `patientId`, `wardId`, `blocker`, and a plain-English `reason`. | R6 / S4 |
| G2 | The orchestrator is prompted to diagnose **all four** blocker types and populate `flags` for the non-actionable ones (delegating detail to `@discharge`). | R5 |
| G3 | The UI surfaces flags **distinctly** from actionable interventions — listed, explained, **no Approve/Reject buttons**. | R6 |
| G4 | Actionable interventions (the existing approval cards) are unchanged. | (no regression) |
| G5 | The safety invariant still holds over the new prompt + flag outputs; all existing tests stay green. | S13 |
| G6 | Live: on a state with `allied_health` / `placement` blocked patients, the real agent surfaces them as flags. | R5/R6 |

## 6. Scope

### In scope
- Extend the plan contract with `flags` (non-actionable blocked discharges).
- Update the orchestrator prompt (diagnose all four; populate flags; tighten gap factors; delegate to `@discharge`).
- Render flags in the UI proposals panel (read-only).
- Tests for the schema/driver/UI; keep the safety + existing suites green.

### Out of scope (later / never)
- **New actions** for `allied_health` / `placement` — still no v1 lever; flags are visibility only.
- The real-agent eval mode, Playwright e2e (separately deferred).
- Any change to the approval gate, the simulator, or the KPIs.
- Any clinical concept.

## 7. Dependencies & assumptions

- Builds on the merged driver/plan (Phase 4), UI (Phase 6), and harness (Phase 3) on `main`.
- The simulator already models all four blocker types per patient; this surfaces them, it invents nothing.
- Flags are diagnosed by the agent (its job). Determinism of flags isn't required — the agent isn't
  seeded; tests use an injected planner for the schema/UI and verify the real agent live (G6).

## 8. Resolved decisions (detail in implementation.md)

1. **Who populates `flags`** → the **LLM** (the agent's diagnosis, per R5), with the schema making
   `flags` **optional** so a sparse reply still parses; verified live (G6).
2. **UI placement** → a muted **"Flagged — no one-click fix"** sub-section under the proposals panel,
   no buttons.
3. **Subagent delegation** → prompt the orchestrator to delegate detail to `@discharge` **best-effort**,
   not hard-required.
