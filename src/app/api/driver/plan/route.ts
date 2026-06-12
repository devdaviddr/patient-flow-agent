import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// POST /api/driver/plan -> run the agent, return proposed gaps + interventions.
// Needs opencode serve (a model round-trip).
export async function POST() {
  try {
    const plan = await getDriver().plan()
    return NextResponse.json(plan)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "plan failed" },
      { status: 502 },
    )
  }
}
