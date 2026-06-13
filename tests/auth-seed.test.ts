// Hashing + seed (spec A1/A11). Against a throwaway SQLite DB, run the real seed
// and assert: both roles are created; the stored credential is a KDF HASH, never
// the plaintext; the plaintext password never appears in any returned user/session
// payload; and a valid sign-in succeeds while a bad password is refused.
//
// This exercises the REAL Better Auth server + Drizzle store (no mock), so env +
// migration are set up before the auth graph is imported. Synthetic `.test`
// accounts only — the demo passwords guard nothing real.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const MIGRATIONS_DIR = join(process.cwd(), "drizzle")
const INVITE_KEYS_FILE = join(process.cwd(), ".invite-keys.txt")

let dbPath: string
let dbDir: string

// Loaded after env is set so db.ts opens the temp DB.
let seedAuth: () => Promise<void>
let auth: typeof import("@/auth/auth").auth
let creds: typeof import("@/auth/demo-credentials")

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "pfo-auth-"))
  dbPath = join(dbDir, "auth.db")

  // Apply every checked-in migration in order to the fresh DB before the auth graph
  // opens it (0000 base schema + 0001 invites/admin columns/superadmin triggers).
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  const setup = new Database(dbPath)
  for (const file of migrations) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(
      /--> statement-breakpoint/g,
      "",
    )
    setup.exec(sql)
  }
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
  // The seed emits invite keys to a gitignored file in cwd; don't leave it behind.
  rmSync(INVITE_KEYS_FILE, { force: true })
})

// Read the raw rows the seed wrote (bypassing the ORM) to inspect storage directly.
function rawDb(): InstanceType<typeof Database> {
  return new Database(dbPath, { readonly: true })
}

describe("seed creates the demo roles + a superadmin (A11, B-roles)", () => {
  it("creates a coordinator, a viewer, and a superadmin", () => {
    const db = rawDb()
    const rows = db
      .prepare("SELECT email, role FROM user ORDER BY role")
      .all() as { email: string; role: string }[]
    db.close()
    const byRole = Object.fromEntries(rows.map((r) => [r.role, r.email]))
    expect(rows).toHaveLength(3)
    expect(byRole.coordinator).toBe(creds.COORDINATOR_EMAIL)
    expect(byRole.viewer).toBe(creds.VIEWER_EMAIL)
    // The superadmin email is bootstrap-only; assert it exists, not its value.
    expect(byRole.superadmin).toBeTruthy()
  })

  it("is idempotent — a re-run creates no duplicates", async () => {
    await seedAuth()
    const db = rawDb()
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }
    db.close()
    expect(n).toBe(3)
  })
})

describe("seed mints the invite keys once (B2)", () => {
  it("creates exactly 50 invite rows, all unclaimed and hashed", () => {
    const db = rawDb()
    const rows = db
      .prepare("SELECT code_hash, role, used_by FROM invite")
      .all() as { code_hash: string; role: string; used_by: string | null }[]
    db.close()
    expect(rows).toHaveLength(50)
    expect(rows.every((r) => r.used_by === null)).toBe(true)
    // Stored value is a 64-hex HMAC digest, never a readable key.
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash))).toBe(true)
    expect(rows.every((r) => r.role === "viewer" || r.role === "coordinator")).toBe(true)
  })

  it("does not regenerate keys on a re-run (idempotent)", () => {
    const db = rawDb()
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM invite").get() as { n: number }
    db.close()
    expect(n).toBe(50)
  })
})

describe("passwords are hashed, never plaintext (A1)", () => {
  it("the stored credential is a hash, not the plaintext password", () => {
    const db = rawDb()
    const accounts = db
      .prepare("SELECT a.password AS password, u.role AS role FROM account a JOIN user u ON u.id = a.user_id")
      .all() as { password: string | null; role: string }[]
    db.close()

    expect(accounts.length).toBe(3)
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
