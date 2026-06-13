import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/driver/proposals -> the current proposed interventions
export const GET = withPolicy("authenticated", () => {
  return NextResponse.json(getDriver().proposals())
})
