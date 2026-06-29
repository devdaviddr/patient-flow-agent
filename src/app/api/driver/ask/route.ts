import { NextResponse } from "next/server"
import { askOrchestrator } from "@/driver/adapter"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"
import { checkRateLimit } from "@/auth/rate-limit"

export const dynamic = "force-dynamic"

// Each call is a model round-trip; cap per IP so an authenticated caller can't
// amplify compute/cost by hammering it.
const ASK_RATE_LIMIT = { windowSeconds: 60, max: 10 }

// POST /api/driver/ask {question} -> plain-language answer from the orchestrator (R9)
export const POST = withPolicy("authenticated", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const limited = checkRateLimit(req, "driver-ask", ASK_RATE_LIMIT)
  if (limited) return limited
  const { question } = await req.json().catch(() => ({}))
  if (!question) {
    return NextResponse.json({ error: "question required" }, { status: 400 })
  }
  try {
    return NextResponse.json({ answer: await askOrchestrator(question) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ask failed" },
      { status: 502 },
    )
  }
})
