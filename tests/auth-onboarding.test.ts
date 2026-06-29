// Onboarding + self-service lifecycle end-to-end (spec B1/B3/B6), against the real
// Better Auth server + a fresh migrated DB. Drives the actual route handlers:
// invite-gated /api/register, /api/account/password, and DELETE /api/account.
// Synthetic `.test` accounts only — no real PII (S13).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"
import { resetRateLimits } from "@/auth/rate-limit"

let temp: TempAuthDb
let db: typeof import("@/auth/db").db
let user: typeof import("@/auth/schema").user
let invite: typeof import("@/auth/invite")
let registerRoute: typeof import("@/app/api/register/route")
let passwordRoute: typeof import("@/app/api/account/password/route")
let accountRoute: typeof import("@/app/api/account/route")
let keys: import("@/auth/invite").GeneratedInvite[]

beforeAll(async () => {
  temp = setupTempAuthDb()
  ;({ db } = await import("@/auth/db"))
  ;({ user } = await import("@/auth/schema"))
  invite = await import("@/auth/invite")
  registerRoute = await import("@/app/api/register/route")
  passwordRoute = await import("@/app/api/account/password/route")
  accountRoute = await import("@/app/api/account/route")
  keys = invite.generateInvites(new Date())
})

// The register route is now per-IP rate-limited (#29); these tests fire many
// header-less registrations that share the "unknown" bucket, so reset between tests.
beforeEach(() => resetRateLimits())

afterAll(() => temp.cleanup())

const asReq = (init: { method: string; body?: unknown; cookie?: string }): NextRequest =>
  new Request("http://localhost/api/x", {
    method: init.method,
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }) as unknown as NextRequest

// The App Router passes a context ({ params }) as the second arg; these routes
// ignore it, but withPolicy-wrapped handlers are typed to receive it.
const ctx = { params: Promise.resolve({}) }

const sessionCookie = (res: Response): string => {
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) throw new Error("expected a Set-Cookie on the response")
  return setCookie.split(";")[0]
}

const userByEmail = (email: string) =>
  db.select().from(user).where(eq(user.email, email)).get()

const register = (body: Record<string, unknown>) => registerRoute.POST(asReq({ method: "POST", body }))

describe("invite-gated sign-up (B1, B3)", () => {
  it("creates an account with the key's role and signs the new user in", async () => {
    const k = keys[0]
    const before = invite.remaining()
    const res = await register({ inviteKey: k.key, email: "new1@example-hospital.test", password: "password123" })
    expect(res.status).toBe(200)
    expect(sessionCookie(res)).toBeTruthy()

    const u = userByEmail("new1@example-hospital.test")
    expect(u?.role).toBe(k.role)
    expect(invite.remaining()).toBe(before - 1)
  })

  it("rejects a used key and creates no account (single-use)", async () => {
    const k = keys[1]
    await register({ inviteKey: k.key, email: "used-a@example-hospital.test", password: "password123" })
    const res = await register({ inviteKey: k.key, email: "used-b@example-hospital.test", password: "password123" })
    expect(res.status).not.toBe(200)
    expect(userByEmail("used-b@example-hospital.test")).toBeUndefined()
  })

  it("rejects a duplicate email", async () => {
    await register({ inviteKey: keys[2].key, email: "dupe@example-hospital.test", password: "password123" })
    const res = await register({ inviteKey: keys[3].key, email: "dupe@example-hospital.test", password: "password123" })
    expect(res.status).not.toBe(200)
    // The second key is NOT consumed when the email collides.
    expect(invite.roleForUnusedKey(keys[3].key)).toBe(keys[3].role)
  })

  it("rejects an invalid key", async () => {
    const res = await register({ inviteKey: "NOTA-REAL-KEY99", email: "bad@example-hospital.test", password: "password123" })
    expect(res.status).not.toBe(200)
    expect(userByEmail("bad@example-hospital.test")).toBeUndefined()
  })
})

describe("self-service change password (B6)", () => {
  it("requires the correct current password, then accepts the change", async () => {
    const reg = await register({ inviteKey: keys[4].key, email: "pw@example-hospital.test", password: "password123" })
    const cookie = sessionCookie(reg)

    const wrong = await passwordRoute.POST(
      asReq({ method: "POST", cookie, body: { currentPassword: "WRONG-pass", newPassword: "newpassword456" } }),
      ctx,
    )
    expect(wrong.status).not.toBe(200)

    const ok = await passwordRoute.POST(
      asReq({ method: "POST", cookie, body: { currentPassword: "password123", newPassword: "newpassword456" } }),
      ctx,
    )
    expect(ok.status).toBe(200)
  })
})

describe("self-service delete account (B6) + last-superadmin guard (B5)", () => {
  it("deletes the caller's own account", async () => {
    const reg = await register({ inviteKey: keys[5].key, email: "del@example-hospital.test", password: "password123" })
    const cookie = sessionCookie(reg)

    const res = await accountRoute.DELETE(asReq({ method: "DELETE", cookie }), ctx)
    expect(res.status).toBe(200)
    expect(userByEmail("del@example-hospital.test")).toBeUndefined()
  })

  it("refuses to delete the last superadmin (409)", async () => {
    const reg = await register({ inviteKey: keys[6].key, email: "lone-admin@example-hospital.test", password: "password123" })
    const cookie = sessionCookie(reg)
    // Promote to the only superadmin, then try to self-delete.
    db.update(user).set({ role: "superadmin" }).where(eq(user.email, "lone-admin@example-hospital.test")).run()

    const res = await accountRoute.DELETE(asReq({ method: "DELETE", cookie }), ctx)
    expect(res.status).toBe(409)
    expect(userByEmail("lone-admin@example-hospital.test")).toBeDefined()
  })
})
