// Defensible impact ranking (#74 item 2). The model emits an impactScore hint, but
// the ranking shouldn't rest on a bare model number. We compute a deterministic
// estimate — the bed-hours of availability an action adds within the planning horizon
// — and rank by it. Clearing a blocker on an imminent (or overdue) discharge frees a
// bed sooner, so it scores higher. Model-free, so the order is explainable.

import type { WorldState } from "@/sim"
import type { Intervention } from "./types"

export const IMPACT_HORIZON_HRS = 8
const MS_PER_HOUR = 3_600_000

// Bed-hours freed within the horizon: horizon minus the hours until the patient's
// predicted discharge (overdue → the full horizon, frees-outside-horizon → 0). No
// predicted discharge → 0 (clearing the blocker frees nothing measurable here).
export function estimateImpact(iv: Intervention, state: WorldState): number {
  const patient = state.patients.find((p) => p.id === iv.targetPatientId)
  if (!patient?.predictedDischarge) return 0
  const hoursUntil = Math.max(
    0,
    (new Date(patient.predictedDischarge.at).getTime() - new Date(state.at).getTime()) / MS_PER_HOUR,
  )
  return Math.max(0, IMPACT_HORIZON_HRS - hoursUntil)
}

// Attach the deterministic estimate to each intervention and rank by it (descending).
// V8's sort is stable, so ties keep the agent's original order.
export function rankByImpact(interventions: Intervention[], state: WorldState): Intervention[] {
  return interventions
    .map((iv) => ({ ...iv, estimatedImpact: estimateImpact(iv, state) }))
    .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
}
