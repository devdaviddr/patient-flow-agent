import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/sim/state -> current WorldState
export const GET = withPolicy("authenticated", () => {
  return NextResponse.json(getSimulator().getState())
})
