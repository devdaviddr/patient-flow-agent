import { NextResponse } from "next/server"
import { forecastDischarges, getSimulator } from "@/sim"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/discharges -> transparent discharge-readiness forecast
export const POST = withPolicy("authenticated", async (req) => {
  const { wardId = "4A", horizonHrs = 8 } = await req.json().catch(() => ({}))
  return NextResponse.json(
    forecastDischarges(getSimulator().getState(), wardId, horizonHrs),
  )
})
