import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// POST /api/sim/actions/expedite_script -> STUB (real effect in Phase 2:
// emit a blocker_resolved SimEvent). Returns acknowledged-but-not-applied for now.
export async function POST(req: Request) {
  const { patientId } = await req.json().catch(() => ({}))
  return NextResponse.json({
    applied: false,
    patientId,
    note: "stub — action effect lands in Phase 2",
  })
}
