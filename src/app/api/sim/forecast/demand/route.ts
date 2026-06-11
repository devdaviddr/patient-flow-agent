import { NextResponse } from "next/server"
import { stubDemandForecast } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/demand -> STUB (real heuristic in Phase 2)
export async function POST(req: Request) {
  const { wardId = "4A", horizonHrs = 8 } = await req.json().catch(() => ({}))
  return NextResponse.json(stubDemandForecast(wardId, horizonHrs))
}
