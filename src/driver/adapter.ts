// The ONE module that touches @opencode-ai/sdk. If the SDK drifts, only this file
// changes. Prompts the orchestrator agent and returns its assistant text; parsing
// the plan out of that text is the driver's job, not the adapter's.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { parsePlan } from "./plan"
import { withTimeout } from "./timeout"
import { getAgentConfig, parseModel } from "./agent-config"
import type { ProposedPlan } from "./types"

let client: OpencodeClient | null = null
let sessionId: string | null = null

function getClient(): OpencodeClient {
  if (!client) {
    client = createOpencodeClient({
      baseUrl: process.env.OPENCODE_URL ?? "http://localhost:4096",
    })
  }
  return client
}

async function getSessionId(): Promise<string> {
  if (sessionId) return sessionId
  const res = await withTimeout(
    getClient().session.create({ body: { title: "patient-flow" } }),
    getAgentConfig().promptTimeoutMs,
    "opencode session.create",
  )
  if (res.error || !res.data) {
    throw new Error(`opencode session.create failed: ${JSON.stringify(res.error)}`)
  }
  sessionId = res.data.id
  return sessionId
}

/** Prompt the orchestrator once; return its concatenated assistant text. */
export async function promptOrchestrator(text: string): Promise<string> {
  const id = await getSessionId()
  // Runtime AI config (#56): model, optional system override, and timeout.
  const cfg = getAgentConfig()
  const res = await withTimeout(
    getClient().session.prompt({
      path: { id },
      body: {
        agent: "orchestrator",
        model: parseModel(cfg.model),
        ...(cfg.systemPrompt ? { system: cfg.systemPrompt } : {}),
        parts: [{ type: "text", text }],
      },
    }),
    cfg.promptTimeoutMs,
    "opencode session.prompt",
  )
  if (res.error || !res.data) {
    throw new Error(`opencode session.prompt failed: ${JSON.stringify(res.error)}`)
  }
  return res.data.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
}

/** Plain-language Q&A (R9): ask the orchestrator a question, return its prose answer. */
export async function askOrchestrator(question: string): Promise<string> {
  return promptOrchestrator(
    `${question}\n\nAnswer in plain language from the live picture. Do not return JSON; do not call any action tool.`,
  )
}

/**
 * Default planner: prompt the orchestrator, parse its plan. One retry with a
 * terse correction if the first response isn't valid JSON — never a silent empty plan.
 */
export async function planViaOrchestrator(promptBody: string): Promise<ProposedPlan> {
  const first = await promptOrchestrator(`${promptBody}\n${getAgentConfig().planInstruction}`)
  try {
    return parsePlan(first)
  } catch {
    const retry = await promptOrchestrator(
      "Your previous reply was not valid JSON. Reply with ONLY the JSON object in a ```json fenced block.",
    )
    return parsePlan(retry)
  }
}

function truncate(s: string, n = 140): string {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine
}

/**
 * Same as planViaOrchestrator, but reports the agent's live activity (each tool call
 * and its result) via onLog while it runs — by polling the session's messages.
 * Best-effort: logging never throws and never blocks the plan.
 */
export async function planViaOrchestratorLogged(
  promptBody: string,
  onLog: (text: string) => void,
): Promise<ProposedPlan> {
  const id = await getSessionId()
  const client = getClient()
  const called = new Set<string>()
  const resulted = new Set<string>()

  // Snapshot existing message parts so we only report THIS assessment's activity.
  try {
    const existing = await client.session.messages({ path: { id } })
    for (const m of existing.data ?? [])
      for (const p of m.parts) {
        called.add(p.id)
        resulted.add(p.id)
      }
  } catch {
    /* ignore */
  }

  let polling = true
  const poll = async () => {
    while (polling) {
      try {
        const res = await client.session.messages({ path: { id } })
        for (const m of res.data ?? []) {
          for (const p of m.parts) {
            if (p.type !== "tool") continue
            if (!called.has(p.id)) {
              called.add(p.id)
              const input = "input" in p.state ? p.state.input : undefined
              const args = input
                ? Object.entries(input)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(" ")
                : ""
              onLog(`called ${p.tool}${args ? ` · ${args}` : ""}`)
            }
            if (
              (p.state.status === "completed" || p.state.status === "error") &&
              !resulted.has(p.id)
            ) {
              resulted.add(p.id)
              if (p.state.status === "completed") {
                onLog(`  ↳ ${p.tool} → ${truncate(String(p.state.output))}`)
              } else {
                onLog(`  ↳ ${p.tool} failed`)
              }
            }
          }
        }
      } catch {
        /* ignore transient poll errors */
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  const pollPromise = poll()

  const runOnce = async (): Promise<ProposedPlan> => {
    const first = await promptOrchestrator(`${promptBody}\n${getAgentConfig().planInstruction}`)
    try {
      return parsePlan(first)
    } catch {
      onLog("reply wasn't valid JSON — asking again")
      const retry = await promptOrchestrator(
        "Your previous reply was not valid JSON. Reply with ONLY the JSON object in a ```json fenced block.",
      )
      return parsePlan(retry)
    }
  }

  try {
    return await runOnce()
  } finally {
    polling = false
    await pollPromise.catch(() => {})
  }
}
