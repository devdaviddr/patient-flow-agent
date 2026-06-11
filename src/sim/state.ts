// The simulator's data model — a verbatim transcription of Architecture.md §5.
// These are the only domain types; nothing here is clinical (beds & logistics only).

export type ISOTime = string

export type BedStatus = "occupied" | "empty_clean" | "empty_dirty" | "blocked"

export type BlockerType =
  | "pharmacy_script"
  | "transport"
  | "allied_health"
  | "placement"
  | "none"

export interface Ward {
  id: string
  name: string
  bedCount: number
}

export interface Bed {
  id: string
  wardId: string
  status: BedStatus
  patientId?: string
}

export interface Patient {
  id: string
  wardId: string
  bedId: string
  admittedAt: ISOTime
  predictedDischarge?: { at: ISOTime; confidence: number; ready: boolean }
  blocker: BlockerType
}

export interface WorldState {
  at: ISOTime
  wards: Ward[]
  beds: Bed[]
  patients: Patient[]
  edQueue: string[]
}
