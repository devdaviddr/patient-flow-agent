// S11 (the headline) + eval determinism (S12).

import { describe, expect, it } from "vitest"
import { aggregate, evaluate, runScenario } from "@/eval"
import type { ScenarioName } from "@/sim"

describe("the agent helps (S11)", () => {
  it.each<ScenarioName>(["normal-weekday", "flu-surge"])(
    "%s: with-agent beats without on BOTH metrics",
    (scenario) => {
      const withAgent = runScenario(scenario, true)
      const without = runScenario(scenario, false)
      expect(withAgent.accessBlockHours).toBeLessThan(without.accessBlockHours)
      expect(withAgent.endOfDayHeadroom).toBeGreaterThan(without.endOfDayHeadroom)
    },
  )
})

describe("eval determinism (S12)", () => {
  it("evaluate() twice → identical results", () => {
    expect(evaluate()).toEqual(evaluate())
  })
})

describe("aggregate — N-trial spread (#31)", () => {
  it("computes mean/min/max per metric and keeps the raw trials", () => {
    const agg = aggregate([
      { accessBlockHours: 10, endOfDayHeadroom: 4 },
      { accessBlockHours: 20, endOfDayHeadroom: 6 },
      { accessBlockHours: 30, endOfDayHeadroom: 8 },
    ])
    expect(agg.mean).toEqual({ accessBlockHours: 20, endOfDayHeadroom: 6 })
    expect(agg.min).toEqual({ accessBlockHours: 10, endOfDayHeadroom: 4 })
    expect(agg.max).toEqual({ accessBlockHours: 30, endOfDayHeadroom: 8 })
    expect(agg.trials).toHaveLength(3)
  })

  it("throws on an empty trial set rather than returning NaN", () => {
    expect(() => aggregate([])).toThrow()
  })
})
