// Seeded event generation. Given the current state, scenario params, the PRNG, and
// the new tick time, decide which SimEvents happen this tick. Pure w.r.t. state —
// it reads state and the rng, and returns events; the simulator folds them in.
//
// rng is consumed in a fixed order (arrivals → unblocks → cleans) so the stream is
// reproducible. Admissions and discharges use no randomness.

import type { SimEvent } from "./events"
import type { Rng } from "./rng"
import type { ScenarioParams } from "./scenarios"
import type { ISOTime, WorldState } from "./state"
import { atOrBefore } from "./time"

export function generate(
  state: WorldState,
  params: ScenarioParams,
  // Two independent streams: arrivals are EXOGENOUS demand and must be identical
  // whether or not the agent acts (so with/without runs see the same day); events
  // (unblock/clean outcomes) are endogenous and may diverge with agent actions.
  rngArrivals: Rng,
  rngEvents: Rng,
  now: ISOTime,
  nextPatientNum: number,
): { events: SimEvent[]; nextPatientNum: number } {
  const events: SimEvent[] = []
  let num = nextPatientNum

  // 1 · ED arrivals (queue up; they become admissible next tick)
  const arrivals = rngArrivals.poisson(params.edArrivalsPerTick)
  for (let i = 0; i < arrivals; i++) {
    events.push({ kind: "ed_arrival", at: now, patientId: `p-${num++}` })
  }

  // 2 · Admissions: drain the existing ED queue into clean beds (ward-by-ward)
  const cleanByWard = new Map<string, number>()
  for (const b of state.beds) {
    if (b.status === "empty_clean") {
      cleanByWard.set(b.wardId, (cleanByWard.get(b.wardId) ?? 0) + 1)
    }
  }
  for (const patientId of state.edQueue) {
    const ward = [...cleanByWard.entries()].find(([, n]) => n > 0)?.[0]
    if (!ward) break // access block: no clean bed for this waiting patient
    cleanByWard.set(ward, (cleanByWard.get(ward) ?? 0) - 1)
    events.push({ kind: "admission", at: now, wardId: ward, patientId })
  }

  // 3 · Discharges: ready (unblocked) and due
  for (const p of state.patients) {
    if (
      p.predictedDischarge?.ready &&
      atOrBefore(p.predictedDischarge.at, now)
    ) {
      events.push({ kind: "discharge", at: now, patientId: p.id })
    }
  }

  // 4 · Blocker resolution: overdue, still blocked → may clear this tick
  for (const p of state.patients) {
    if (
      p.blocker !== "none" &&
      p.predictedDischarge &&
      atOrBefore(p.predictedDischarge.at, now) &&
      rngEvents.next() < params.unblockChancePerTick
    ) {
      events.push({
        kind: "blocker_resolved",
        at: now,
        patientId: p.id,
        blocker: p.blocker,
      })
    }
  }

  // 5 · Bed cleaning: dirty beds may turn over
  for (const b of state.beds) {
    if (b.status === "empty_dirty" && rngEvents.next() < params.cleanChancePerTick) {
      events.push({ kind: "bed_cleaned", at: now, bedId: b.id })
    }
  }

  return { events, nextPatientNum: num }
}
