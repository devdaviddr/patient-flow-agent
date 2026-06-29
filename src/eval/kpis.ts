// The two flow KPIs and the comparison shape. Definitions per spec §3.
// (Relative imports throughout src/eval so `npm run eval` runs under tsx with no
// alias config and pulls in no SDK.)

import type { ScenarioName } from "../sim"
import type { AgreementSummary } from "./agreement"

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

// The model isn't seeded, so the real-agent eval runs N trials and reports the
// spread rather than a single replay (#31).
export interface AggregatedKPIs {
  mean: FlowKPIs
  min: FlowKPIs
  max: FlowKPIs
  trials: FlowKPIs[]
}

export interface AgentEvalResult {
  scenario: ScenarioName
  seed: number
  trials: number
  withAgent: AggregatedKPIs // distribution over N real-agent trials
  withoutAgent: FlowKPIs // deterministic (no agent)
  // Reasoning quality (#74 item 4): agreement between the agent's proposals and the
  // deterministic reference action set, meaned over every tick of every trial.
  agreement: AgreementSummary
}
