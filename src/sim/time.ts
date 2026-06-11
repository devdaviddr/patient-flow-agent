// Deterministic time helpers. The simulator never reads the wall clock — all time
// flows from an explicit start instant + the fixed tick, so a seed replays exactly.

import type { ISOTime } from "./state"

export const MINUTE_MS = 60_000

export function addMinutes(at: ISOTime, minutes: number): ISOTime {
  return new Date(new Date(at).getTime() + minutes * MINUTE_MS).toISOString()
}

/** true when a <= b */
export function atOrBefore(a: ISOTime, b: ISOTime): boolean {
  return new Date(a).getTime() <= new Date(b).getTime()
}
