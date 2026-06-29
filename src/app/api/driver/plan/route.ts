import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"
import { checkRateLimit } from "@/auth/rate-limit"

export const dynamic = "force-dynamic"

// Each call is a model round-trip; cap per IP to bound compute/cost amplification.
const PLAN_RATE_LIMIT = { windowSeconds: 60, max: 10 }

// POST /api/driver/plan -> run the agent, return proposed gaps + interventions.
// Needs opencode serve (a model round-trip).
export const POST = withPolicy("operator", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const limited = checkRateLimit(req, "driver-plan", PLAN_RATE_LIMIT)
  if (limited) return limited
  try {
    const plan = await getDriver().plan()
    return NextResponse.json(plan)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "plan failed" },
      { status: 502 },
    )
  }
})
