// Persistence backend for the decision log (#33). Injectable so the offline driver
// tests stay in-memory (no store) while the running app writes through to SQLite, so
// the decision timeline (R10) survives a container restart.
//
// It shares the auth SQLite volume but is written only by the driver; the seeded
// simulator never reads it, so determinism (S12) is structurally unaffected.

import { asc, sql } from "drizzle-orm"
import { db } from "@/auth/db"
import { decisionRecord } from "@/auth/schema"
import type { DecisionActor, DecisionRecord } from "./types"

export interface RecordStore {
  load(): DecisionRecord[]
  append(record: DecisionRecord): void
  clear(): void
}

export class SqliteRecordStore implements RecordStore {
  constructor() {
    // Self-create the table so the store works regardless of migration order (the
    // running app also applies it via migration 0003). Idempotent.
    db.run(sql`CREATE TABLE IF NOT EXISTS decision_record (
      id integer PRIMARY KEY AUTOINCREMENT,
      at text NOT NULL,
      type text NOT NULL,
      state_ref text NOT NULL,
      rationale text NOT NULL,
      payload text NOT NULL,
      actor text,
      created_at integer NOT NULL
    )`)
  }

  load(): DecisionRecord[] {
    return db
      .select()
      .from(decisionRecord)
      .orderBy(asc(decisionRecord.id))
      .all()
      .map((r) => ({
        at: r.at,
        type: r.type,
        stateRef: r.stateRef,
        rationale: r.rationale,
        payload: JSON.parse(r.payload) as unknown,
        ...(r.actor ? { actor: JSON.parse(r.actor) as DecisionActor } : {}),
      }))
  }

  append(record: DecisionRecord): void {
    db.insert(decisionRecord)
      .values({
        at: record.at,
        type: record.type,
        stateRef: record.stateRef,
        rationale: record.rationale,
        payload: JSON.stringify(record.payload),
        actor: record.actor ? JSON.stringify(record.actor) : null,
        createdAt: new Date(),
      })
      .run()
  }

  clear(): void {
    db.delete(decisionRecord).run()
  }
}
