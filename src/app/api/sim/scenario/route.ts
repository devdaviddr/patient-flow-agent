import { NextResponse } from "next/server"
import { resetSimulator } from "@/sim"
import { resetDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// POST /api/sim/scenario -> reset to a fresh world (and a fresh decision log)
export const POST = withPolicy("operator", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const { scenario = "normal-weekday", seed } = await req.json().catch(() => ({}))
  const sim = resetSimulator(scenario, seed)
  resetDriver()
  return NextResponse.json(sim.getState())
})
