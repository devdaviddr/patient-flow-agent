// App-level per-IP fixed-window rate limiter for the hand-written routes. Better
// Auth's own limiter only governs its /api/auth/* endpoints, so the custom routes —
// invite-gated sign-up and the LLM-touching driver routes — need their own guard.
//
// Single-instance only: the counters live in-process, which matches the single
// self-hosted deployment behind the Cloudflare Tunnel. Keyed on the real client IP
// (CF-Connecting-IP, the same trust basis as the sign-in limiter), falling back to a
// shared bucket when the header is absent. This is the auth layer — wall-clock time
// here never touches the seeded simulator, so determinism (S12) is unaffected.

import { NextResponse } from "next/server"

const CLIENT_IP_HEADER = "cf-connecting-ip"

export interface RateLimitRule {
  windowSeconds: number
  max: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function clientIp(req: Request): string {
  return req.headers.get(CLIENT_IP_HEADER) ?? "unknown"
}

// Returns a 429 Response if the caller has exceeded `rule`, else null (allowed).
// `name` namespaces the bucket so distinct routes never share a counter.
export function checkRateLimit(req: Request, name: string, rule: RateLimitRule): NextResponse | null {
  const key = `${name}:${clientIp(req)}`
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 })
    return null
  }
  if (bucket.count >= rule.max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    )
  }
  bucket.count += 1
  return null
}

// Test seam: drop all counters so cases don't bleed into each other.
export function resetRateLimits(): void {
  buckets.clear()
}
