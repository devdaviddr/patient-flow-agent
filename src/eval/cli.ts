// `npm run eval` — print the with/without-agent comparison for both scenarios.

import { evaluate } from "./run"

const results = evaluate()
console.log("\nPatient Flow Orchestrator — eval (with vs without agent)\n")
for (const r of results) {
  const { withAgent: a, withoutAgent: b } = r
  console.log(`Scenario: ${r.scenario}  (seed ${r.seed})`)
  console.log(
    `  access-block hours : with ${a.accessBlockHours.toFixed(1)}  vs  without ${b.accessBlockHours.toFixed(1)}` +
      `   (Δ ${(a.accessBlockHours - b.accessBlockHours).toFixed(1)}, lower is better)`,
  )
  console.log(
    `  end-of-day headroom: with ${a.endOfDayHeadroom}  vs  without ${b.endOfDayHeadroom}` +
      `   (Δ ${a.endOfDayHeadroom - b.endOfDayHeadroom}, higher is better)`,
  )
  const helps =
    a.accessBlockHours < b.accessBlockHours && a.endOfDayHeadroom > b.endOfDayHeadroom
  console.log(`  → agent helps on both metrics: ${helps ? "YES" : "NO"}\n`)
}
