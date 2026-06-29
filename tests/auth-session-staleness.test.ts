// #27 — a server-side role change takes effect on the NEXT request. getSessionUser
// re-reads the role from the DB on every call (no cookie cache is configured), so a
// demoted coordinator immediately loses operator capability without re-logging-in.
// This closes the "stale role on a live session" concern: it does NOT exist.
//
// Runs against the real Better Auth server + a fresh migrated DB. Synthetic `.test`
// accounts only — no real PII (S13).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"

let temp: TempAuthDb
let db: typeof import("@/auth/db").db
let user: typeof import("@/auth/schema").user
let invite: typeof import("@/auth/invite")
let registerRoute: typeof import("@/app/api/register/route")
let session: typeof import("@/auth/session")
let keys: import("@/auth/invite").GeneratedInvite[]

beforeAll(async () => {
  temp = setupTempAuthDb()
  ;({ db } = await import("@/auth/db"))
  ;({ user } = await import("@/auth/schema"))
  invite = await import("@/auth/invite")
  registerRoute = await import("@/app/api/register/route")
  session = await import("@/auth/session")
  keys = invite.generateInvites(new Date())
})

afterAll(() => temp.cleanup())

const EMAIL = "demote-me@example-hospital.test"

// A request carrying the session cookie. The pathname is irrelevant to the role
// guards (they don't path-check); we reuse an operator route for realism.
const withCookie = (cookie: string): NextRequest =>
  new Request("http://localhost/api/driver/approve", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
  }) as unknown as NextRequest

const cookieFrom = (res: Response): string => {
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) throw new Error("expected a Set-Cookie on the response")
  return setCookie.split(";")[0]
}

describe("role change invalidates operator capability on the next request (#27)", () => {
  let cookie: string

  it("a fresh coordinator session has operator capability", async () => {
    const coordKey = keys.find((k) => k.role === "coordinator")!
    const res = await registerRoute.POST(
      new Request("http://localhost/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteKey: coordKey.key, email: EMAIL, password: "password123" }),
      }) as unknown as NextRequest,
    )
    expect(res.status).toBe(200)
    cookie = cookieFrom(res)

    expect((await session.getSessionUser(withCookie(cookie)))?.role).toBe("coordinator")
    await expect(session.requireOperator(withCookie(cookie))).resolves.toMatchObject({
      role: "coordinator",
    })
  })

  it("after a server-side demotion, the SAME session is refused operator (403) next request", async () => {
    // Demote directly in the DB — no logout, no new cookie.
    db.update(user).set({ role: "viewer" }).where(eq(user.email, EMAIL)).run()

    // The guard re-reads the role from the DB → sees viewer immediately.
    expect((await session.getSessionUser(withCookie(cookie)))?.role).toBe("viewer")
    await expect(session.requireOperator(withCookie(cookie))).rejects.toMatchObject({ status: 403 })
  })
})
