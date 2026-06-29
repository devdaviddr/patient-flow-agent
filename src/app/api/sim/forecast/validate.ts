// Shared input validation for the two forecast routes (CLAUDE.md: validate at
// boundaries with explicit schemas). Bounds horizonHrs to a sane positive range and
// checks wardId against the live world, so edge inputs fail loud with a 400 instead
// of producing nonsense (negative admissions, "Invalid Date" horizons).

import { z } from "zod"
import type { WorldState } from "@/sim"

const MAX_HORIZON_HRS = 72

const ForecastBody = z.object({
  wardId: z.string().min(1).default("4A"),
  horizonHrs: z.number().positive().finite().max(MAX_HORIZON_HRS).default(8),
})

export type ParsedForecast =
  | { ok: true; wardId: string; horizonHrs: number }
  | { ok: false; error: string }

// Parse + validate a forecast request body against the current world. A malformed
// or empty body falls back to the defaults; out-of-range values and unknown wards
// are rejected.
export function parseForecastBody(body: unknown, state: WorldState): ParsedForecast {
  const parsed = ForecastBody.safeParse(body)
  if (!parsed.success) {
    return { ok: false, error: `horizonHrs must be a positive number up to ${MAX_HORIZON_HRS}` }
  }
  const { wardId, horizonHrs } = parsed.data
  if (!state.wards.some((w) => w.id === wardId)) {
    return { ok: false, error: `unknown ward "${wardId}"` }
  }
  return { ok: true, wardId, horizonHrs }
}
