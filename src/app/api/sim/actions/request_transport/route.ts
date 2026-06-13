import { NextResponse } from "next/server"
import { getSimulator } from "@/sim"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"

export const dynamic = "force-dynamic"

// POST /api/sim/actions/request_transport -> clears a transport blocker
// (emits a blocker_resolved event). No-op if the patient isn't so blocked.
export const POST = withPolicy("operator", async (req) => {
  const csrf = checkSameOrigin(req)
  if (csrf) return csrf
  const { patientId } = await req.json().catch(() => ({}))
  if (!patientId) {
    return NextResponse.json({ applied: false, note: "patientId is required" }, { status: 400 })
  }
  return NextResponse.json(getSimulator().resolveBlocker(patientId, "transport"))
})
