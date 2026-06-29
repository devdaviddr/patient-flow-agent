// Transparent, deterministic forecast heuristics — NOT a model. Each prediction
// carries a plain-English rationale built from logistics facts only (no clinical
// content). Same WorldState + args -> same forecast. Shapes match Architecture §5.

import type { BlockerType, ISOTime, WorldState } from "./state"
import { addMinutes, atOrBefore } from "./time"

export interface DischargeForecast {
  wardId: string
  horizonHrs: number
  predicted: {
    patientId: string
    at: ISOTime
    ready: boolean
    blocker: BlockerType
    rationale: string
  }[]
}

export interface DemandForecast {
  wardId: string
  horizonHrs: number
  expectedAdmissions: number
  rationale: string
}

// A flat assumed inflow rate keeps the demand forecast a transparent rule that
// reads only WorldState (the agent can't see scenario internals anyway).
const ASSUMED_ARRIVALS_PER_HOUR = 1.5

const BLOCKER_PHRASE: Record<Exclude<BlockerType, "none">, string> = {
  pharmacy_script: "a pharmacy script",
  transport: "transport",
  allied_health: "allied-health sign-off",
  placement: "a placement destination",
}

function hhmm(at: ISOTime): string {
  const d = new Date(at)
  return `${`${d.getUTCHours()}`.padStart(2, "0")}:${`${d.getUTCMinutes()}`.padStart(2, "0")}`
}

export function forecastDischarges(
  state: WorldState,
  wardId: string,
  horizonHrs: number,
): DischargeForecast {
  const horizonEnd = addMinutes(state.at, horizonHrs * 60)
  const predicted = state.patients
    .filter(
      (p) =>
        p.wardId === wardId &&
        p.predictedDischarge != null &&
        atOrBefore(p.predictedDischarge.at, horizonEnd),
    )
    .map((p) => {
      const pd = p.predictedDischarge!
      const rationale = pd.ready
        ? `Predicted discharge ${hhmm(pd.at)}; ready — no blocker.`
        : `Predicted discharge ${hhmm(pd.at)} but not ready — waiting on ${
            BLOCKER_PHRASE[p.blocker as Exclude<BlockerType, "none">] ??
            "an open blocker"
          }.`
      return {
        patientId: p.id,
        at: pd.at,
        ready: pd.ready,
        blocker: p.blocker,
        rationale,
      }
    })
  return { wardId, horizonHrs, predicted }
}

export function forecastDemand(
  state: WorldState,
  wardId: string,
  horizonHrs: number,
): DemandForecast {
  const waiting = state.edQueue.length
  const projected = Math.round(ASSUMED_ARRIVALS_PER_HOUR * horizonHrs)
  const hospitalInflow = waiting + projected

  // Apportion the hospital-wide inflow across wards by bed share, so the per-ward
  // contract is genuinely per-ward (and the parts sum to the hospital total) rather
  // than every ward reporting the same hospital-wide figure. Bed share is stable —
  // it doesn't depend on the current clean count — so a momentarily full ward still
  // shows its expected load.
  const totalBeds = state.wards.reduce((n, w) => n + w.bedCount, 0)
  const ward = state.wards.find((w) => w.id === wardId)
  const share = ward && totalBeds > 0 ? ward.bedCount / totalBeds : 0
  const expectedAdmissions = Math.round(hospitalInflow * share)
  const shareNote = ward ? `this ward's ${ward.bedCount} of ${totalBeds} beds` : "unknown ward"

  return {
    wardId,
    horizonHrs,
    expectedAdmissions,
    rationale: `~${expectedAdmissions} expected in this ward over ${horizonHrs}h — ${shareNote} share of ${hospitalInflow} hospital-wide arrivals (${waiting} waiting in ED + ~${projected} projected).`,
  }
}
