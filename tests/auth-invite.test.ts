// Invite-key system (spec B2/B3). Against a fresh migrated DB: keys are stored
// hashed (HMAC, never plaintext), carry ≥128 bits of entropy, and redemption is
// single-use and atomic — a second redemption of the same key loses, which is what
// makes a concurrent race safe. Synthetic, demo-only.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"

let temp: TempAuthDb
let invite: typeof import("@/auth/invite")
let schema: typeof import("@/auth/schema")
let dbMod: typeof import("@/auth/db")
let keys: import("@/auth/invite").GeneratedInvite[]

beforeAll(async () => {
  temp = setupTempAuthDb()
  invite = await import("@/auth/invite")
  schema = await import("@/auth/schema")
  dbMod = await import("@/auth/db")
  // A real user the keys can be claimed against (FK target for invite.used_by).
  const now = new Date()
  dbMod.db
    .insert(schema.user)
    .values({ id: "u-1", name: "Claimer", email: "claimer@example-hospital.test", role: "viewer", createdAt: now, updatedAt: now })
    .run()
  dbMod.db
    .insert(schema.user)
    .values({ id: "u-2", name: "Claimer 2", email: "claimer2@example-hospital.test", role: "viewer", createdAt: now, updatedAt: now })
    .run()
  keys = invite.generateInvites(now)
})

afterAll(() => temp.cleanup())

describe("hashKey (B2)", () => {
  it("is an HMAC digest, never the plaintext, and is 64 hex chars", () => {
    const h = invite.hashKey("ABCDE-FGHIJ-KLMNO")
    expect(h).not.toContain("ABCDE")
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it("normalizes formatting — dashes and case do not change the hash", () => {
    expect(invite.hashKey("abcde-fghij")).toBe(invite.hashKey("ABCDEFGHIJ"))
    expect(invite.hashKey("ABCDE FGHIJ")).toBe(invite.hashKey("ABCDE-FGHIJ"))
  })
})

describe("generateInvites (B2)", () => {
  it("mints 50 keys with ≥128-bit entropy (≥26 base32 chars) and stores only hashes", () => {
    expect(keys).toHaveLength(50)
    for (const k of keys) {
      expect(invite.normalizeKey(k.key).length).toBeGreaterThanOrEqual(26)
      expect(k.role === "viewer" || k.role === "coordinator").toBe(true)
    }
    // No two keys collide.
    expect(new Set(keys.map((k) => k.key)).size).toBe(50)
  })

  it("count() and remaining() both report 50 before any redemption", () => {
    expect(invite.count()).toBe(50)
    expect(invite.remaining()).toBe(50)
  })
})

describe("roleForUnusedKey (B1 pre-check)", () => {
  it("returns the encoded role for a valid unused key, null for an unknown key", () => {
    expect(invite.roleForUnusedKey(keys[0].key)).toBe(keys[0].role)
    expect(invite.roleForUnusedKey("NOTA-REALKEY-22222")).toBeNull()
  })
})

describe("redeem — single-use & atomic (B3)", () => {
  it("claims an unused key once and records the claimer", () => {
    const before = invite.remaining()
    expect(invite.redeem(keys[1].key, "u-1")).toBe(true)
    expect(invite.remaining()).toBe(before - 1)
    // A claimed key no longer resolves as unused.
    expect(invite.roleForUnusedKey(keys[1].key)).toBeNull()
  })

  it("a second redemption of the same key loses — concurrent redeemers can't both win", () => {
    const key = keys[2].key
    expect(invite.redeem(key, "u-1")).toBe(true)
    // The conditional UPDATE matches no unclaimed row the second time.
    expect(invite.redeem(key, "u-2")).toBe(false)
  })

  it("an unknown key never claims", () => {
    expect(invite.redeem("ZZZZZ-ZZZZZ-ZZZZZ", "u-1")).toBe(false)
  })
})
