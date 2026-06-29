// Auth audit trail (#28) — records security-relevant identity events and returns
// them newest-first for the admin view. Runs against a fresh temp DB.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"

let temp: TempAuthDb
let audit: typeof import("@/auth/audit")

beforeAll(async () => {
  temp = setupTempAuthDb()
  audit = await import("@/auth/audit")
})
afterAll(() => temp.cleanup())

describe("auth audit (#28)", () => {
  it("records events and returns them newest-first with actor + detail", () => {
    audit.recordAuthEvent({ type: "sign_in", actorId: "u1", actorName: "Dr A" })
    audit.recordAuthEvent({
      type: "role_change",
      actorId: "s1",
      actorName: "S. Admin",
      targetId: "u1",
      detail: "set-role → viewer",
    })
    const events = audit.recentAuthEvents(10)
    expect(events[0].type).toBe("role_change")
    expect(events[0].actorName).toBe("S. Admin")
    expect(events[0].detail).toContain("viewer")
    expect(events.map((e) => e.type)).toContain("sign_in")
  })

  it("respects the limit", () => {
    for (let i = 0; i < 5; i++) audit.recordAuthEvent({ type: "sign_in", actorId: `u${i}` })
    expect(audit.recentAuthEvents(3)).toHaveLength(3)
  })
})
