// Forecast STUBS. The real transparent heuristics (with rationale) land in Phase 2;
// these exist only so the harness tools' endpoints resolve in Phase 1. The shapes
// match Architecture.md §5.

import type { BlockerType, ISOTime } from "./state"

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

const STUB_NOTE = "stub — real heuristic lands in Phase 2"

export function stubDischargeForecast(
  wardId: string,
  horizonHrs: number,
): DischargeForecast {
  return { wardId, horizonHrs, predicted: [], _stub: STUB_NOTE } as DischargeForecast & {
    _stub: string
  }
}

export function stubDemandForecast(
  wardId: string,
  horizonHrs: number,
): DemandForecast {
  return {
    wardId,
    horizonHrs,
    expectedAdmissions: 0,
    rationale: STUB_NOTE,
  }
}
