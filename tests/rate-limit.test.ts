// App-level per-IP rate limiter (#29, #47) — the guard for the hand-written routes
// that Better Auth's own limiter doesn't cover. Deterministic via fake timers.

import { afterEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, resetRateLimits } from "@/auth/rate-limit"

const req = (ip = "1.2.3.4"): Request =>
  new Request("http://localhost/api/x", { headers: { "cf-connecting-ip": ip } })

afterEach(() => {
  resetRateLimits()
  vi.useRealTimers()
})

describe("checkRateLimit", () => {
  it("allows up to `max` calls, then 429s", () => {
    const rule = { windowSeconds: 60, max: 3 }
    expect(checkRateLimit(req(), "t", rule)).toBeNull()
    expect(checkRateLimit(req(), "t", rule)).toBeNull()
    expect(checkRateLimit(req(), "t", rule)).toBeNull()
    const blocked = checkRateLimit(req(), "t", rule)
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get("retry-after")).toBeTruthy()
  })

  it("keys per IP — a different client has its own bucket", () => {
    const rule = { windowSeconds: 60, max: 1 }
    expect(checkRateLimit(req("1.1.1.1"), "t", rule)).toBeNull()
    expect(checkRateLimit(req("1.1.1.1"), "t", rule)?.status).toBe(429)
    expect(checkRateLimit(req("2.2.2.2"), "t", rule)).toBeNull()
  })

  it("namespaces by name — distinct routes don't share a counter", () => {
    const rule = { windowSeconds: 60, max: 1 }
    expect(checkRateLimit(req(), "a", rule)).toBeNull()
    expect(checkRateLimit(req(), "b", rule)).toBeNull()
  })

  it("resets after the window elapses", () => {
    vi.useFakeTimers()
    const rule = { windowSeconds: 1, max: 1 }
    expect(checkRateLimit(req(), "t", rule)).toBeNull()
    expect(checkRateLimit(req(), "t", rule)?.status).toBe(429)
    vi.advanceTimersByTime(1100)
    expect(checkRateLimit(req(), "t", rule)).toBeNull()
  })

  it("missing client IP falls back to a shared bucket (still bounded)", () => {
    const rule = { windowSeconds: 60, max: 1 }
    const noIp = (): Request => new Request("http://localhost/api/x")
    expect(checkRateLimit(noIp(), "t", rule)).toBeNull()
    expect(checkRateLimit(noIp(), "t", rule)?.status).toBe(429)
  })
})
