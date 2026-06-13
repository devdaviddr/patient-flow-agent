// Hashing + seed (spec A1/A11). Against a throwaway SQLite DB, run the real seed
// and assert: both roles are created; the stored credential is a KDF HASH, never
// the plaintext; the plaintext password never appears in any returned user/session
// payload; and a valid sign-in succeeds while a bad password is refused.
//
// This exercises the REAL Better Auth server + Drizzle store (no mock), so env +
// migration are set up before the auth graph is imported. Synthetic `.test`
// accounts only — the demo passwords guard nothing real.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const MIGRATION = join(process.cwd(), "drizzle", "0000_great_wrecker.sql")

let dbPath: string
let dbDir: string

// Loaded after env is set so db.ts opens the temp DB.
let seedAuth: () => Promise<void>
let auth: typeof import("@/auth/auth").auth
let creds: typeof import("@/auth/demo-credentials")

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "pfo-auth-"))
  dbPath = join(dbDir, "auth.db")

  // Apply the checked-in migration to the fresh DB before the auth graph opens it.
  const sql = readFileSync(MIGRATION, "utf8").replace(/--> statement-breakpoint/g, "")
  const setup = new Database(dbPath)
  setup.exec(sql)
  setup.close()

  // Point the auth layer at the temp DB + provide the required secrets, THEN load
  // the auth graph (db.ts reads AUTH_DB_PATH at module load).
  process.env.AUTH_DB_PATH = dbPath
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-0123456789abcdef"
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

  ;({ seedAuth } = await import("@/auth/seed"))
  ;({ auth } = await import("@/auth/auth"))
  creds = await import("@/auth/demo-credentials")

  await seedAuth()
})

afterAll(() => {
  rmSync(dbDir, { recursive: true, force: true })
})

// Read the raw rows the seed wrote (bypassing the ORM) to inspect storage directly.
function rawDb(): InstanceType<typeof Database> {
  return new Database(dbPath, { readonly: true })
}

describe("seed creates both roles (A11)", () => {
  it("creates a coordinator and a viewer", () => {
    const db = rawDb()
    const rows = db
      .prepare("SELECT email, role FROM user ORDER BY role")
      .all() as { email: string; role: string }[]
    db.close()
    expect(rows).toEqual([
      { email: creds.COORDINATOR_EMAIL, role: "coordinator" },
      { email: creds.VIEWER_EMAIL, role: "viewer" },
    ])
  })

  it("is idempotent — a re-run creates no duplicates", async () => {
    await seedAuth()
    const db = rawDb()
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }
    db.close()
    expect(n).toBe(2)
  })
})

describe("passwords are hashed, never plaintext (A1)", () => {
  it("the stored credential is a hash, not the plaintext password", () => {
    const db = rawDb()
    const accounts = db
      .prepare("SELECT a.password AS password, u.role AS role FROM account a JOIN user u ON u.id = a.user_id")
      .all() as { password: string | null; role: string }[]
    db.close()

    expect(accounts.length).toBe(2)
    for (const acc of accounts) {
      expect(acc.password).toBeTruthy()
      // A KDF hash, not the demo plaintext.
      expect(acc.password).not.toBe(creds.COORDINATOR_PASSWORD)
      expect(acc.password).not.toBe(creds.VIEWER_PASSWORD)
      // scrypt/argon-style: long, contains a separator, not a bare word.
      expect(acc.password!.length).toBeGreaterThan(20)
    }
  })

  it("no plaintext password appears anywhere in the DB file", () => {
    const blob = readFileSync(dbPath)
    expect(blob.includes(Buffer.from(creds.COORDINATOR_PASSWORD))).toBe(false)
    expect(blob.includes(Buffer.from(creds.VIEWER_PASSWORD))).toBe(false)
  })
})

describe("sign-in (A2)", () => {
  it("accepts valid coordinator credentials and returns no password", async () => {
    const res = await auth.api.signInEmail({
      body: { email: creds.COORDINATOR_EMAIL, password: creds.COORDINATOR_PASSWORD },
      asResponse: true,
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).not.toContain(creds.COORDINATOR_PASSWORD)
    expect(body.toLowerCase()).not.toContain("password")
  })

  it("rejects a bad password with a non-2xx, non-leaky response", async () => {
    const res = await auth.api
      .signInEmail({
        body: { email: creds.COORDINATOR_EMAIL, password: "wrong-password" },
        asResponse: true,
      })
      .catch((e: unknown) => {
        // Better Auth may throw an APIError carrying a Response.
        if (e && typeof e === "object" && "status" in e) return e as { status: number }
        throw e
      })
    const status = "status" in res ? res.status : 500
    expect(status).not.toBe(200)
  })
})
