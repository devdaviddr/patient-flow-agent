// S13 / C8 — the safety invariant: no clinical vocabulary anywhere the system
// authors or emits. This is the code-enforced version of the no-clinical-output
// rule. If it ever goes red, the tools/prompts/forecasts leaked clinical content.
//
// What it CAN'T prove: the model never utters a clinical word at runtime. It guards
// everything we author (tools, prompts) plus the deterministic outputs (state,
// forecasts, rationales).

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { Simulator, forecastDischarges, forecastDemand } from "@/sim"

const ROOT = process.cwd()

// Whole-word, case-insensitive. Department/logistics words (pharmacy, transport,
// script, placement, allied-health) are NOT clinical and stay allowed.
const DENYLIST = [
  "acuity",
  "triage",
  "diagnosis",
  "diagnose",
  "treatment",
  "treat",
  "prognosis",
  "symptom",
  "medication",
  "drug",
]

const AUTHORED_FILES = [
  ".opencode/tools/world_state.ts",
  ".opencode/tools/forecast_discharges.ts",
  ".opencode/tools/forecast_demand.ts",
  ".opencode/tools/expedite_script.ts",
  ".opencode/tools/request_transport.ts",
  ".opencode/agents/orchestrator.md",
  ".opencode/agents/discharge.md",
  ".opencode/agents/demand.md",
]

function offendingTerms(text: string): string[] {
  return DENYLIST.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(text))
}

function sampledOutputs(): string {
  const parts: string[] = []
  for (const scenario of ["normal-weekday", "flu-surge"] as const) {
    const sim = new Simulator(scenario)
    for (let i = 0; i < 6; i++) sim.step()
    const state = sim.getState()
    parts.push(JSON.stringify(state))
    for (const ward of state.wards) {
      parts.push(JSON.stringify(forecastDischarges(state, ward.id, 8)))
      parts.push(JSON.stringify(forecastDemand(state, ward.id, 8)))
    }
  }
  return parts.join("\n")
}

describe("safety invariant — no clinical vocabulary (S13)", () => {
  it.each(AUTHORED_FILES)("%s contains no clinical terms", (file) => {
    const text = readFileSync(join(ROOT, file), "utf8")
    expect(offendingTerms(text)).toEqual([])
  })

  it("sampled world state + forecast outputs contain no clinical terms", () => {
    expect(offendingTerms(sampledOutputs())).toEqual([])
  })

  it("the denylist itself has teeth (control)", () => {
    expect(offendingTerms("the triage nurse recorded a diagnosis")).toEqual([
      "triage",
      "diagnosis",
    ])
  })
})
