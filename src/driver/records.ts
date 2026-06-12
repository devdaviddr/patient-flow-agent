// In-process audit trail (R10). Append-only; retrievable in order. Persistence is
// a later concern — this is the source the Phase 6 timeline will render.

import type { DecisionRecord } from "./types"

export class DecisionLog {
  private entries: DecisionRecord[] = []

  add(record: DecisionRecord): void {
    this.entries.push(record)
  }

  all(): DecisionRecord[] {
    return [...this.entries]
  }
}
