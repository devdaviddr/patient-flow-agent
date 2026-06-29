// S13 / C8 — the safety invariant: no clinical vocabulary anywhere the system
// authors or emits. This is the code-enforced version of the no-clinical-output
// rule. If it ever goes red, the tools/prompts/forecasts leaked clinical content.
//
// What it CAN'T prove: the model never utters a clinical word at runtime. It guards
// everything we author (tools, prompts) plus the deterministic outputs (state,
// forecasts, rationales).

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { Simulator, forecastDischarges, forecastDemand } from "@/sim"

const ROOT = process.cwd()

// Collect every authored file under a dir with one of `exts`, skipping node_modules.
// Globbing (vs a hand-list) means a NEW tool/agent is covered automatically — the
// previous static list could silently miss one (#52).
function walk(relDir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(ROOT, relDir), { withFileTypes: true })) {
    if (entry.name === "node_modules") continue
    const rel = join(relDir, entry.name)
    if (entry.isDirectory()) out.push(...walk(rel, exts))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(rel)
  }
  return out
}

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

// Everything the agent harness authors — globbed so a new tool/agent is scanned
// automatically (the gap in the old hand-list).
const OPENCODE_AUTHORED = walk(".opencode", [".ts", ".md"])

// src files that author human-readable strings the system emits or renders. Curated
// (not globbed) because most of src/ is logic, not authored copy — but this now also
// covers the sim/driver string templates the model-free outputs are built from (#52).
const SRC_AUTHORED = [
  "src/sim/forecast.ts", // forecast rationale templates
  "src/sim/patient.ts", // synthetic name pool
  "src/sim/scenarios.ts", // ward names
  "src/driver/plan.ts", // builds/parses intervention rationale + flag reason
  // 0.4.0 auth strings: seed display titles + demo credentials + login UI copy.
  // Auth records carry staff identity only — never clinical content (S13).
  "src/auth/seed.ts",
  "src/auth/demo-credentials.ts",
  "src/app/login/page.tsx",
  // 0.5.0 onboarding/admin copy: sign-up, invites, user administration, settings.
  "src/auth/invite.ts",
  "src/app/register/page.tsx",
  "src/app/(app)/admin/page.tsx",
  "src/app/(app)/settings/page.tsx",
]

const AUTHORED_FILES = [...OPENCODE_AUTHORED, ...SRC_AUTHORED]

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
