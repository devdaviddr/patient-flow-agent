// Attributed decisions (spec A8). Both approve AND reject by a coordinator must
// write a DecisionRecord carrying the correct actor snapshot ({ id, name, role }).
// Uses the real Driver with an injected planner + fresh Simulator — deterministic
// and offline (no agent, no auth server). Synthetic identity only.

import { describe, expect, it } from "vitest"
import { Simulator } from "@/sim"
import { Driver, type DecisionActor, type ProposedPlan } from "@/driver"

const ACTOR: DecisionActor = {
  id: "u-coordinator",
  name: "Dr. A. Coordinator",
  role: "coordinator",
}

// A plan targeting a real pharmacy_script-blocked patient in a fresh sim.
function planFor(sim: Simulator): { plan: ProposedPlan; targetId: string } {
  const blocked = sim.getState().patients.find((p) => p.blocker === "pharmacy_script")!
  const plan: ProposedPlan = {
    gaps: [],
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
    flags: [],
  }
  return { plan, targetId: blocked.id }
}

function driverWith(plan: ProposedPlan, sim: Simulator): Driver {
  return new Driver({ sim, planner: async () => plan })
}

function actionRecords(driver: Driver) {
  return driver.records().filter((r) => r.type === "action")
}

describe("attributed decisions (A8)", () => {
  it("approve writes a DecisionRecord carrying the actor", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()

    driver.approve("iv-1", ACTOR)

    const actions = actionRecords(driver)
    expect(actions).toHaveLength(1)
    expect(actions[0].actor).toEqual(ACTOR)
  })

  it("reject writes a DecisionRecord carrying the actor", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()

    driver.reject("iv-1", ACTOR)

    const actions = actionRecords(driver)
    expect(actions).toHaveLength(1)
    expect(actions[0].actor).toEqual(ACTOR)
    // Rejection must not touch sim state.
    expect(actions[0].rationale).toContain("Rejected")
  })

  it("the actor is a denormalized snapshot, not the live session object", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()

    driver.approve("iv-1", { ...ACTOR })
    const [record] = actionRecords(driver)
    // Both role and name are captured for the audit trail ("Approved by ...").
    expect(record.actor?.role).toBe("coordinator")
    expect(record.actor?.name).toBe(ACTOR.name)
  })

  it("agent-emitted gap/plan records carry no actor", async () => {
    const sim = new Simulator("normal-weekday")
    const { plan } = planFor(sim)
    const driver = driverWith(plan, sim)
    await driver.plan()

    const nonAction = driver.records().filter((r) => r.type !== "action")
    expect(nonAction.length).toBeGreaterThan(0)
    for (const r of nonAction) expect(r.actor).toBeUndefined()
  })
})
