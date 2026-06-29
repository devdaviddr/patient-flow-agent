// One Driver per dev server (shares the sim singleton). Cached on globalThis so it
// survives Next.js hot-reloads. resetDriver() is called when a new scenario loads,
// so the fresh world also gets a fresh decision log.
//
// The driver writes its audit trail through a SQLite-backed store (#33), so the
// decision timeline survives a container restart; a scenario reset clears it.

import { Driver } from "./driver"
import { SqliteRecordStore, type RecordStore } from "./record-store"

const g = globalThis as unknown as { __driver?: Driver; __recordStore?: RecordStore }

function getRecordStore(): RecordStore {
  if (!g.__recordStore) g.__recordStore = new SqliteRecordStore()
  return g.__recordStore
}

export function getDriver(): Driver {
  if (!g.__driver) g.__driver = new Driver({ recordStore: getRecordStore() })
  return g.__driver
}

export function resetDriver(): void {
  // A new scenario means a fresh world — wipe the persisted trail too.
  getRecordStore().clear()
  g.__driver = undefined
}
