import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// POST /api/driver/approve {interventionId} -> execute that action via the simulator
export async function POST(req: Request) {
  const { interventionId } = await req.json().catch(() => ({}))
  if (!interventionId) {
    return NextResponse.json({ error: "interventionId required" }, { status: 400 })
  }
  return NextResponse.json(getDriver().approve(interventionId))
}
