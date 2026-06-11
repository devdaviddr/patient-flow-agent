// C1–C6 — forecasts carry rationale & are deterministic; actions clear the matching
// blocker and no-op otherwise.

import { describe, expect, it } from "vitest"
import {
  Simulator,
  forecastDischarges,
  forecastDemand,
  type BlockerType,
} from "@/sim"

describe("discharge forecast (C1, C3)", () => {
  it("returns predictions with a non-empty rationale", () => {
    const state = new Simulator("normal-weekday").getState()
    const f = forecastDischarges(state, "4B", 8)
    expect(f.wardId).toBe("4B")
    expect(f.predicted.length).toBeGreaterThan(0)
    for (const p of f.predicted) {
      expect(p.rationale.length).toBeGreaterThan(0)
      expect(typeof p.ready).toBe("boolean")
    }
  })

  it("is deterministic for the same state", () => {
    const state = new Simulator("normal-weekday").getState()
    expect(forecastDischarges(state, "4A", 8)).toEqual(forecastDischarges(state, "4A", 8))
  })
})

describe("demand forecast (C2)", () => {
  it("returns expected admissions with a rationale", () => {
    const state = new Simulator("flu-surge").getState()
    const f = forecastDemand(state, "4A", 8)
    expect(typeof f.expectedAdmissions).toBe("number")
    expect(f.expectedAdmissions).toBeGreaterThanOrEqual(0)
    expect(f.rationale.length).toBeGreaterThan(0)
  })
})

function findBlocked(sim: Simulator, blocker: BlockerType) {
  return sim.getState().patients.find((p) => p.blocker === blocker)
}

describe("actions (C4–C6)", () => {
  it("expedite (pharmacy_script) clears the blocker and marks ready", () => {
    const sim = new Simulator("normal-weekday")
    const patient = findBlocked(sim, "pharmacy_script")
    expect(patient).toBeDefined()
    const res = sim.resolveBlocker(patient!.id, "pharmacy_script")
    expect(res.applied).toBe(true)
    const after = sim.getState().patients.find((p) => p.id === patient!.id)!
    expect(after.blocker).toBe("none")
    expect(after.predictedDischarge?.ready).toBe(true)
  })

  it("transport action clears a transport blocker", () => {
    const sim = new Simulator("normal-weekday")
    const patient = findBlocked(sim, "transport")
    expect(patient).toBeDefined()
    expect(sim.resolveBlocker(patient!.id, "transport").applied).toBe(true)
    expect(sim.getState().patients.find((p) => p.id === patient!.id)!.blocker).toBe("none")
  })

  it("is a safe no-op on a non-matching blocker (state unchanged)", () => {
    const sim = new Simulator("normal-weekday")
    const ready = sim.getState().patients.find((p) => p.blocker === "none")!
    const before = JSON.stringify(sim.getState())
    const res = sim.resolveBlocker(ready.id, "pharmacy_script")
    expect(res.applied).toBe(false)
    expect(JSON.stringify(sim.getState())).toBe(before)
  })

  it("is a safe no-op for an unknown patient", () => {
    const sim = new Simulator("normal-weekday")
    expect(sim.resolveBlocker("nobody", "transport").applied).toBe(false)
  })
})
