import { NextResponse } from "next/server"
import { forecastDischarges, getSimulator } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/discharges -> transparent discharge-readiness forecast
export async function POST(req: Request) {
  const { wardId = "4A", horizonHrs = 8 } = await req.json().catch(() => ({}))
  return NextResponse.json(
    forecastDischarges(getSimulator().getState(), wardId, horizonHrs),
  )
}
