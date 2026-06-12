import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// GET /api/driver/flags -> non-actionable blockers surfaced for visibility (R6)
export function GET() {
  return NextResponse.json(getDriver().flags())
}
