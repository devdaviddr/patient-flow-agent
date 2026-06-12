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
