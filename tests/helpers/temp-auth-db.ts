// Stand up a fresh, fully-migrated SQLite auth DB in a temp dir and point the auth
// layer at it via env. Call this BEFORE dynamically importing any @/auth/* module —
// db.ts reads AUTH_DB_PATH at import time. Synthetic data only (no real PII, S13).

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"

const MIGRATIONS_DIR = join(process.cwd(), "drizzle")

export interface TempAuthDb {
  dbPath: string
  cleanup: () => void
}

export function setupTempAuthDb(): TempAuthDb {
  const dbDir = mkdtempSync(join(tmpdir(), "pfo-auth-"))
  const dbPath = join(dbDir, "auth.db")

  // Apply every checked-in migration in order (base schema + invites/admin/triggers).
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  const setup = new Database(dbPath)
  // The last-superadmin triggers fire on writes; FK cascade matters for delete.
  setup.pragma("foreign_keys = ON")
  for (const file of migrations) {
    setup.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/--> statement-breakpoint/g, ""))
  }
  setup.close()

  process.env.AUTH_DB_PATH = dbPath
  process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "test-secret-0123456789abcdef"
  process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"

  return { dbPath, cleanup: () => rmSync(dbDir, { recursive: true, force: true }) }
}
