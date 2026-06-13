// Last-superadmin invariant helpers (spec B5, decision 5).
//
// The AUTHORITATIVE, race-safe guard is the pair of SQLite triggers installed by
// migration 0001 (BEFORE DELETE / BEFORE UPDATE OF role on `user`): the database
// engine aborts any write that would remove the final superadmin, on EVERY path —
// the admin plugin's remove-user / set-role and the self-service delete alike, with
// no way for application code to bypass it.
//
// These helpers are defence-in-depth: a pre-check so a route can return a friendly
// 409 before the raw SQLITE_CONSTRAINT surfaces, and a classifier so a caught DB
// error can be attributed to this invariant.

import { eq, sql } from "drizzle-orm"
import { db } from "./db"
import { user } from "./schema"

export function countSuperadmins(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(user)
    .where(eq(user.role, "superadmin"))
    .get()
  return row?.n ?? 0
}

// True when `userId` is a superadmin and the only one left — i.e. deleting or
// demoting them would lock the system out of administration.
export function isOnlySuperadmin(userId: string): boolean {
  const target = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get()
  if (target?.role !== "superadmin") return false
  return countSuperadmins() <= 1
}

// Whether a thrown error is the last-superadmin trigger aborting the write. The
// triggers RAISE(ABORT, '… superadmin …'), surfaced by better-sqlite3 as an Error.
export function isLastSuperadminError(err: unknown): boolean {
  return err instanceof Error && /superadmin/i.test(err.message)
}
