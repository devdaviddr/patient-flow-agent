// The five SimEvent kinds and the reducer — the ONLY thing that mutates WorldState.
// `reduce` is pure: it returns a new state and never mutates its input, so replay
// and the audit trail are trustworthy.

import { admitPatient } from "./patient"
import type { BlockerType, ISOTime, WorldState } from "./state"

export type SimEvent =
  | { kind: "ed_arrival"; at: ISOTime; patientId: string }
  | { kind: "admission"; at: ISOTime; wardId: string; patientId: string }
  | { kind: "discharge"; at: ISOTime; patientId: string }
  | { kind: "blocker_resolved"; at: ISOTime; patientId: string; blocker: BlockerType }
  | { kind: "bed_cleaned"; at: ISOTime; bedId: string }

export function reduce(state: WorldState, event: SimEvent): WorldState {
  switch (event.kind) {
    case "ed_arrival":
      return { ...state, edQueue: [...state.edQueue, event.patientId] }

    case "admission": {
      // Place the patient in the first clean, empty bed of the named ward.
      const bed = state.beds.find(
        (b) => b.wardId === event.wardId && b.status === "empty_clean",
      )
      if (!bed) return state // generator should not emit this; ignore defensively
      const patient = admitPatient(event.patientId, event.wardId, bed.id, event.at)
      return {
        ...state,
        edQueue: state.edQueue.filter((id) => id !== event.patientId),
        beds: state.beds.map((b) =>
          b.id === bed.id
            ? { ...b, status: "occupied", patientId: event.patientId }
            : b,
        ),
        patients: [...state.patients, patient],
      }
    }

    case "discharge": {
      const patient = state.patients.find((p) => p.id === event.patientId)
      if (!patient) return state
      return {
        ...state,
        patients: state.patients.filter((p) => p.id !== event.patientId),
        beds: state.beds.map((b) =>
          b.id === patient.bedId
            ? { id: b.id, wardId: b.wardId, status: "empty_dirty" }
            : b,
        ),
      }
    }

    case "blocker_resolved":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === event.patientId
            ? {
                ...p,
                blocker: "none",
                predictedDischarge: p.predictedDischarge
                  ? { ...p.predictedDischarge, ready: true }
                  : undefined,
              }
            : p,
        ),
      }

    case "bed_cleaned":
      return {
        ...state,
        beds: state.beds.map((b) =>
          b.id === event.bedId && b.status === "empty_dirty"
            ? { ...b, status: "empty_clean" }
            : b,
        ),
      }
  }
}
