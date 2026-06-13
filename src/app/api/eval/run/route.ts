import { NextResponse } from "next/server"
import { evaluate } from "@/eval"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// GET /api/eval/run -> with/without-agent KPIs for both scenarios (deterministic, fast).
// Operator-only: it triggers an eval run; the same-origin check matches the other
// agent-run/mutating control surfaces.
export const GET = withPolicy("operator", (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  return NextResponse.json(evaluate())
})
