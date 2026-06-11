import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"

export const dynamic = "force-dynamic"

// GET /api/sim/state -> current WorldState
export function GET() {
  return NextResponse.json(getSimulator().getState())
}
