import { NextResponse } from "next/server"
import { forecastDischarges, getSimulator } from "@/sim"
import { withPolicy } from "@/auth/withPolicy"
import { parseForecastBody } from "../validate"

export const dynamic = "force-dynamic"

// POST /api/sim/forecast/discharges -> transparent discharge-readiness forecast
export const POST = withPolicy("authenticated", async (req) => {
  const state = getSimulator().getState()
  const parsed = parseForecastBody(await req.json().catch(() => ({})), state)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  return NextResponse.json(forecastDischarges(state, parsed.wardId, parsed.horizonHrs))
})
