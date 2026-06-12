import { NextResponse } from "next/server"
import { resetSimulator } from "@/sim"
import { resetDriver } from "@/driver"

export const dynamic = "force-dynamic"

// POST /api/sim/scenario -> reset to a fresh world (and a fresh decision log)
export async function POST(req: Request) {
  const { scenario = "normal-weekday", seed } = await req.json().catch(() => ({}))
  const sim = resetSimulator(scenario, seed)
  resetDriver()
  return NextResponse.json(sim.getState())
}
