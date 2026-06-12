// The two flow KPIs and the comparison shape. Definitions per spec §3.
// (Relative imports throughout src/eval so `npm run eval` runs under tsx with no
// alias config and pulls in no SDK.)

import type { ScenarioName } from "../sim"

export interface FlowKPIs {
  /** total patient-time waiting for an unavailable bed (lower is better) */
  accessBlockHours: number
  /** clean, empty beds at end of day (higher is better) */
  endOfDayHeadroom: number
}

export interface EvalResult {
  scenario: ScenarioName
  seed: number
  withAgent: FlowKPIs
  withoutAgent: FlowKPIs
}
