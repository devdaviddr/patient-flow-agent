import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/auth/auth"
import { withPolicy } from "@/auth/withPolicy"
import { isSameOrigin } from "@/auth/same-origin"

export const dynamic = "force-dynamic"

// Self-service change password (spec B6). Authenticated; the current password is
// required and re-verified server-side by Better Auth. Other sessions are revoked
// so a credential change logs out stale devices.

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export const POST = withPolicy("authenticated", async (req: NextRequest) => {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "currentPassword and an 8+ character newPassword are required" },
      { status: 400 },
    )
  }
  // changePassword verifies currentPassword and returns a non-2xx on mismatch; we
  // pass the response (and its refreshed cookie) straight through.
  return auth.api.changePassword({
    body: { ...parsed.data, revokeOtherSessions: true },
    headers: req.headers,
    asResponse: true,
  })
})
