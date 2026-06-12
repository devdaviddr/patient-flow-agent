// S11 (the headline) + eval determinism (S12).

import { describe, expect, it } from "vitest"
import { evaluate, runScenario } from "@/eval"
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
