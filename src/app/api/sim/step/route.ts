import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/step -> advance one tick; returns the events emitted + new state.
// A dev/eval control surface; the Phase 4 loop driver will own clock advancement.
export function POST() {
  const sim = getSimulator()
  const events = sim.step()
  return NextResponse.json({ events, state: sim.getState() })
}
