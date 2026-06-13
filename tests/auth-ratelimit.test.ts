// Rate-limited sign-in (spec A12). The limiter is in-memory and lives inside the
// betterAuth instance, which isn't cheaply introspectable; per the plan we assert
// the CONFIG wires it correctly: a stricter custom rule on the sign-in route, and
// the client IP sourced from CF-Connecting-IP (the real client IP behind the
// Cloudflare Tunnel, the only header that can be trusted for keying).
//
// This is a source-level invariant check (deterministic, no network), guarding the
// exact wiring the foundation verified against the live limiter.

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const AUTH_SRC = readFileSync(join(process.cwd(), "src", "auth", "auth.ts"), "utf8")

describe("sign-in rate limiting (A12)", () => {
  it("the rate limiter is enabled", () => {
    expect(AUTH_SRC).toMatch(/rateLimit\s*:\s*\{[\s\S]*enabled\s*:\s*true/)
  })

  it("a custom rule throttles the sign-in route specifically", () => {
    expect(AUTH_SRC).toMatch(/customRules[\s\S]*["']\/sign-in\/email["']/)
    // A bounded window + max — not the lax global default.
    expect(AUTH_SRC).toMatch(/window\s*:/)
    expect(AUTH_SRC).toMatch(/max\s*:/)
  })

  it("keys the limiter on the real client IP via CF-Connecting-IP", () => {
    expect(AUTH_SRC).toMatch(/ipAddressHeaders/)
    expect(AUTH_SRC.toLowerCase()).toContain("cf-connecting-ip")
  })
})
