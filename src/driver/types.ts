// Driver-side contracts: what the orchestrator proposes, and what we record.
// Shapes follow Architecture.md §5 (reasoning outputs + audit).

import type { ISOTime } from "@/sim"
import type { Role } from "@/auth/schema"

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

// Who approved/rejected an action, snapshotted onto the record (not an FK) so the
// audit trail survives account deletion (Architecture.md §5, A8). The role mirrors
// the auth hierarchy (Role, type-only import at the top — no runtime coupling) so a
// superadmin actor is representable without re-listing the roles here.
export interface DecisionActor {
  id: string
  name: string
  role: Role
}

export interface DecisionRecord {
  at: ISOTime
  type: "gap" | "plan" | "action"
  stateRef: ISOTime
  rationale: string
  payload: unknown
  // Present on human-driven records (approve/reject); absent on agent-emitted
  // gap/plan records and on pre-auth records.
  actor?: DecisionActor
}

export interface AssessmentLogLine {
  at: string // real wall-clock ISO
  text: string
}

export interface Assessment {
  startedAt: string
  finishedAt?: string
  status: "running" | "done" | "error"
  log: AssessmentLogLine[]
  error?: string
  interventions?: number
  flags?: number
}
