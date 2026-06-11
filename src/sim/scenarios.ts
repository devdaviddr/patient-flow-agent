// Named scenarios as parameter sets (not hand-scripted event lists). flu-surge
// differs from normal-weekday by a higher ED arrival rate. Each has a fixed seed,
// so a scenario name alone reproduces an identical day.

import { admitPatient } from "./patient"
import type { Rng } from "./rng"
import type { Bed, Ward, WorldState } from "./state"
import { addMinutes } from "./time"

export const TICK_MINUTES = 30

export type ScenarioName = "normal-weekday" | "flu-surge"

export interface ScenarioParams {
  name: ScenarioName
  seed: number
  startAt: string
  /** mean ED arrivals per 30-min tick */
  edArrivalsPerTick: number
  /** beds occupied per ward at the start (of 10) */
  initialOccupancyPerWard: number
  /** per-tick chance an overdue blocked discharge clears */
  unblockChancePerTick: number
  /** per-tick chance a dirty bed gets cleaned */
  cleanChancePerTick: number
}

export const SCENARIOS: Record<ScenarioName, ScenarioParams> = {
  "normal-weekday": {
    name: "normal-weekday",
    seed: 42,
    startAt: "2026-06-11T08:00:00.000Z",
    edArrivalsPerTick: 1.2,
    initialOccupancyPerWard: 6,
    unblockChancePerTick: 0.25,
    cleanChancePerTick: 0.5,
  },
  "flu-surge": {
    name: "flu-surge",
    seed: 7,
    startAt: "2026-06-11T08:00:00.000Z",
    edArrivalsPerTick: 2.6,
    initialOccupancyPerWard: 8,
    unblockChancePerTick: 0.2,
    cleanChancePerTick: 0.5,
  },
}

const WARDS: Ward[] = [
  { id: "4A", name: "Ward 4A", bedCount: 10 },
  { id: "4B", name: "Ward 4B", bedCount: 10 },
]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Build the starting world: 1 ED (the queue) + two 10-bed wards, partly occupied. */
export function buildInitialWorld(
  params: ScenarioParams,
  rng: Rng,
): { world: WorldState; nextPatientNum: number } {
  const beds: Bed[] = WARDS.flatMap((w) =>
    Array.from({ length: w.bedCount }, (_, i) => ({
      id: `${w.id}-${pad2(i + 1)}`,
      wardId: w.id,
      status: "empty_clean" as const,
    })),
  )

  const patients = []
  let num = 0
  for (const ward of WARDS) {
    const wardBeds = beds.filter((b) => b.wardId === ward.id)
    for (let k = 0; k < params.initialOccupancyPerWard; k++) {
      const bed = wardBeds[k]
      const id = `p-${num++}`
      // admitted 0–72h before the start, so some discharges are already due
      const admittedAt = addMinutes(params.startAt, -rng.int(72) * 60)
      patients.push(admitPatient(id, ward.id, bed.id, admittedAt))
      bed.status = "occupied"
      bed.patientId = id
    }
  }

  return {
    world: { at: params.startAt, wards: WARDS, beds, patients, edQueue: [] },
    nextPatientNum: num,
  }
}
