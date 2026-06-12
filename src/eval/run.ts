// Headless eval: play a seeded day with and without the agent's interventions,
// computing the two flow KPIs. Deterministic (seeded sim + deterministic policy),
// so the result is reproducible.

import { Simulator, SCENARIOS, type ScenarioName } from "../sim"
import { applyOraclePolicy } from "./policy"
import type { EvalResult, FlowKPIs } from "./kpis"

const TICKS = 48 // a full simulated day, at 30-min ticks
const TICK_HOURS = 0.5

export function runScenario(scenario: ScenarioName, withAgent: boolean): FlowKPIs {
  const sim = new Simulator(scenario)
  let accessBlockHours = 0
  for (let i = 0; i < TICKS; i++) {
    if (withAgent) applyOraclePolicy(sim) // act on stuck discharges before the tick
    sim.step()
    // patients still queued after this tick's admissions are access-blocked
    accessBlockHours += sim.getState().edQueue.length * TICK_HOURS
  }
  const endOfDayHeadroom = sim
    .getState()
    .beds.filter((b) => b.status === "empty_clean").length
  return { accessBlockHours, endOfDayHeadroom }
}

export function evaluate(): EvalResult[] {
  const scenarios: ScenarioName[] = ["normal-weekday", "flu-surge"]
  return scenarios.map((scenario) => ({
    scenario,
    seed: SCENARIOS[scenario].seed,
    withAgent: runScenario(scenario, true),
    withoutAgent: runScenario(scenario, false),
  }))
}
