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
import type { BlockerType, WorldState } from "./state"
import { addMinutes } from "./time"

export interface ActionResult {
  applied: boolean
  patientId: string
  blocker?: BlockerType
  note: string
}

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

  /**
   * Apply an approved action: clear `blocker` for `patientId` by emitting a
   * blocker_resolved event. Only clears the matching blocker type — any other
   * case (no such patient, different blocker) is a safe no-op.
   */
  resolveBlocker(patientId: string, blocker: BlockerType): ActionResult {
    const patient = this.state.patients.find((p) => p.id === patientId)
    if (!patient) {
      return { applied: false, patientId, note: `No such patient ${patientId}.` }
    }
    if (patient.blocker !== blocker) {
      return {
        applied: false,
        patientId,
        blocker: patient.blocker,
        note: `Patient ${patientId} is not blocked on ${blocker} (current: ${patient.blocker}).`,
      }
    }
    this.state = reduce(this.state, {
      kind: "blocker_resolved",
      at: this.state.at,
      patientId,
      blocker,
    })
    return { applied: true, patientId, blocker, note: `Cleared ${blocker} for ${patientId}.` }
  }
}
