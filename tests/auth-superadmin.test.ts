// Last-superadmin invariant (spec B5, decision 5). The authoritative guard is the
// pair of SQLite triggers from migration 0001: the DB aborts any DELETE/role-demote
// that would remove the final superadmin, on every path. These tests drive the DB
// directly to prove the engine — not application code — enforces it. Synthetic only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"

let temp: TempAuthDb
let db: typeof import("@/auth/db").db
let user: typeof import("@/auth/schema").user
let superadmin: typeof import("@/auth/superadmin")

beforeEach(async () => {
  // Reset the module registry so db.ts re-opens THIS test's fresh temp DB (it caches
  // its connection at import time). The triggers under test also make truncating a
  // shared DB impossible, so a brand-new DB per test is the clean isolation.
  vi.resetModules()
  temp = setupTempAuthDb()
  ;({ db } = await import("@/auth/db"))
  ;({ user } = await import("@/auth/schema"))
  superadmin = await import("@/auth/superadmin")
})

afterEach(() => temp.cleanup())

function addUser(id: string, role: "viewer" | "coordinator" | "superadmin"): void {
  const now = new Date()
  db.insert(user)
    .values({ id, name: id, email: `${id}@example-hospital.test`, role, createdAt: now, updatedAt: now })
    .run()
}

const del = (id: string) => db.delete(user).where(eq(user.id, id)).run()
const setRole = (id: string, role: "viewer" | "coordinator" | "superadmin") =>
  db.update(user).set({ role }).where(eq(user.id, id)).run()
const ban = (id: string) => db.update(user).set({ banned: true }).where(eq(user.id, id)).run()
const superadminCount = () => superadmin.countSuperadmins()

describe("delete guard", () => {
  it("allows deleting a superadmin while another remains", () => {
    addUser("s1", "superadmin")
    addUser("s2", "superadmin")
    expect(() => del("s1")).not.toThrow()
    expect(superadminCount()).toBe(1)
  })

  it("aborts deleting the last superadmin", () => {
    addUser("s1", "superadmin")
    expect(() => del("s1")).toThrow(/superadmin/i)
    expect(superadminCount()).toBe(1)
  })
})

describe("demote guard", () => {
  it("allows demoting a superadmin while another remains", () => {
    addUser("s1", "superadmin")
    addUser("s2", "superadmin")
    expect(() => setRole("s1", "coordinator")).not.toThrow()
    expect(superadminCount()).toBe(1)
  })

  it("aborts demoting the last superadmin", () => {
    addUser("s1", "superadmin")
    expect(() => setRole("s1", "viewer")).toThrow(/superadmin/i)
    expect(superadminCount()).toBe(1)
  })
})

describe("ban guard (#46)", () => {
  it("allows banning a superadmin while another active one remains", () => {
    addUser("s1", "superadmin")
    addUser("s2", "superadmin")
    expect(() => ban("s1")).not.toThrow()
  })

  it("aborts banning the last active superadmin (ban != delete/demote)", () => {
    addUser("s1", "superadmin")
    expect(() => ban("s1")).toThrow(/superadmin/i)
  })

  it("counts only active superadmins — can't ban down to zero in turn", () => {
    addUser("s1", "superadmin")
    addUser("s2", "superadmin")
    ban("s1") // succeeds — s2 still active
    expect(() => ban("s2")).toThrow(/superadmin/i) // s2 is now the last active one
  })
})

describe("isOnlySuperadmin (defence-in-depth pre-check)", () => {
  it("is true for the sole superadmin, false once a second exists", () => {
    addUser("s1", "superadmin")
    expect(superadmin.isOnlySuperadmin("s1")).toBe(true)
    addUser("s2", "superadmin")
    expect(superadmin.isOnlySuperadmin("s1")).toBe(false)
  })

  it("is false for a non-superadmin", () => {
    addUser("c1", "coordinator")
    expect(superadmin.isOnlySuperadmin("c1")).toBe(false)
  })
})

describe("no lockout under serialized deletes (B5)", () => {
  it("deleting both superadmins in turn leaves at least one standing", () => {
    addUser("s1", "superadmin")
    addUser("s2", "superadmin")
    del("s1") // succeeds
    expect(() => del("s2")).toThrow(/superadmin/i) // last one is protected
    expect(superadminCount()).toBeGreaterThanOrEqual(1)
  })
})
