import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// POST /api/driver/assess -> kick off an assessment in the background; returns
// immediately. Poll GET /api/driver/assessment for live progress + the agent's log.
export const POST = withPolicy("operator", (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  return NextResponse.json(getDriver().startAssessment())
})
