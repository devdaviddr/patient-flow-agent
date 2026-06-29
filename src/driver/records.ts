// Append-only audit trail (R10), retrievable in order. In-memory for fast reads;
// when a RecordStore is injected it also writes through and rehydrates on startup,
// so the timeline survives a container restart (#33). Tests use no store.

import type { DecisionRecord } from "./types"
import type { RecordStore } from "./record-store"

export class DecisionLog {
  private entries: DecisionRecord[]

  constructor(private readonly store?: RecordStore) {
    // Rehydrate any persisted trail so a restart doesn't lose the decision history.
    this.entries = store ? store.load() : []
  }

  add(record: DecisionRecord): void {
    this.entries.push(record)
    this.store?.append(record)
  }

  all(): DecisionRecord[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
    this.store?.clear()
  }
}
