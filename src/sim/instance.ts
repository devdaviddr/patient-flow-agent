// One simulated hospital per dev server. Cached on globalThis so it survives
// Next.js hot-reloads (otherwise every recompile would reset the world).

import { Simulator } from "./simulator"
import type { ScenarioName } from "./scenarios"

const SCENARIO = (process.env.SCENARIO as ScenarioName) || "normal-weekday"
const SEED = process.env.SEED ? Number(process.env.SEED) : undefined

const globalForSim = globalThis as unknown as { __sim?: Simulator }

export function getSimulator(): Simulator {
  if (!globalForSim.__sim) {
    globalForSim.__sim = new Simulator(SCENARIO, SEED)
  }
  return globalForSim.__sim
}

/** Reset to a fresh world for a named scenario (used by "load scenario"). */
export function resetSimulator(scenario: ScenarioName = SCENARIO, seed?: number): Simulator {
  globalForSim.__sim = new Simulator(scenario, seed)
  return globalForSim.__sim
}
