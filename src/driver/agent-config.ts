// Runtime-tunable AI config (#56). The adapter reads this at prompt time, so a
// coordinator can change the model, system prompt, plan instruction, and timeout from
// the Settings UI without a redeploy. Stored as a single row on the SQLite volume
// (NULL column = use the built-in default). Custom prompts are validated against the
// S13 clinical denylist on save, so an override can't smuggle clinical wording into
// the agent's instructions.

import { eq, sql } from "drizzle-orm"
import { db } from "@/auth/db"
import { agentConfig } from "@/auth/schema"
import { findClinicalTerms } from "@/safety"

export const DEFAULT_MODEL = "opencode/big-pickle"
export const DEFAULT_PROMPT_TIMEOUT_MS = 120_000

// The instruction appended each tick so the orchestrator returns a parseable plan.
export const DEFAULT_PLAN_INSTRUCTION = `
For every not-ready discharge, identify its blocker across all four types
(pharmacy_script, transport, allied_health, placement). You may ask @discharge for the detail.
Every type is actionable — propose the matching action for each:
  pharmacy_script -> expedite_script
  transport       -> request_transport
  allied_health   -> page_allied_health
  placement       -> request_placement
Use "flags" only for a blocker you genuinely cannot match to one of these actions.

Now return ONLY a JSON object (in a \`\`\`json fenced block) of this exact shape — no prose after it:
{
  "gaps": [{ "wardId": string, "atTime": ISO8601, "projectedDeficit": number, "factors": string[] }],
  "interventions": [{
    "type": "expedite_script" | "request_transport" | "page_allied_health" | "request_placement",
    "targetPatientId": string, "addressesGap": string,
    "impactScore": number, "rationale": string
  }],
  "flags": [{
    "patientId": string, "wardId": string,
    "blocker": "allied_health" | "placement", "reason": string
  }]
}
Rank interventions by impactScore, highest first. Propose only; do not call any action tool.`

export interface AgentConfig {
  model: string
  systemPrompt: string | null // null = use the agent's own (orchestrator.md) system prompt
  planInstruction: string
  promptTimeoutMs: number
}

export class AgentConfigError extends Error {}

const SINGLETON_ID = 1
const MIN_TIMEOUT_MS = 1000

function ensureTable(): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS agent_config (
    id integer PRIMARY KEY,
    model text,
    system_prompt text,
    plan_instruction text,
    prompt_timeout_ms integer,
    updated_at integer NOT NULL
  )`)
}

export function getAgentConfig(): AgentConfig {
  ensureTable()
  const row = db.select().from(agentConfig).where(eq(agentConfig.id, SINGLETON_ID)).get()
  return {
    model: row?.model ?? DEFAULT_MODEL,
    systemPrompt: row?.systemPrompt ?? null,
    planInstruction: row?.planInstruction ?? DEFAULT_PLAN_INSTRUCTION,
    promptTimeoutMs: row?.promptTimeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS,
  }
}

export function setAgentConfig(patch: Partial<AgentConfig>): AgentConfig {
  // S13: a custom prompt must not introduce clinical vocabulary.
  for (const [field, value] of [
    ["systemPrompt", patch.systemPrompt],
    ["planInstruction", patch.planInstruction],
  ] as const) {
    if (typeof value === "string") {
      const terms = findClinicalTerms(value)
      if (terms.length > 0) {
        throw new AgentConfigError(`${field} contains disallowed clinical terms: ${terms.join(", ")}`)
      }
    }
  }
  if (
    patch.promptTimeoutMs !== undefined &&
    (!Number.isFinite(patch.promptTimeoutMs) || patch.promptTimeoutMs < MIN_TIMEOUT_MS)
  ) {
    throw new AgentConfigError(`promptTimeoutMs must be a number ≥ ${MIN_TIMEOUT_MS}`)
  }

  ensureTable()
  const next = { ...getAgentConfig(), ...patch }
  const values = {
    model: next.model,
    systemPrompt: next.systemPrompt,
    planInstruction: next.planInstruction,
    promptTimeoutMs: next.promptTimeoutMs,
    updatedAt: new Date(),
  }
  db.insert(agentConfig)
    .values({ id: SINGLETON_ID, ...values })
    .onConflictDoUpdate({ target: agentConfig.id, set: values })
    .run()
  return next
}

export function resetAgentConfig(): AgentConfig {
  ensureTable()
  db.delete(agentConfig).where(eq(agentConfig.id, SINGLETON_ID)).run()
  return getAgentConfig()
}

// "provider/model" → the SDK's { providerID, modelID }. Defaults the provider to
// opencode when none is given.
export function parseModel(model: string): { providerID: string; modelID: string } {
  const i = model.indexOf("/")
  return i === -1
    ? { providerID: "opencode", modelID: model }
    : { providerID: model.slice(0, i), modelID: model.slice(i + 1) }
}
