import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/driver/flags -> non-actionable blockers surfaced for visibility (R6)
export const GET = withPolicy("authenticated", () => {
  return NextResponse.json(getDriver().flags())
})
