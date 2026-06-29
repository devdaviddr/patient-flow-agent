# Spec — Ground the agent's plan against the live world before surfacing it

| | |
| --- | --- |
| **Feature** | Validate every proposed intervention against the live `WorldState` after parsing and before it's surfaced as approvable — so a hallucinated or mismatched proposal is dropped (and recorded) instead of silently becoming a no-op on approval. |
| **Issue** | [#74](https://github.com/devdaviddr/patient-flow-agent/issues/74) item 1 · **P1** · milestone *Agent Credibility & Correctness* |
| **Target release** | `0.6.0` (agent reasoning) |
| **Status** | 📝 SDD step 1 (Specify) |
| **Branch** | `feat/agent-grounding` (plan) → `feat/agent-grounding-impl` (code) |
| **Companions** | `spec/agent-gate/` (the R7 gate this complements), `docs/PRD.md` (R5/R6) |

> SDD step 1: *what* and *why* + acceptance criteria. No implementation detail — that
> lives in `implementation.md`. First and highest-value item of the #74 reasoning set.

---

## 1. Problem

The orchestrator returns a one-shot JSON plan that we parse (Zod) and surface as
approvable interventions. **Nothing checks the plan against reality.** Each
intervention names a `targetPatientId` and an action `type` whose matching blocker is
fixed (`expedite_script → pharmacy_script`, `request_transport → transport`,
`page_allied_health → allied_health`, `request_placement → placement`).

If the model **hallucinates a patient id**, or proposes the **wrong action for a
patient's actual blocker** (says `request_transport` for a patient who is really
`placement`-blocked), the approval still appears valid in the UI — but on approval
`Simulator.resolveBlocker(patientId, blocker)` **safely no-ops** (it checks the
patient exists and is blocked on exactly that type). The result: a coordinator approves
an action that **changes nothing**, with no signal that it was ungrounded.

So a plausible-but-wrong plan degrades silently to zero effect. We want it to be
**caught at the boundary** — dropped from the approvable set, and recorded so the
behaviour is visible in the audit trail.

## 2. How this fits the solution

- **It complements the R7 gate (`#42`), it doesn't change it.** The gate guarantees a
  human approves every state change; grounding guarantees the human is only offered
  changes that *can actually happen*. Together: nothing changes without approval, and
  nothing approvable is a silent no-op.
- **It's deterministic and offline.** Grounding is a pure check against `WorldState`,
  in our driver — no model, no network. Fully testable with an injected planner.
- **It strengthens R5/R6.** A "specific blocker, actionable fix" (R5/R6) is only
  meaningful if the fix matches the patient's real blocker; grounding enforces that.
- **It keeps the audit honest (R10).** Dropped proposals are recorded with a reason, so
  "the agent proposed X but it didn't match reality" is inspectable, not invisible.
- **Safety/determinism untouched.** No clinical content; the seeded sim is only *read*.

## 3. Users

- **The coordinator** — is only shown interventions that will actually free a bed; an
  approval never silently does nothing.
- **The technical reviewer** — sees that the system defends against model hallucination
  at the boundary, and that ungrounded proposals are logged, not hidden.
- **The developer** — gets a pure, deterministic seam that's trivial to test offline.

## 4. User stories

- As a **coordinator**, when I approve a proposed fix, it always targets a patient who
  is really blocked on the type that fix clears — I never approve a no-op.
- As an **auditor**, if the agent proposed something ungrounded, the decision timeline
  shows it was dropped and **why** (no such patient / blocker mismatch).
- As a **developer**, I can feed the driver a hallucinated plan in an offline test and
  assert exactly the grounded subset is surfaced.

## 5. Acceptance criteria

| # | Criterion |
| --- | --- |
| **G1** | **Existence check.** An intervention whose `targetPatientId` is not in the live `WorldState` is **not surfaced** as a proposal. |
| **G2** | **Blocker-match check.** An intervention is surfaced only if the target patient's current `blocker` equals the blocker the action clears (per the fixed action→blocker map). A mismatch is dropped. |
| **G3** | **Grounded set only.** `proposals()` / the approval cards contain **only** grounded interventions; `approve()` on a surfaced item therefore always applies (never the silent no-op). |
| **G4** | **Recorded, not hidden.** Each dropped intervention is recorded (count + per-item reason) on the `plan` decision record, so the drop is visible in the audit/timeline (R10). |
| **G5** | **Gaps & flags unchanged.** Capacity gaps and non-actionable flags are unaffected (grounding applies to *interventions* only). |
| **G6** | **Deterministic & offline.** Grounding is a pure function of `(interventions, WorldState)` — no model/network — and is covered by offline tests (hallucinated id, blocker mismatch, all-valid). |
| **G7** | **No regressions.** R7 gate, S12, S13, and the existing suite stay green; the real-agent eval still auto-approves only what's now surfaced (the grounded set). |

## 6. Scope

### In scope
- A pure grounding step in the driver's plan-application seam that filters interventions
  against the live world (existence + blocker-match), keeping the grounded set and a
  list of dropped items with reasons.
- Recording the dropped count + reasons on the `plan` decision record.

### Out of scope → later items of #74
- Defensible **impact ranking** / bounding `impactScore` (item 2).
- **Forced structured output** replacing the fenced-block parse (item 3).
- A **reasoning-quality eval** (item 4); the subagent/memory/retry items (5–7).
- Grounding `addressesGap` against the emitted gaps — `addressesGap` is *descriptive*
  free text, not a precondition for the action, so it is **not** a drop criterion here
  (noted so a future item can revisit if wanted).

### Out of scope (never, here)
- Any change to the simulator, the agent prompts, the approval UX beyond showing only
  grounded proposals, or the R7 gate.

## 7. Dependencies & assumptions

- Builds on the existing action→blocker map already used by `approve()` and the
  simulator's `resolveBlocker` precondition — grounding reuses the *same* rule, so a
  surfaced item is exactly one `resolveBlocker` will apply.
- No blocking dependency; independent of the other #74 items (it's their foundation).
- Synthetic only; the sim is read, never mutated, by grounding (S12 safe).

## 8. Resolved decisions (detail in `implementation.md`)

1. **Drop, don't surface** ungrounded interventions (vs. flagging them as approvable) —
   the point is that they *can't* act; keep them out of the approvable set, but record
   them for audit.
2. **Reuse the action→blocker map** as the single source for both grounding and
   `approve()`, so "surfaced" ⇔ "`resolveBlocker` will apply" by construction.
3. **Ground only on verifiable preconditions** (patient exists + blocker matches);
   `addressesGap` stays descriptive.
4. **Record drops on the existing `plan` record** rather than inventing a new record
   type — keeps the audit model stable.
