// Defensible impact ranking (#74 item 2): a deterministic bed-hours estimate drives
// the order, not the model's bare impactScore. Pure + offline.

import { describe, expect, it } from "vitest"
import { Simulator } from "@/sim"
import { estimateImpact, rankByImpact, IMPACT_HORIZON_HRS } from "@/driver/ranking"
import type { Intervention } from "@/driver"
import type { WorldState } from "@/sim"

const iv = (over: Partial<Intervention>): Intervention => ({
  id: "iv",
  type: "expedite_script",
  targetPatientId: "x",
  addressesGap: "4A",
  impactScore: 0.5,
  rationale: "r",
  status: "proposed",
  ...over,
})

// A minimal world with one patient whose predicted discharge is `hours` from `now`.
function worldWithDischarge(hours: number): WorldState {
  const now = "2026-06-11T08:00:00.000Z"
  const at = new Date(new Date(now).getTime() + hours * 3_600_000).toISOString()
  return {
    at: now,
    wards: [],
    beds: [],
    edQueue: [],
    patients: [
      {
        id: "p1",
        name: "n",
        ur: "UR-1",
        wardId: "4A",
        bedId: "4A-01",
        admittedAt: now,
        predictedDischarge: { at, confidence: 0.8, ready: false },
        blocker: "pharmacy_script",
      },
    ],
  }
}

describe("estimateImpact (#74 item 2)", () => {
  it("gives the full horizon for an overdue discharge", () => {
    expect(estimateImpact(iv({ targetPatientId: "p1" }), worldWithDischarge(-2))).toBe(IMPACT_HORIZON_HRS)
  })

  it("gives less the further out the discharge is", () => {
    const near = estimateImpact(iv({ targetPatientId: "p1" }), worldWithDischarge(2))
    const far = estimateImpact(iv({ targetPatientId: "p1" }), worldWithDischarge(6))
    expect(near).toBeGreaterThan(far)
    expect(near).toBeCloseTo(6)
    expect(far).toBeCloseTo(2)
  })

  it("is 0 when the discharge is beyond the horizon, or there's none", () => {
    expect(estimateImpact(iv({ targetPatientId: "p1" }), worldWithDischarge(10))).toBe(0)
    expect(estimateImpact(iv({ targetPatientId: "ghost" }), worldWithDischarge(1))).toBe(0)
  })
})

describe("rankByImpact", () => {
  it("orders a real plan by the deterministic estimate, attaching it", () => {
    const state = new Simulator("normal-weekday").getState()
    const withDischarge = state.patients.filter((p) => p.predictedDischarge)
    expect(withDischarge.length).toBeGreaterThanOrEqual(2)
    const ranked = rankByImpact(
      [
        iv({ id: "a", targetPatientId: withDischarge[1].id }),
        iv({ id: "b", targetPatientId: withDischarge[0].id }),
      ],
      state,
    )
    expect(ranked.every((r) => typeof r.estimatedImpact === "number")).toBe(true)
    expect(ranked[0].estimatedImpact).toBeGreaterThanOrEqual(ranked[1].estimatedImpact!)
  })
})
