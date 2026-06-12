import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// POST /api/driver/reject {interventionId} -> record a rejection; no state change
export async function POST(req: Request) {
  const { interventionId } = await req.json().catch(() => ({}))
  if (!interventionId) {
    return NextResponse.json({ error: "interventionId required" }, { status: 400 })
  }
  getDriver().reject(interventionId)
  return NextResponse.json({ ok: true })
}
