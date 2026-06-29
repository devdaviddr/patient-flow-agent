// Decision-record persistence (#33). The SQLite store + DecisionLog rehydration is
// what lets the decision timeline survive a restart. Runs against a fresh temp DB.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"
import type { DecisionRecord } from "@/driver"

let temp: TempAuthDb
let SqliteRecordStore: typeof import("@/driver/record-store").SqliteRecordStore
let DecisionLog: typeof import("@/driver/records").DecisionLog

beforeAll(async () => {
  temp = setupTempAuthDb()
  ;({ SqliteRecordStore } = await import("@/driver/record-store"))
  ;({ DecisionLog } = await import("@/driver/records"))
})
afterAll(() => temp.cleanup())

const rec = (type: DecisionRecord["type"], rationale: string): DecisionRecord => ({
  at: "2026-06-11T08:00:00.000Z",
  type,
  stateRef: "2026-06-11T08:00:00.000Z",
  rationale,
  payload: { note: rationale },
})

beforeEach(() => new SqliteRecordStore().clear())

describe("SqliteRecordStore (#33)", () => {
  it("append then load roundtrips in insertion order, payload intact", () => {
    const store = new SqliteRecordStore()
    store.append(rec("gap", "a"))
    store.append(rec("plan", "b"))
    const all = store.load()
    expect(all.map((r) => r.rationale)).toEqual(["a", "b"])
    expect(all[0].payload).toEqual({ note: "a" })
  })

  it("preserves the actor snapshot when present", () => {
    const store = new SqliteRecordStore()
    store.append({ ...rec("action", "approved"), actor: { id: "u1", name: "Dr A", role: "coordinator" } })
    expect(store.load()[0].actor).toEqual({ id: "u1", name: "Dr A", role: "coordinator" })
  })

  it("a fresh DecisionLog rehydrates from the store — survives a 'restart'", () => {
    const store = new SqliteRecordStore()
    new DecisionLog(store).add(rec("gap", "persisted"))
    // Brand-new log, same backing store = a process restart.
    expect(new DecisionLog(store).all().map((r) => r.rationale)).toEqual(["persisted"])
  })

  it("clear empties both the in-memory log and the store", () => {
    const store = new SqliteRecordStore()
    const log = new DecisionLog(store)
    log.add(rec("gap", "x"))
    log.clear()
    expect(log.all()).toEqual([])
    expect(new DecisionLog(store).all()).toEqual([])
  })

  it("a log with no store stays purely in-memory (offline default)", () => {
    const log = new DecisionLog()
    log.add(rec("gap", "mem"))
    expect(log.all()).toHaveLength(1)
  })
})
