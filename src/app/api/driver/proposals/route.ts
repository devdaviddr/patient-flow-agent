import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// GET /api/driver/proposals -> the current proposed interventions
export function GET() {
  return NextResponse.json(getDriver().proposals())
}
