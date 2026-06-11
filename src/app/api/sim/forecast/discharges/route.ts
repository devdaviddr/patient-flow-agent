import { NextResponse } from "next/server"
import { stubDischargeForecast } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/discharges -> STUB (real heuristic in Phase 2)
export async function POST(req: Request) {
  const { wardId = "4A", horizonHrs = 8 } = await req.json().catch(() => ({}))
  return NextResponse.json(stubDischargeForecast(wardId, horizonHrs))
}
