import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// GET /api/driver/records -> the decision trail (gaps, plans, actions)
export function GET() {
  return NextResponse.json(getDriver().records())
}
