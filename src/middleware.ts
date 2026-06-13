// Default-deny edge guard (spec A4/A13). Covers every (app) page + /api/* route
// with a public allow-list (/login, /api/auth/*). This is an OPTIMISTIC check
// only — it inspects the session cookie's presence, not its cryptographic/DB
// validity (the Edge runtime can't run better-sqlite3). The authoritative check
// is the per-route withPolicy guard (Node runtime).

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Routes reachable without a session.
const PUBLIC_PAGES = ["/login"]

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true
  return PUBLIC_PAGES.includes(pathname)
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const hasSession = getSessionCookie(req) !== null
  if (hasSession) return NextResponse.next()

  // No session: APIs get 401; pages redirect to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const loginUrl = new URL("/login", req.url)
  return NextResponse.redirect(loginUrl)
}

// Match every (app) page + /api/* route. Excludes Next internals and static
// assets so only real app surface is guarded.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
}
