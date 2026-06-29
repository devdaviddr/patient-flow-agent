// Auth audit trail (#28). Records security-relevant identity events — sign-in, role
// change, account deletion, and other admin actions — so a superadmin changing a
// user's role (or removing an account) leaves an inspectable trace. Synthetic
// identities only (S13); never any clinical content.
//
// Auditing is a side-channel: a failure here must never break the action it observes,
// so writes are best-effort (logged on failure, not thrown).

import { desc, sql } from "drizzle-orm"
import { db } from "./db"
import { authEvent } from "./schema"

export type AuthEventType =
  | "sign_in"
  | "role_change"
  | "account_deleted"
  | "admin_action"

export interface AuthEventInput {
  type: AuthEventType
  actorId?: string | null
  actorName?: string | null
  targetId?: string | null
  detail?: string | null
}

export interface AuthEventRow {
  id: number
  at: string
  type: string
  actorId: string | null
  actorName: string | null
  targetId: string | null
  detail: string | null
}

function ensureTable(): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS auth_event (
    id integer PRIMARY KEY AUTOINCREMENT,
    at text NOT NULL,
    type text NOT NULL,
    actor_id text,
    actor_name text,
    target_id text,
    detail text,
    created_at integer NOT NULL
  )`)
}

export function recordAuthEvent(event: AuthEventInput): void {
  try {
    ensureTable()
    db.insert(authEvent)
      .values({
        at: new Date().toISOString(),
        type: event.type,
        actorId: event.actorId ?? null,
        actorName: event.actorName ?? null,
        targetId: event.targetId ?? null,
        detail: event.detail ?? null,
        createdAt: new Date(),
      })
      .run()
  } catch (err) {
    // Observability must not break the observed action; surface it, don't throw.
    console.error("auth audit: failed to record event", event.type, err)
  }
}

export function recentAuthEvents(limit = 50): AuthEventRow[] {
  ensureTable()
  return db
    .select()
    .from(authEvent)
    .orderBy(desc(authEvent.id))
    .limit(limit)
    .all()
}
