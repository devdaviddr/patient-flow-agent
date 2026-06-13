// Same-origin guard for the hand-written mutating routes (spec decision 8). The
// session cookie is SameSite=Lax, but we also reject a cross-site form post before
// it mutates state. Compares the request's Origin (falling back to Referer) against
// the request's own origin; a missing Origin and Referer is treated as same-origin
// (a same-origin fetch or non-browser caller may omit them — SameSite still applies).

import type { NextRequest } from "next/server"

export function isSameOrigin(req: NextRequest): boolean {
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
  return true
}
