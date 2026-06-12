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
  type ScenarioParams,
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
  // Separate streams so agent actions (which change endogenous event draws) never
  // perturb the exogenous arrival schedule — see generate.ts.
  private rngArrivals: Rng
  private rngEvents: Rng
  private num: number
  private readonly params: ScenarioParams
  readonly scenario: ScenarioName
  readonly seed: number

  constructor(
    scenario: ScenarioName = "normal-weekday",
    seed?: number,
    overrides?: Partial<ScenarioParams>,
  ) {
    this.scenario = scenario
    this.seed = seed ?? SCENARIOS[scenario].seed
    this.params = { ...SCENARIOS[scenario], ...overrides, seed: this.seed }
    this.rngArrivals = makeRng(this.seed)
    this.rngEvents = makeRng((this.seed ^ 0x9e3779b9) >>> 0)
    const { world, nextPatientNum } = buildInitialWorld(this.params, this.rngEvents)
    this.state = world
    this.num = nextPatientNum
  }

  getState(): WorldState {
    return this.state
  }

  /** Advance one tick. Returns the events emitted this tick (in order). */
  step(): SimEvent[] {
    const now = addMinutes(this.state.at, TICK_MINUTES)
    const { events, nextPatientNum } = generate(
      this.state,
      this.params,
      this.rngArrivals,
      this.rngEvents,
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
