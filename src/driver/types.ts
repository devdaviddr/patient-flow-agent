// Driver-side contracts: what the orchestrator proposes, and what we record.
// Shapes follow Architecture.md §5 (reasoning outputs + audit).

import type { ISOTime } from "@/sim"

export type InterventionType = "expedite_script" | "request_transport"

export interface CapacityGap {
  wardId: string
  atTime: ISOTime
  projectedDeficit: number
  factors: string[]
}

export interface Intervention {
  id: string
  type: InterventionType
  targetPatientId: string
  addressesGap: string
  impactScore: number
  rationale: string
  status: "proposed" | "approved" | "rejected" | "executed"
}

// A not-ready discharge blocked on a NON-actionable type (no v1 one-click fix).
// Surfaced for visibility so a human can chase it off-system (R6).
export interface Flag {
  patientId: string
  wardId: string
  blocker: "allied_health" | "placement"
  reason: string
}

export interface ProposedPlan {
  gaps: CapacityGap[]
  interventions: Intervention[] // ranked, highest impact first
  flags: Flag[] // non-actionable blockers, read-only
}

export interface DecisionRecord {
  at: ISOTime
  type: "gap" | "plan" | "action"
  stateRef: ISOTime
  rationale: string
  payload: unknown
}
