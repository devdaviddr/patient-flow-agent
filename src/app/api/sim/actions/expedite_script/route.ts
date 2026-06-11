import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"

export const dynamic = "force-dynamic"

// POST /api/sim/actions/expedite_script -> clears a pharmacy_script blocker
// (emits a blocker_resolved event). No-op if the patient isn't so blocked.
export async function POST(req: Request) {
  const { patientId } = await req.json().catch(() => ({}))
  if (!patientId) {
    return NextResponse.json({ applied: false, note: "patientId is required" }, { status: 400 })
  }
  return NextResponse.json(getSimulator().resolveBlocker(patientId, "pharmacy_script"))
}
