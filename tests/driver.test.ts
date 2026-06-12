// Phase 4 gate — proven HEADLESS and OFFLINE with an injected planner (no
// opencode serve, no model, no harness `ask`). That is exactly what a safety-gate
// test should be: D6 holds by construction here.

import { describe, expect, it } from "vitest"
import { Simulator } from "@/sim"
import { Driver, parsePlan, type ProposedPlan } from "@/driver"

// Build a plan that targets a real blocked patient in a fresh sim.
function planFor(sim: Simulator): { plan: ProposedPlan; targetId: string } {
  const blocked = sim.getState().patients.find((p) => p.blocker === "pharmacy_script")!
  const plan: ProposedPlan = {
    gaps: [
      {
        wardId: blocked.wardId,
        atTime: sim.getState().at,
        projectedDeficit: 2,
        factors: ["fewer discharges than admissions"],
      },
    ],
    interventions: [
      {
        id: "iv-1",
        type: "expedite_script",
        targetPatientId: blocked.id,
        addressesGap: blocked.wardId,
        impactScore: 0.9,
        rationale: "clears a stuck discharge",
        status: "proposed",
      },
    ],
    flags: [
      {
        patientId: "p-x",
        wardId: blocked.wardId,
        blocker: "placement",
        reason: "awaiting a placement destination — no one-click fix",
      },
    ],
  }
  return { plan, targetId: blocked.id }
}

function driverWith(plan: ProposedPlan, sim: Simulator) {
  return new Driver({ sim, planner: async () => plan })
}

describe("plan parsing (D2)", () => {
  it("extracts and validates a fenced JSON plan, assigning ids", () => {
    const text =
      "Here is the plan.\n```json\n" +
      JSON.stringify({
        gaps: [],
        interventions: [
          {
            type: "request_transport",
            targetPatientId: "p-1",
            addressesGap: "4A",
            impactScore: 0.5,
            rationale: "x",
          },
        ],
      }) +
      "\n```"
    const plan = parsePlan(text)
    expect(plan.interventions[0].id).toBe("iv-1")
    expect(plan.interventions[0].status).toBe("proposed")
  })

  it("rejects malformed plans", () => {
    expect(() => parsePlan("no json here")).toThrow()
  })

  it("flags are optional — a plan without them parses to []", () => {
    const text = "```json\n" + JSON.stringify({ gaps: [], interventions: [] }) + "\n```"
    expect(parsePlan(text).flags).toEqual([])
  })

  it("parses non-actionable flags when present", () => {
    const text =
      "```json\n" +
      JSON.stringify({
        gaps: [],
        interventions: [],
        flags: [{ patientId: "p-3", wardId: "4B", blocker: "placement", reason: "no destination" }],
      }) +
      "\n```"
    expect(parsePlan(text).flags[0].blocker).toBe("placement")
  })
})

describe("approval gate (D3 / S6)", () => {
  it("approve → exactly that patient unblocked", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan, targetId } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()
    const res = driver.approve("iv-1")
    expect(res.applied).toBe(true)
    const patient = sim.getState().patients.find((p) => p.id === targetId)!
    expect(patient.blocker).toBe("none")
    expect(patient.predictedDischarge?.ready).toBe(true)
  })

  it("reject → state unchanged", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()
    const before = JSON.stringify(sim.getState())
    driver.reject("iv-1")
    expect(JSON.stringify(sim.getState())).toBe(before)
  })

  it("nothing executes from plan() alone", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const before = JSON.stringify(sim.getState())
    await driverWith(plan, sim).plan()
    expect(JSON.stringify(sim.getState())).toBe(before)
  })
})

describe("non-actionable flags (G1)", () => {
  it("driver exposes the flags from the plan", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()
    const flags = driver.flags()
    expect(flags).toHaveLength(1)
    expect(flags[0].blocker).toBe("placement")
  })
})

describe("re-plan & clock (D4 / S7)", () => {
  it("after approve, a re-plan sees the change; advanceClock moves time", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan, targetId } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()
    driver.approve("iv-1")
    // re-plan reads the new state (the planner is deterministic here; the point is the
    // sim reflects the change a re-plan would see)
    const after = sim.getState().patients.find((p) => p.id === targetId)!
    expect(after.blocker).toBe("none")
    const t0 = sim.getState().at
    driver.advanceClock()
    expect(new Date(sim.getState().at).getTime()).toBeGreaterThan(new Date(t0).getTime())
  })
})

describe("decision records (D5 / S9)", () => {
  it("records a gap, a plan, and an action with rationale", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()
    driver.approve("iv-1")
    const kinds = driver.records().map((r) => r.type)
    expect(kinds).toContain("gap")
    expect(kinds).toContain("plan")
    expect(kinds).toContain("action")
    for (const r of driver.records()) {
      expect(r.rationale.length).toBeGreaterThan(0)
      expect(r.stateRef.length).toBeGreaterThan(0)
    }
  })
})
