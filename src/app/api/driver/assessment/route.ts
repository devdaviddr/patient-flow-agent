import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// GET /api/driver/assessment -> the current assessment (startedAt, status, live log)
export function GET() {
  return NextResponse.json(getDriver().assessment())
}
