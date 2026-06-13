import { describe, it, expect } from "vitest"
import { authGate } from "@/app/lib/auth-gate"

// Guards the blank-screen regression: with the optimistic edge middleware, a
// present-but-invalid session (logout, or a stale cookie) reaches the (app)
// layout authenticated === false. The gate must say "redirect", never leave the
// visitor on a rendered-null blank shell.
describe("authGate", () => {
  it("waits while the session is still resolving", () => {
    expect(authGate(false, false)).toBe("loading")
    expect(authGate(false, true)).toBe("loading")
  })

  it("renders the shell for a resolved, authenticated user", () => {
    expect(authGate(true, true)).toBe("render")
  })

  it("redirects a resolved-but-unauthenticated visitor (logout / stale cookie)", () => {
    expect(authGate(true, false)).toBe("redirect")
  })
})
