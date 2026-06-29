// `npm run eval` — print the with/without-agent comparison for both scenarios.
//
//   npm run eval                                   # deterministic oracle (fast)
//   npm run eval -- --mode agent                   # the REAL orchestrator, N trials —
//   npm run eval -- --mode agent --trials 3 --ticks 8    drives the RUNNING app over HTTP
//   npm run eval -- --mode agent --base http://host:3000  (needs app + opencode up)

import { evaluate, evaluateWithAgent } from "./run"

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}
const agentMode = flag("--mode") === "agent"
const trials = flag("--trials") ? Number(flag("--trials")) : undefined
const ticks = flag("--ticks") ? Number(flag("--ticks")) : undefined
const baseUrl = flag("--base")

async function main(): Promise<void> {
  if (agentMode) {
    console.log("\nPatient Flow Orchestrator — REAL-AGENT eval (N trials; drives the running app)\n")
    const results = await evaluateWithAgent({ trials, ticks, baseUrl })
    for (const r of results) {
      const { withAgent: a, withoutAgent: b } = r
      const span = (lo: number, hi: number) => `[${lo.toFixed(1)}–${hi.toFixed(1)}]`
      console.log(`Scenario: ${r.scenario}  (seed ${r.seed}, ${r.trials} trials)`)
      console.log(
        `  access-block hours : agent mean ${a.mean.accessBlockHours.toFixed(1)} ` +
          `${span(a.min.accessBlockHours, a.max.accessBlockHours)}  vs  without ${b.accessBlockHours.toFixed(1)}  (lower is better)`,
      )
      console.log(
        `  end-of-day headroom: agent mean ${a.mean.endOfDayHeadroom.toFixed(1)} ` +
          `${span(a.min.endOfDayHeadroom, a.max.endOfDayHeadroom)}  vs  without ${b.endOfDayHeadroom}  (higher is better)`,
      )
      const helps =
        a.mean.accessBlockHours < b.accessBlockHours && a.mean.endOfDayHeadroom > b.endOfDayHeadroom
      console.log(`  → agent helps on both (mean): ${helps ? "YES" : "NO"}\n`)
    }
    return
  }

  const results = evaluate()
  console.log("\nPatient Flow Orchestrator — eval (with vs without agent · deterministic oracle)\n")
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
}

main().catch((err: unknown) => {
  console.error("eval failed:", err)
  process.exit(1)
})
