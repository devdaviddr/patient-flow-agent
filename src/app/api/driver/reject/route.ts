import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"
import { checkSameOrigin } from "@/auth/csrf"
import type { SessionUser } from "@/auth/session"

export const dynamic = "force-dynamic"

// POST /api/driver/reject {interventionId} -> record a rejection; no state change.
// Operator-only (R7); the rejecting coordinator is attributed onto the DecisionRecord.
export const POST = withPolicy(
  "operator",
  async (req: NextRequest, _ctx, user: SessionUser | null) => {
    const csrf = checkSameOrigin(req)
    if (csrf) return csrf
    const { interventionId } = await req.json().catch(() => ({}))
    if (!interventionId) {
      return NextResponse.json({ error: "interventionId required" }, { status: 400 })
    }
    // user is non-null here: the operator guard has already validated the session.
    const actor = user ? { id: user.id, name: user.name, role: user.role } : undefined
    getDriver().reject(interventionId, actor)
    return NextResponse.json({ ok: true })
  },
)
