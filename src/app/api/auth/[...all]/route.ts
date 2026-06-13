import { toNextJsHandler } from "better-auth/next-js"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth/auth"
import { AuthError, requireSuperadmin } from "@/auth/session"
import { policyFor } from "@/auth/policy"

// Better Auth's own endpoints (sign-in/out/session + the admin plugin). Sign-in/out
// are public (Better Auth applies its own CSRF + rate limiting); the admin-plugin
// subtree (/api/auth/admin/*) is INDEPENDENTLY gated to superadmin here (decision 7)
// so the plugin is never the sole authority — the same fail-closed stance withPolicy
// gives the standalone routes. policyFor is the single source of truth for the tier.

const handlers = toNextJsHandler(auth.handler)

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
  return (await guard(req)) ?? handlers.POST(req)
}
