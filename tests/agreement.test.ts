// Reasoning-quality metric (#74 item 4): the deterministic reference action set and
// the precision/recall/F1 scorer. Pure + offline.

import { describe, expect, it } from "vitest"
import { Simulator } from "@/sim"
import { referenceActions, scoreAgreement, meanAgreement } from "@/eval"

describe("referenceActions (#74 item 4)", () => {
  it("maps each not-ready, actionable, in-horizon discharge to its clearing action", () => {
    const state = new Simulator("normal-weekday").getState()
    const ref = referenceActions(state, 8)
    // Every reference entry corresponds to a real patient blocked on the matching type.
    const ACTION: Record<string, string> = {
      pharmacy_script: "expedite_script",
      transport: "request_transport",
      allied_health: "page_allied_health",
      placement: "request_placement",
    }
    for (const r of ref) {
      const p = state.patients.find((x) => x.id === r.patientId)!
      expect(r.type).toBe(ACTION[p.blocker])
      expect(p.predictedDischarge?.ready).toBe(false)
    }
    expect(ref.length).toBeGreaterThan(0)
  })

  it("excludes discharges beyond the horizon", () => {
    const state = new Simulator("normal-weekday").getState()
    expect(referenceActions(state, 0).length).toBeLessThanOrEqual(referenceActions(state, 24).length)
  })
})

describe("scoreAgreement", () => {
  const ref = [
    { patientId: "p1", type: "expedite_script" },
    { patientId: "p2", type: "request_transport" },
  ]

  it("is perfect when proposals exactly match the reference", () => {
    const s = scoreAgreement(
      [
        { targetPatientId: "p1", type: "expedite_script" },
        { targetPatientId: "p2", type: "request_transport" },
      ],
      ref,
    )
    expect(s).toMatchObject({ precision: 1, recall: 1, f1: 1, matched: 2 })
  })

  it("penalises a miss (recall) and a wrong proposal (precision)", () => {
    const s = scoreAgreement(
      [
        { targetPatientId: "p1", type: "expedite_script" }, // hit
        { targetPatientId: "pX", type: "request_transport" }, // wrong (not in ref)
      ],
      ref,
    )
    expect(s.matched).toBe(1)
    expect(s.precision).toBeCloseTo(0.5) // 1 of 2 proposed
    expect(s.recall).toBeCloseTo(0.5) // 1 of 2 reference
  })

  it("treats 'nothing to do, proposed nothing' as perfect agreement", () => {
    expect(scoreAgreement([], [])).toMatchObject({ precision: 1, recall: 1, f1: 1 })
  })

  it("a blocker-type mismatch does not count as a match", () => {
    const s = scoreAgreement([{ targetPatientId: "p1", type: "request_transport" }], ref)
    expect(s.matched).toBe(0)
  })
})

describe("meanAgreement", () => {
  it("averages per-tick scores", () => {
    const m = meanAgreement([
      { precision: 1, recall: 1, f1: 1, matched: 2, proposed: 2, reference: 2 },
      { precision: 0, recall: 0, f1: 0, matched: 0, proposed: 1, reference: 2 },
    ])
    expect(m.precision).toBe(0.5)
    expect(m.recall).toBe(0.5)
  })

  it("returns zeros for no scores", () => {
    expect(meanAgreement([])).toMatchObject({ precision: 0, recall: 0, f1: 0 })
  })
})
