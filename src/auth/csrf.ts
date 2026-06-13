// Same-origin CSRF check for the hand-written mutating routes (spec decision 8).
// Better Auth's own endpoints carry their CSRF token; SameSite=Lax + this check
// cover the custom mutating routes (sim/actions/*, sim/step, sim/scenario,
// eval/run). We verify the request's Origin (falling back to Referer) resolves to
// the same origin as BETTER_AUTH_URL — the app's public HTTPS origin behind the
// tunnel. A cross-origin or malformed value is refused 403; a missing header is
// treated as same-origin (non-browser callers / same-origin fetch may omit it).

import { NextResponse } from "next/server"

// Parse an origin (scheme://host[:port]) from a header value that may be either a
// bare origin (Origin header) or a full URL (Referer header). Returns null when
// the value is absent or not a valid absolute URL.
function originOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

// The configured public origin. Read lazily (not at module load) so importing
// this helper never throws before env is set; the value is validated per request.
function expectedOrigin(): string | null {
  return originOf(process.env.BETTER_AUTH_URL ?? null)
}

// Verify the request originates from the app's own origin. Returns a 403 Response
// to short-circuit the handler on a cross-origin request, or null when the request
// is acceptably same-origin (matching Origin/Referer, or neither header present).
export function checkSameOrigin(req: Request): NextResponse | null {
  const expected = expectedOrigin()
  if (!expected) {
    // Fail loud rather than silently skipping the check when misconfigured.
    return NextResponse.json(
      { error: "Server misconfigured: BETTER_AUTH_URL is not set" },
      { status: 500 },
    )
  }

  const origin = originOf(req.headers.get("origin"))
  const referer = originOf(req.headers.get("referer"))

  // A present Origin/Referer must match; if both are absent we allow it (a same-
  // origin fetch or a non-browser caller may omit them — SameSite still applies).
  if (origin === null && referer === null) return null
  if (origin === expected || referer === expected) return null

  return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 })
}
