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

export interface ProposedPlan {
  gaps: CapacityGap[]
  interventions: Intervention[] // ranked, highest impact first
}

export interface DecisionRecord {
  at: ISOTime
  type: "gap" | "plan" | "action"
  stateRef: ISOTime
  rationale: string
  payload: unknown
}
