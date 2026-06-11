// S12 — the same seed + scenario replays an identical day.

import { describe, expect, it } from "vitest"
import { Simulator, type ScenarioName } from "@/sim"

function run(scenario: ScenarioName, seed: number, ticks: number) {
  const sim = new Simulator(scenario, seed)
  const stream = []
  for (let i = 0; i < ticks; i++) stream.push(sim.step())
  return { stream, finalState: sim.getState() }
}

describe("determinism (S12)", () => {
  it("same seed + scenario -> identical event stream and final state", () => {
    const a = run("normal-weekday", 42, 48)
    const b = run("normal-weekday", 42, 48)
    expect(a.stream).toEqual(b.stream)
    expect(a.finalState).toEqual(b.finalState)
  })

  it("flu-surge is reproducible too", () => {
    const a = run("flu-surge", 7, 48)
    const b = run("flu-surge", 7, 48)
    expect(a.stream).toEqual(b.stream)
    expect(a.finalState).toEqual(b.finalState)
  })

  it("a different seed produces a different day", () => {
    const a = run("normal-weekday", 42, 48)
    const b = run("normal-weekday", 99, 48)
    expect(a.stream).not.toEqual(b.stream)
  })
})
