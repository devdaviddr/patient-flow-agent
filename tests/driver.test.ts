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

  it("clamps a stray impactScore to [0,1] (#74 item 2)", () => {
    const text =
      "```json\n" +
      JSON.stringify({
        gaps: [],
        interventions: [
          { type: "expedite_script", targetPatientId: "p-1", addressesGap: "4A", impactScore: 99, rationale: "x" },
        ],
      }) +
      "\n```"
    expect(parsePlan(text).interventions[0].impactScore).toBe(1)
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

describe("all four blockers are actionable (#35)", () => {
  it.each([
    ["page_allied_health", "allied_health"],
    ["request_placement", "placement"],
  ] as const)("approve %s clears the %s blocker", async (type, blocker) => {
    const sim = new Simulator("normal-weekday")
    const target = sim.getState().patients.find((p) => p.blocker === blocker)!
    const plan: ProposedPlan = {
      gaps: [],
      interventions: [
        {
          id: "iv-1",
          type,
          targetPatientId: target.id,
          addressesGap: target.wardId,
          impactScore: 0.8,
          rationale: "clears a stuck discharge",
          status: "proposed",
        },
      ],
      flags: [],
    }
    const driver = driverWith(plan, sim)
    await driver.plan()
    expect(driver.approve("iv-1").applied).toBe(true)
    expect(sim.getState().patients.find((p) => p.id === target.id)!.blocker).toBe("none")
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

describe("plan grounding (#74 item 1)", () => {
  it("surfaces only grounded interventions and records the drops", async () => {
    const sim = new Simulator("normal-weekday")
    const ph = sim.getState().patients.find((p) => p.blocker === "pharmacy_script")!
    const pl = sim.getState().patients.find((p) => p.blocker === "placement")!
    const plan: ProposedPlan = {
      gaps: [],
      interventions: [
        { id: "iv-1", type: "expedite_script", targetPatientId: ph.id, addressesGap: ph.wardId, impactScore: 0.9, rationale: "ok", status: "proposed" },
        { id: "iv-2", type: "page_allied_health", targetPatientId: "ghost", addressesGap: "4A", impactScore: 0.5, rationale: "hallucinated", status: "proposed" },
        { id: "iv-3", type: "request_transport", targetPatientId: pl.id, addressesGap: pl.wardId, impactScore: 0.4, rationale: "mismatch", status: "proposed" },
      ],
      flags: [],
    }
    const driver = driverWith(plan, sim)
    await driver.plan()

    // Only the grounded one is approvable, and approving it actually applies (no no-op).
    expect(driver.proposals().map((p) => p.id)).toEqual(["iv-1"])
    expect(driver.approve("iv-1").applied).toBe(true)

    // The drops are recorded on the plan record (R10).
    const planRec = driver.records().find((r) => r.type === "plan")!
    expect(planRec.rationale).toContain("dropped 2 ungrounded")
    expect((planRec.payload as { dropped: unknown[] }).dropped).toHaveLength(2)
  })

  it("surfaces grounded proposals ranked by the deterministic estimate (#74 item 2)", async () => {
    const sim = new Simulator("normal-weekday")
    // Two grounded pharmacy_script patients; the driver should order them by estimate.
    const ph = sim.getState().patients.filter((p) => p.blocker === "pharmacy_script")
    expect(ph.length).toBeGreaterThanOrEqual(2)
    const plan: ProposedPlan = {
      gaps: [],
      interventions: ph.slice(0, 2).map((p, i) => ({
        id: `iv-${i + 1}`,
        type: "expedite_script" as const,
        targetPatientId: p.id,
        addressesGap: p.wardId,
        impactScore: 0.5,
        rationale: "ok",
        status: "proposed" as const,
      })),
      flags: [],
    }
    const driver = driverWith(plan, sim)
    await driver.plan()
    const proposals = driver.proposals()
    expect(proposals.every((p) => typeof p.estimatedImpact === "number")).toBe(true)
    expect(proposals[0].estimatedImpact!).toBeGreaterThanOrEqual(proposals[1].estimatedImpact!)
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
