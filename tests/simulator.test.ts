// S1 — a seeded day produces events in order, and the live picture matches them.
// Also covers the world shape (B1–B3) and that flu-surge brings more demand (B5).

import { describe, expect, it } from "vitest"
import { Simulator, type SimEvent } from "@/sim"

describe("world shape (B1–B2)", () => {
  it("starts with 1 ED queue + two 10-bed wards", () => {
    const s = new Simulator("normal-weekday").getState()
    expect(s.wards.map((w) => w.id).sort()).toEqual(["4A", "4B"])
    expect(s.wards.every((w) => w.bedCount === 10)).toBe(true)
    expect(s.beds).toHaveLength(20)
    expect(Array.isArray(s.edQueue)).toBe(true)
  })

  it("every bed has a valid status and belongs to a ward", () => {
    const s = new Simulator("normal-weekday").getState()
    const wardIds = new Set(s.wards.map((w) => w.id))
    for (const b of s.beds) {
      expect(wardIds.has(b.wardId)).toBe(true)
      expect(["occupied", "empty_clean", "empty_dirty", "blocked"]).toContain(b.status)
    }
  })
})

describe("event ordering & live picture (S1)", () => {
  it("emits events in non-decreasing time order across a day", () => {
    const sim = new Simulator("normal-weekday")
    const all: SimEvent[] = []
    let prev = sim.getState().at
    for (let i = 0; i < 48; i++) {
      const events = sim.step()
      const now = sim.getState().at
      // clock advances
      expect(new Date(now).getTime()).toBeGreaterThan(new Date(prev).getTime())
      // every event carries the tick's time
      for (const e of events) expect(e.at).toBe(now)
      prev = now
      all.push(...events)
    }
    expect(all.length).toBeGreaterThan(0)
    // times are non-decreasing
    const times = all.map((e) => new Date(e.at).getTime())
    expect(times).toEqual([...times].sort((x, y) => x - y))
  })

  it("an admission shows up as an occupied bed with that patient", () => {
    const sim = new Simulator("normal-weekday")
    for (let i = 0; i < 48; i++) {
      const events = sim.step()
      const admission = events.find((e) => e.kind === "admission")
      if (!admission) continue
      const state = sim.getState()
      const patient = state.patients.find((p) => p.id === admission.patientId)
      expect(patient).toBeDefined()
      const bed = state.beds.find((b) => b.id === patient!.bedId)
      expect(bed?.status).toBe("occupied")
      expect(bed?.patientId).toBe(admission.patientId)
      expect(state.edQueue).not.toContain(admission.patientId)
      return
    }
  })
})

describe("scenarios differ (B5)", () => {
  it("flu-surge generates more ED arrivals than a normal weekday", () => {
    const count = (scenario: "normal-weekday" | "flu-surge") => {
      const sim = new Simulator(scenario)
      let arrivals = 0
      for (let i = 0; i < 48; i++) {
        arrivals += sim.step().filter((e) => e.kind === "ed_arrival").length
      }
      return arrivals
    }
    expect(count("flu-surge")).toBeGreaterThan(count("normal-weekday"))
  })
})
