import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// POST /api/sim/step -> advance one tick; returns the events emitted + new state.
// A dev/eval control surface; the Phase 4 loop driver will own clock advancement.
export const POST = withPolicy("operator", (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const sim = getSimulator()
  const events = sim.step()
  return NextResponse.json({ events, state: sim.getState() })
})
