# Implementation — Ground the agent's plan against the live world

| | |
| --- | --- |
| **Spec** | `spec/agent-grounding/spec.md` |
| **Issue** | [#74](https://github.com/devdaviddr/ai-patient-flow-orchestrator/issues/74) item 1 · P1 |
| **Status** | 📝 SDD step 2 (Design) — no code until the plan PR is approved |
| **Surface** | One new pure module (`src/driver/grounding.ts`) + a few lines in `Driver.applyPlan`; the action→blocker map moves to the new module. No new deps, no schema, no API/UI change. |

> SDD step 2: the design, the exact change, the test plan, the gates, the rejected
> alternatives. Code lands in the **code PR** (`feat/agent-grounding-impl`) after this
> is approved.

## 1. Approach in one paragraph

`Simulator.resolveBlocker(patientId, blocker)` already encodes the precondition for an
action to do anything: the patient must exist and be blocked on exactly that type. We
lift that **same** precondition to the boundary: after parsing the plan, a pure
`groundInterventions(interventions, state)` partitions them into `grounded` (patient
exists + blocker matches the action) and `dropped` (with a reason). `Driver.applyPlan`
surfaces only `grounded` and records the `dropped` count + reasons on the `plan`
decision record. Because grounding reuses the action→blocker map that `approve()` uses,
"surfaced" ⇔ "`resolveBlocker` will apply" — the silent no-op becomes impossible.

## 2. The change

### 2.1 New module — `src/driver/grounding.ts`

Owns the action→blocker map (moved here as the single source) and the pure check.

```ts
import type { BlockerType, WorldState } from "@/sim"
import type { Intervention, InterventionType } from "./types"

// The blocker each action clears — the SAME rule resolveBlocker() enforces, so a
// grounded intervention is exactly one approve() will apply.
export const BLOCKER_FOR: Record<InterventionType, BlockerType> = {
  expedite_script: "pharmacy_script",
  request_transport: "transport",
  page_allied_health: "allied_health",
  request_placement: "placement",
}

export interface DroppedIntervention {
  intervention: Intervention
  reason: string
}
export interface GroundingResult {
  grounded: Intervention[]
  dropped: DroppedIntervention[]
}

// Keep only interventions that can actually act on the live world: the target patient
// exists AND is currently blocked on the type this action clears. Pure — no model, no
// mutation of state.
export function groundInterventions(interventions: Intervention[], state: WorldState): GroundingResult {
  const grounded: Intervention[] = []
  const dropped: DroppedIntervention[] = []
  for (const iv of interventions) {
    const patient = state.patients.find((p) => p.id === iv.targetPatientId)
    if (!patient) {
      dropped.push({ intervention: iv, reason: `no such patient ${iv.targetPatientId}` })
      continue
    }
    const expected = BLOCKER_FOR[iv.type]
    if (patient.blocker !== expected) {
      dropped.push({
        intervention: iv,
        reason: `patient ${iv.targetPatientId} is blocked on ${patient.blocker}, not ${expected}`,
      })
      continue
    }
    grounded.push(iv)
  }
  return { grounded, dropped }
}
```

### 2.2 `Driver.applyPlan` — surface only grounded, record the drops

`driver.ts` currently sets `this.current = plan.interventions...` then logs a `plan`
record. It also defines `BLOCKER_FOR` locally (used by `approve()`); that const **moves
to `grounding.ts`** and `driver.ts` imports it (single source — `approve()` keeps using
it unchanged).

```ts
private applyPlan(plan: ProposedPlan): void {
  const state = this.sim.getState()
  const stateRef = state.at
  const { grounded, dropped } = groundInterventions(plan.interventions, state)
  this.current = grounded.map((iv) => ({ ...iv }))
  this.currentFlags = plan.flags ?? []

  for (const gap of plan.gaps) {
    this.log.add({ at: stateRef, type: "gap", stateRef, rationale: gap.factors.join("; "), payload: gap })
  }
  this.log.add({
    at: stateRef,
    type: "plan",
    stateRef,
    rationale:
      `Proposed ${grounded.length} grounded action(s)` +
      (dropped.length ? `; dropped ${dropped.length} ungrounded` : "") +
      `; flagged ${this.currentFlags.length} blocker(s) for a human to chase`,
    payload: { interventions: grounded, dropped },
  })
}
```

No other driver method changes: `proposals()` returns `this.current` (now grounded
only); `approve()` keeps using the imported `BLOCKER_FOR` and now can't hit the no-op
path for a surfaced item.

### 2.3 Trace

| Plan item | Live world | Outcome |
| --- | --- | --- |
| `expedite_script` for P1, P1 blocked `pharmacy_script` | match | **surfaced** → approve applies |
| `request_transport` for P2, P2 blocked `placement` | mismatch | **dropped** (`blocked on placement, not transport`) |
| `page_allied_health` for "ghost" | no such patient | **dropped** (`no such patient ghost`) |

## 3. Tests

### 3.1 Pure unit — `tests/grounding.test.ts`
Build a fresh `Simulator("normal-weekday")`, pick real patients by blocker, and assert:
- a matching intervention is **grounded**;
- an intervention for a non-existent id is **dropped** with `no such patient`;
- an intervention whose type doesn't match the patient's blocker is **dropped** with the
  mismatch reason;
- ordering/identity of grounded items is preserved.

### 3.2 Driver-level — extend `tests/driver.test.ts`
With an injected planner returning a plan that mixes a grounded item, a hallucinated id,
and a blocker-mismatch item:
- `proposals()` contains **only** the grounded item (G3);
- approving it applies (G3);
- the `plan` decision record's `payload.dropped` has length 2 and its `rationale`
  mentions "dropped 2 ungrounded" (G4);
- gaps and flags are unchanged (G5).

The existing approval-gate / attribution / eval tests stay green (they already use
plans whose interventions target real, correctly-blocked patients → all grounded).

## 4. Verification

- **Unit:** `npm test` — new grounding + driver tests green; full suite stays green.
- **Gates:** `typecheck` · `lint` · `build` clean.
- **Invariants:** S12 (sim only read) and S13 (no clinical content; grounding reasons
  are logistics strings) untouched.
- **Live (Docker):** run an assessment; if the model proposes anything ungrounded the
  timeline shows "dropped N ungrounded" and only grounded cards are approvable.

## 5. Risks & mitigations

- **Risk: a legitimately-proposed action is dropped because the world moved between
  perceive and apply.** The agent perceives and the driver grounds against the *current*
  state in the same tick (no clock advance between), so they match. Mitigated by design;
  the test pins it.
- **Risk: over-dropping hides a real agent capability.** Grounding only drops items that
  `resolveBlocker` would no-op anyway — dropping them changes nothing a coordinator could
  have usefully approved. Net behaviour is strictly more honest.
- **Risk: payload shape change breaks a consumer.** The `plan` record `payload` goes from
  `Intervention[]` to `{ interventions, dropped }`. The UI reads `proposals()` (not the
  record payload) for cards; the timeline renders `rationale`. Checked: no consumer reads
  `plan.payload` as a bare array. (If one is found, it's updated in the code PR.)

## 6. Rejected alternatives

1. **Surface ungrounded items as disabled/flagged cards.** Rejected — they can't act;
   showing an un-approvable card is noise. Recording the drop in the audit is the right
   amount of visibility.
2. **Ground inside `approve()` (reject at approval time).** Rejected — too late; the
   coordinator already chose it and expects an effect. Catch it before surfacing.
3. **Also drop on `addressesGap` not matching a gap.** Rejected for this item —
   `addressesGap` is descriptive free text, not an action precondition; dropping on it
   would discard valid actions. Left to a later #74 item if wanted.
4. **Put grounding in the adapter.** Rejected — grounding needs `WorldState` and is
   model-free; it belongs in the driver, keeping the adapter purely the SDK seam.

## 7. Rollout

- Plan PR (`feat/agent-grounding`): these two docs only. Merge first.
- Code PR (`feat/agent-grounding-impl`): `grounding.ts` + `driver.ts` + tests +
  `releases/0.6.0.md`. Closes #74 item 1 (the issue stays open for items 2–7).
