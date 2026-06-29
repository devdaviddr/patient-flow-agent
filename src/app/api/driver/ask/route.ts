import { NextResponse } from "next/server"
import { askOrchestrator } from "@/driver/adapter"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// POST /api/driver/ask {question} -> plain-language answer from the orchestrator (R9)
export const POST = withPolicy("authenticated", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
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
