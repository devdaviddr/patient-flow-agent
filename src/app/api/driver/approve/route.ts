import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"
import type { SessionUser } from "@/auth/session"

export const dynamic = "force-dynamic"

// Same-origin CSRF guard for the hand-written mutating routes (spec §2.7): the
// session cookie is SameSite=Lax, but we also verify Origin/Referer against the
// app's own origin so a cross-site form post is rejected before it mutates state.
function isSameOrigin(req: NextRequest): boolean {
  const expected = new URL(req.url).origin
  const origin = req.headers.get("origin")
  if (origin) return origin === expected
  const referer = req.headers.get("referer")
  if (referer) {
    try {
      return new URL(referer).origin === expected
    } catch {
      return false
    }
  }
  // No Origin and no Referer: not a browser cross-site form post.
  return true
}

// POST /api/driver/approve {interventionId} -> execute that action via the simulator.
// Operator-only (R7); the approving coordinator is attributed onto the DecisionRecord.
export const POST = withPolicy(
  "operator",
  async (req: NextRequest, _ctx, user: SessionUser | null) => {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
    }
    const { interventionId } = await req.json().catch(() => ({}))
    if (!interventionId) {
      return NextResponse.json({ error: "interventionId required" }, { status: 400 })
    }
    // user is non-null here: the operator guard has already validated the session.
    const actor = user ? { id: user.id, name: user.name, role: user.role } : undefined
    return NextResponse.json(getDriver().approve(interventionId, actor))
  },
)
