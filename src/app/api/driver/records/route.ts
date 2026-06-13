import { NextResponse } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/driver/records -> the decision trail (gaps, plans, actions)
export const GET = withPolicy("authenticated", () => {
  return NextResponse.json(getDriver().records())
})
