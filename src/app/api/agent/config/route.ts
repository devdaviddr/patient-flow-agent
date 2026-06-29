import { NextResponse } from "next/server"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"
import {
  AgentConfigError,
  getAgentConfig,
  resetAgentConfig,
  setAgentConfig,
  type AgentConfig,
} from "@/driver/agent-config"

export const dynamic = "force-dynamic"

// GET    /api/agent/config -> the current AI config (model, prompts, timeout)
// PUT    /api/agent/config -> update it (S13-validated); 400 on a disallowed prompt
// DELETE /api/agent/config -> reset to the built-in defaults
// Operator-only — retuning the agent is an R7-class control.

export const GET = withPolicy("operator", () => {
  return NextResponse.json(getAgentConfig())
})

export const PUT = withPolicy("operator", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const patch = (await req.json().catch(() => ({}))) as Partial<AgentConfig>
  try {
    return NextResponse.json(setAgentConfig(patch))
  } catch (err) {
    if (err instanceof AgentConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
})

export const DELETE = withPolicy("operator", (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  return NextResponse.json(resetAgentConfig())
})
