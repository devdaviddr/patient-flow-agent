// Plan grounding (#74 item 1) — only interventions that can actually act on the live
// world (target patient exists + blocked on the matching type) are kept; the rest are
// dropped with a reason. Pure + offline.

import { describe, expect, it } from "vitest"
import { Simulator } from "@/sim"
import { groundInterventions } from "@/driver/grounding"
import type { Intervention } from "@/driver"

const iv = (over: Partial<Intervention>): Intervention => ({
  id: "iv-1",
  type: "expedite_script",
  targetPatientId: "x",
  addressesGap: "4A",
  impactScore: 0.5,
  rationale: "r",
  status: "proposed",
  ...over,
})

describe("groundInterventions (#74 item 1)", () => {
  it("keeps an intervention that matches a real patient's blocker", () => {
    const state = new Simulator("normal-weekday").getState()
    const p = state.patients.find((x) => x.blocker === "pharmacy_script")!
    const res = groundInterventions([iv({ type: "expedite_script", targetPatientId: p.id })], state)
    expect(res.grounded).toHaveLength(1)
    expect(res.dropped).toHaveLength(0)
  })

  it("drops an intervention for a non-existent patient", () => {
    const state = new Simulator("normal-weekday").getState()
    const res = groundInterventions([iv({ targetPatientId: "ghost" })], state)
    expect(res.grounded).toHaveLength(0)
    expect(res.dropped[0].reason).toMatch(/no such patient ghost/)
  })

  it("drops an intervention whose action doesn't match the patient's blocker", () => {
    const state = new Simulator("normal-weekday").getState()
    const p = state.patients.find((x) => x.blocker === "placement")!
    const res = groundInterventions([iv({ type: "request_transport", targetPatientId: p.id })], state)
    expect(res.grounded).toHaveLength(0)
    expect(res.dropped[0].reason).toMatch(/blocked on placement, not transport/)
  })

  it("preserves order + identity of the grounded items", () => {
    const state = new Simulator("normal-weekday").getState()
    const ph = state.patients.find((x) => x.blocker === "pharmacy_script")!
    const tr = state.patients.find((x) => x.blocker === "transport")!
    const res = groundInterventions(
      [
        iv({ id: "a", type: "expedite_script", targetPatientId: ph.id }),
        iv({ id: "ghost", targetPatientId: "nope" }),
        iv({ id: "b", type: "request_transport", targetPatientId: tr.id }),
      ],
      state,
    )
    expect(res.grounded.map((g) => g.id)).toEqual(["a", "b"])
    expect(res.dropped).toHaveLength(1)
  })
})
