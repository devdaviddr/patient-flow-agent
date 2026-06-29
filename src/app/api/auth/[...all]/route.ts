import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth/auth"
import { AuthError, getSessionUser, requireSuperadmin } from "@/auth/session"
import { policyFor } from "@/auth/policy"
import { recordAuthEvent, type AuthEventType } from "@/auth/audit"

// Better Auth's own endpoints (sign-in/out/session + the admin plugin). Sign-in/out
// are public (Better Auth applies its own CSRF + rate limiting); the admin-plugin
// subtree (/api/auth/admin/*) is INDEPENDENTLY gated to superadmin here (decision 7)
// so the plugin is never the sole authority — the same fail-closed stance withPolicy
// gives the standalone routes. policyFor is the single source of truth for the tier.

const handlers = toNextJsHandler(auth.handler)

// Audit a successful admin-plugin mutation (#28). The acting superadmin already
// passed the guard; we classify by the action segment and capture the target user.
async function auditAdminAction(req: NextRequest, bodyReq: NextRequest, res: Response): Promise<void> {
  const { pathname } = new URL(req.url)
  if (!pathname.startsWith("/api/auth/admin/") || !res.ok) return
  const action = pathname.split("/").pop() ?? "admin"
  const body = (await bodyReq.json().catch(() => ({}))) as { userId?: unknown; role?: unknown }
  const actor = await getSessionUser(req)
  const type: AuthEventType =
    action === "set-role" ? "role_change" : action === "remove-user" ? "account_deleted" : "admin_action"
  recordAuthEvent({
    type,
    actorId: actor?.id,
    actorName: actor?.name,
    targetId: typeof body.userId === "string" ? body.userId : null,
    detail: typeof body.role === "string" ? `${action} → ${body.role}` : action,
  })
}

async function guard(req: NextRequest): Promise<Response | null> {
  if (policyFor(new URL(req.url).pathname) !== "superadmin") return null
  try {
    await requireSuperadmin(req)
    return null
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return (await guard(req)) ?? handlers.GET(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  const blocked = await guard(req)
  if (blocked) return blocked
  // Clone before the handler consumes the body, so the audit can read it after.
  const bodyReq = req.clone() as NextRequest
  const res = await handlers.POST(req)
  await auditAdminAction(req, bodyReq, res)
  return res
}
