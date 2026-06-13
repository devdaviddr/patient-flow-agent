import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/driver/assessment -> the current assessment (startedAt, status, live log)
export const GET = withPolicy("authenticated", () => {
  return NextResponse.json(getDriver().assessment())
})
