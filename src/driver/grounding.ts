// Ground the agent's plan against the live world before it's surfaced as approvable
// (#74 item 1). resolveBlocker() already requires the target patient to exist and be
// blocked on exactly the type an action clears; we lift that SAME precondition to the
// boundary, so a hallucinated id or a wrong action-for-blocker is dropped (and
// recorded) instead of silently no-opping on approval. Pure — no model, no mutation.

import type { BlockerType, WorldState } from "@/sim"
import type { Intervention, InterventionType } from "./types"

// The blocker each action clears — the single source, shared with Driver.approve(), so
// a grounded intervention is exactly one resolveBlocker() will apply.
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
// exists AND is currently blocked on the type this action clears. Order of the grounded
// items (and thus the agent's ranking) is preserved.
export function groundInterventions(
  interventions: Intervention[],
  state: WorldState,
): GroundingResult {
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
