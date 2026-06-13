// Drizzle client over better-sqlite3 for the auth store (Architecture.md §3).
// This layer is deliberately disjoint from the seeded in-process simulator, so
// determinism (S12) is structurally unaffected.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { schema } from "./schema"

// A file on a mounted volume in deployment; defaults to a repo-local file for dev.
const AUTH_DB_PATH = process.env.AUTH_DB_PATH ?? "./auth.db"

const sqlite = new Database(AUTH_DB_PATH)
// SQLite leaves foreign-key enforcement off by default; turn it on so the
// session/account → user references actually constrain.
sqlite.pragma("foreign_keys = ON")

export const db = drizzle(sqlite, { schema })
