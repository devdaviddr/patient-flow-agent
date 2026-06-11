import { NextResponse } from "next/server"
import { forecastDemand, getSimulator } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/demand -> transparent incoming-demand forecast
export async function POST(req: Request) {
  const { wardId = "4A", horizonHrs = 8 } = await req.json().catch(() => ({}))
  return NextResponse.json(
    forecastDemand(getSimulator().getState(), wardId, horizonHrs),
  )
}
