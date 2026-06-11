// The Simulator: holds the evolving world for one scenario + seed, and advances it
// one fixed tick at a time. step() is the only way the world moves forward.

import { reduce, type SimEvent } from "./events"
import { generate } from "./generate"
import { makeRng, type Rng } from "./rng"
import {
  buildInitialWorld,
  SCENARIOS,
  TICK_MINUTES,
  type ScenarioName,
} from "./scenarios"
import type { WorldState } from "./state"
import { addMinutes } from "./time"

export class Simulator {
  private state: WorldState
  private rng: Rng
  private num: number
  readonly scenario: ScenarioName
  readonly seed: number

  constructor(scenario: ScenarioName = "normal-weekday", seed?: number) {
    this.scenario = scenario
    const params = SCENARIOS[scenario]
    this.seed = seed ?? params.seed
    this.rng = makeRng(this.seed)
    const { world, nextPatientNum } = buildInitialWorld(
      { ...params, seed: this.seed },
      this.rng,
    )
    this.state = world
    this.num = nextPatientNum
  }

  getState(): WorldState {
    return this.state
  }

  /** Advance one tick. Returns the events emitted this tick (in order). */
  step(): SimEvent[] {
    const params = SCENARIOS[this.scenario]
    const now = addMinutes(this.state.at, TICK_MINUTES)
    const { events, nextPatientNum } = generate(
      this.state,
      params,
      this.rng,
      now,
      this.num,
    )
    this.num = nextPatientNum
    let s = this.state
    for (const e of events) s = reduce(s, e)
    this.state = { ...s, at: now }
    return events
  }
}
