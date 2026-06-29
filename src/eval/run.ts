// Headless eval: play a seeded day with and without the agent's interventions,
// computing the two flow KPIs. Deterministic (seeded sim + deterministic policy),
// so the result is reproducible.

import { Simulator, SCENARIOS, type ScenarioName, type WorldState } from "../sim"
import { applyOraclePolicy } from "./policy"
import { meanAgreement, referenceActions, scoreAgreement, type AgreementScore } from "./agreement"
import type { AggregatedKPIs, AgentEvalResult, EvalResult, FlowKPIs } from "./kpis"

const TICKS = 48 // a full simulated day, at 30-min ticks
const TICK_HOURS = 0.5
const DEFAULT_AGENT_TRIALS = 5

export function runScenario(scenario: ScenarioName, withAgent: boolean, ticks: number = TICKS): FlowKPIs {
  const sim = new Simulator(scenario)
  let accessBlockHours = 0
  for (let i = 0; i < ticks; i++) {
    if (withAgent) applyOraclePolicy(sim) // act on stuck discharges before the tick
    sim.step()
    // patients still queued after this tick's admissions are access-blocked
    accessBlockHours += sim.getState().edQueue.length * TICK_HOURS
  }
  const endOfDayHeadroom = sim
    .getState()
    .beds.filter((b) => b.status === "empty_clean").length
  return { accessBlockHours, endOfDayHeadroom }
}

export function evaluate(): EvalResult[] {
  const scenarios: ScenarioName[] = ["normal-weekday", "flu-surge"]
  return scenarios.map((scenario) => ({
    scenario,
    seed: SCENARIOS[scenario].seed,
    withAgent: runScenario(scenario, true),
    withoutAgent: runScenario(scenario, false),
  }))
}

// Per-metric mean/min/max over N trials. Pure — the spread is what makes a
// non-deterministic (real-model) run honest (#31).
export function aggregate(trials: FlowKPIs[]): AggregatedKPIs {
  if (trials.length === 0) throw new Error("aggregate(): no trials")
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const acc = trials.map((t) => t.accessBlockHours)
  const head = trials.map((t) => t.endOfDayHeadroom)
  return {
    trials,
    mean: { accessBlockHours: mean(acc), endOfDayHeadroom: mean(head) },
    min: { accessBlockHours: Math.min(...acc), endOfDayHeadroom: Math.min(...head) },
    max: { accessBlockHours: Math.max(...acc), endOfDayHeadroom: Math.max(...head) },
  }
}

export interface AgentEvalOptions {
  /** The running app's base URL (serves /api/sim + the driver + opencode behind it). */
  baseUrl?: string
  /** Operator credentials to drive the gated control surface. */
  email?: string
  password?: string
  /** Trials per scenario — the model isn't seeded, so we report the spread (#31). */
  trials?: number
  /** Ticks per trial (default a full day); fewer = a quicker smoke run. */
  ticks?: number
  scenarios?: ScenarioName[]
}

async function signIn(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`eval sign-in failed: ${res.status}`)
  const cookie = res.headers.get("set-cookie")?.split(";")[0]
  if (!cookie) throw new Error("eval sign-in returned no session cookie")
  return cookie
}

/**
 * Real-agent eval (#31): drive the actual orchestrator against the running app's
 * single simulator over HTTP, auto-approving every proposal — there is no human in a
 * headless eval, so this measures the agent's own impact. The model isn't seeded, so
 * it runs N trials per scenario and reports the spread (mean/min/max).
 *
 * Everything goes through the app's API so the agent and the eval share ONE sim (a
 * local in-process sim would diverge from the one the agent's tools reach). Needs the
 * stack up (app + opencode) and is long-running (~one model call per tick).
 */
export async function evaluateWithAgent(opts: AgentEvalOptions = {}): Promise<AgentEvalResult[]> {
  const baseUrl = opts.baseUrl ?? process.env.EVAL_BASE_URL ?? "http://localhost:3000"
  const email = opts.email ?? "coordinator@example-hospital.test"
  const password = opts.password ?? "demo-coordinator-2026"
  const trials = opts.trials ?? DEFAULT_AGENT_TRIALS
  const ticks = opts.ticks ?? TICKS
  const scenarios = opts.scenarios ?? (["normal-weekday", "flu-surge"] as ScenarioName[])

  const cookie = await signIn(baseUrl, email, password)
  const headers = { "content-type": "application/json", origin: baseUrl, cookie }
  const post = (path: string, body?: unknown): Promise<Response> =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined })
  const getJson = async <T>(path: string): Promise<T> =>
    (await fetch(`${baseUrl}${path}`, { headers: { cookie } })).json() as Promise<T>

  const results: AgentEvalResult[] = []
  for (const scenario of scenarios) {
    const seed = SCENARIOS[scenario].seed
    const runs: FlowKPIs[] = []
    const scores: AgreementScore[] = [] // every tick of every trial
    for (let t = 0; t < trials; t++) {
      await post("/api/sim/scenario", { scenario, seed })
      let accessBlockHours = 0
      for (let i = 0; i < ticks; i++) {
        await post("/api/driver/plan") // the real agent perceives + proposes (stashed server-side)
        const proposals = await getJson<{ id: string; type: string; targetPatientId: string }[]>(
          "/api/driver/proposals",
        )
        // Score the agent's reasoning against the deterministic reference for the state
        // it just planned on (before we act on it).
        const planState = await getJson<WorldState>("/api/sim/state")
        scores.push(scoreAgreement(proposals, referenceActions(planState)))

        for (const iv of proposals) await post("/api/driver/approve", { interventionId: iv.id })
        const stepBody = (await (await post("/api/sim/step")).json()) as { state: { edQueue: unknown[] } }
        accessBlockHours += stepBody.state.edQueue.length * TICK_HOURS
      }
      const state = await getJson<{ beds: { status: string }[] }>("/api/sim/state")
      const endOfDayHeadroom = state.beds.filter((b) => b.status === "empty_clean").length
      runs.push({ accessBlockHours, endOfDayHeadroom })
    }
    // Baseline runs the SAME tick count so the comparison is fair (matters for short
    // smoke runs; the default is a full day either way).
    results.push({
      scenario,
      seed,
      trials,
      withAgent: aggregate(runs),
      withoutAgent: runScenario(scenario, false, ticks),
      agreement: meanAgreement(scores),
    })
  }
  return results
}
