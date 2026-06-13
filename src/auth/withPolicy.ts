// HOF that wraps a Next.js route handler so the authorization guard runs first
// and CANNOT be omitted (spec A13). Every app/api/**/route.ts exports its handler
// via withPolicy(tier, handler); the wrapped guard is the sole authoritative check.
//
// The wrapped handler receives the validated SessionUser as a third argument for
// the `authenticated`/`operator` tiers (null for `public`), so e.g. the approve/
// reject routes can attribute the DecisionRecord without re-validating.

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AuthError, requireAuth, requireOperator, type SessionUser } from "./session"
import type { PolicyTier } from "./policy"

// The Next App Router passes a context object ({ params }) as the second arg.
// We keep it opaque and forward it untouched.
export type RouteContext = { params: Promise<Record<string, string | string[]>> }

export type GuardedHandler = (
  req: NextRequest,
  ctx: RouteContext,
  user: SessionUser | null,
) => Promise<Response> | Response

export type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>

// Run the tier's guard, then the handler with the resolved user. AuthError →
// 401/403; the public tier skips the guard and passes a null user.
export function withPolicy(tier: PolicyTier, handler: GuardedHandler): RouteHandler {
  return async (req, ctx) => {
    let user: SessionUser | null = null
    try {
      if (tier === "operator") {
        user = await requireOperator(req)
      } else if (tier === "authenticated") {
        user = await requireAuth(req)
      }
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }
    return handler(req, ctx, user)
  }
}
