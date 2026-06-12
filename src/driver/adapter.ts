// The ONE module that touches @opencode-ai/sdk. If the SDK drifts, only this file
// changes. Prompts the orchestrator agent and returns its assistant text; parsing
// the plan out of that text is the driver's job, not the adapter's.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { parsePlan } from "./plan"
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
  const res = await getClient().session.create({ body: { title: "patient-flow" } })
  if (res.error || !res.data) {
    throw new Error(`opencode session.create failed: ${JSON.stringify(res.error)}`)
  }
  sessionId = res.data.id
  return sessionId
}

/** Prompt the orchestrator once; return its concatenated assistant text. */
export async function promptOrchestrator(text: string): Promise<string> {
  const id = await getSessionId()
  const res = await getClient().session.prompt({
    path: { id },
    body: { agent: "orchestrator", parts: [{ type: "text", text }] },
  })
  if (res.error || !res.data) {
    throw new Error(`opencode session.prompt failed: ${JSON.stringify(res.error)}`)
  }
  return res.data.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
}

// The instruction appended each tick so the orchestrator returns a parseable plan.
const PLAN_INSTRUCTION = `
Now return ONLY a JSON object (in a \`\`\`json fenced block) of this exact shape — no prose after it:
{
  "gaps": [{ "wardId": string, "atTime": ISO8601, "projectedDeficit": number, "factors": string[] }],
  "interventions": [{
    "type": "expedite_script" | "request_transport",
    "targetPatientId": string, "addressesGap": string,
    "impactScore": number, "rationale": string
  }]
}
Rank interventions by impactScore, highest first. Propose only; do not call any action tool.`

/**
 * Default planner: prompt the orchestrator, parse its plan. One retry with a
 * terse correction if the first response isn't valid JSON — never a silent empty plan.
 */
export async function planViaOrchestrator(promptBody: string): Promise<ProposedPlan> {
  const first = await promptOrchestrator(`${promptBody}\n${PLAN_INSTRUCTION}`)
  try {
    return parsePlan(first)
  } catch {
    const retry = await promptOrchestrator(
      "Your previous reply was not valid JSON. Reply with ONLY the JSON object in a ```json fenced block.",
    )
    return parsePlan(retry)
  }
}
