// A patient's fixed attributes, derived deterministically from its id so the
// reducer can stay pure (depends only on event + state) yet reproducible.
// This is logistics, not clinical judgement: an expected length-of-stay and which
// discharge blocker (if any) is in the way.

import { hashString } from "./rng"
import type { BlockerType, ISOTime, Patient } from "./state"
import { addMinutes } from "./time"

export interface PatientProfile {
  lengthOfStayHours: number
  blocker: BlockerType
}

// Fixed pools of plain, common names. None contain a denylisted whole word.
const FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael",
  "Linda", "David", "Elizabeth", "William", "Barbara", "Daniel", "Susan",
  "Joseph", "Karen", "Thomas", "Sarah", "Charles", "Lisa", "Anthony",
  "Nancy", "Mark", "Margaret", "Paul", "Emily", "Steven", "Olivia",
  "Andrew", "Grace",
]

const SURNAMES = [
  "Smith", "Patel", "Nguyen", "Brown", "O'Connor", "Khan", "Garcia",
  "Williams", "Jones", "Walker", "Reid", "Murphy", "Singh", "Lee",
  "Taylor", "Wilson", "Chen", "Martin", "Anderson", "Thompson", "White",
  "Harris", "Clark", "Lewis", "Young", "King", "Wright", "Scott",
  "Green", "Baker",
]

/** Deterministic "Firstname Lastname" derived from the patient id. */
export function patientName(id: string): string {
  const h = hashString(id)
  const first = FIRST_NAMES[h % FIRST_NAMES.length]
  const last = SURNAMES[(h >>> 8) % SURNAMES.length]
  return `${first} ${last}`
}

/** Deterministic 6-digit UR (Unit Record) number derived from the patient id. */
export function patientUr(id: string): string {
  const h = hashString(id)
  return `UR-${100000 + (h % 900000)}`
}

export function patientProfile(patientId: string): PatientProfile {
  const h = hashString(patientId)
  // typical short-stay ward: ~8–32h
  const lengthOfStayHours = 8 + (h % 24)
  // ~45% discharge cleanly; the rest carry one of the four blockers
  const roll = (h >>> 8) % 100
  const blocker: BlockerType =
    roll < 45
      ? "none"
      : roll < 65
        ? "pharmacy_script"
        : roll < 80
          ? "transport"
          : roll < 92
            ? "allied_health"
            : "placement"
  return { lengthOfStayHours, blocker }
}

/** Build the Patient record created when an admission lands at `at`. */
export function admitPatient(
  patientId: string,
  wardId: string,
  bedId: string,
  at: ISOTime,
): Patient {
  const { lengthOfStayHours, blocker } = patientProfile(patientId)
  const h = hashString(patientId)
  return {
    id: patientId,
    name: patientName(patientId),
    ur: patientUr(patientId),
    wardId,
    bedId,
    admittedAt: at,
    blocker,
    predictedDischarge: {
      at: addMinutes(at, lengthOfStayHours * 60),
      confidence: 0.5 + ((h >>> 16) % 50) / 100,
      ready: blocker === "none",
    },
  }
}
