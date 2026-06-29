import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth/auth"
import { withPolicy } from "@/auth/withPolicy"
import type { SessionUser } from "@/auth/session"
import { checkSameOrigin } from "@/auth/csrf"
import { isLastSuperadminError, isOnlySuperadmin } from "@/auth/superadmin"
import { recordAuthEvent } from "@/auth/audit"

export const dynamic = "force-dynamic"

// Self-service delete-own-account (spec B6). Authenticated; deletes the caller's
// user (sessions + accounts cascade via FK). Prior DecisionRecords survive — the
// 0.4.0 actor is a denormalized snapshot, not an FK. The last-superadmin invariant
// (B5) blocks a lone superadmin from self-deleting the system into lockout: a
// pre-check returns a friendly 409, and the DB trigger is the authoritative backstop.

export const DELETE = withPolicy(
  "authenticated",
  async (req: NextRequest, _ctx, user: SessionUser | null) => {
    const csrf = checkSameOrigin(req)
    if (csrf) return csrf
    // user is non-null here (the authenticated guard ran); narrow defensively.
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    if (isOnlySuperadmin(user.id)) {
      return NextResponse.json(
        { error: "The last superadmin account cannot be deleted." },
        { status: 409 },
      )
    }

    const ctx = await auth.$context
    try {
      await ctx.internalAdapter.deleteUser(user.id)
      recordAuthEvent({
        type: "account_deleted",
        actorId: user.id,
        actorName: user.name,
        targetId: user.id,
        detail: "self-service delete",
      })
    } catch (err) {
      if (isLastSuperadminError(err)) {
        return NextResponse.json(
          { error: "The last superadmin account cannot be deleted." },
          { status: 409 },
        )
      }
      throw err
    }
    return NextResponse.json({ ok: true })
  },
)
