// Reasoning-quality metric (#74 item 4). The KPI eval measures *outcomes* (did beds
// free up). This measures *reasoning*: does the agent propose the RIGHT actions?
//
// We build a deterministic reference — every not-ready discharge due within the
// horizon whose blocker is actionable, mapped to the action that clears it — and score
// the agent's proposals against it as precision / recall / F1. Pure + model-free, so
// the reference itself is trustworthy. (Relative imports only — keeps the eval SDK-free.)

import type { WorldState } from "../sim"

// blocker → the action that clears it (inverse of the driver's BLOCKER_FOR). The four
// actionable blocker types; "none" is never a reference action.
const ACTION_FOR: Record<string, string> = {
  pharmacy_script: "expedite_script",
  transport: "request_transport",
  allied_health: "page_allied_health",
  placement: "request_placement",
}

export interface ReferenceAction {
  patientId: string
  type: string
}

// The deterministic "ideal" action set for the current world over the horizon.
export function referenceActions(state: WorldState, horizonHrs = 8): ReferenceAction[] {
  const horizonEnd = new Date(new Date(state.at).getTime() + horizonHrs * 3_600_000).getTime()
  return state.patients
    .filter(
      (p) =>
        p.predictedDischarge != null &&
        !p.predictedDischarge.ready &&
        new Date(p.predictedDischarge.at).getTime() <= horizonEnd &&
        p.blocker in ACTION_FOR,
    )
    .map((p) => ({ patientId: p.id, type: ACTION_FOR[p.blocker] }))
}

export interface AgreementScore {
  precision: number
  recall: number
  f1: number
  matched: number
  proposed: number
  reference: number
}

// The aggregated form (mean over a run's ticks) — no per-tick `matched` count.
export type AgreementSummary = Omit<AgreementScore, "matched">

// Score the agent's proposed actions against the reference. A proposal matches when it
// targets the same patient with the same action. Precision = right of what it proposed;
// recall = how much of the reference it covered.
export function scoreAgreement(
  proposed: { targetPatientId: string; type: string }[],
  reference: ReferenceAction[],
): AgreementScore {
  const refKeys = new Set(reference.map((r) => `${r.patientId}:${r.type}`))
  const propKeys = new Set(proposed.map((p) => `${p.targetPatientId}:${p.type}`))
  let matched = 0
  for (const k of propKeys) if (refKeys.has(k)) matched += 1

  const precision = propKeys.size > 0 ? matched / propKeys.size : 1
  const recall = refKeys.size > 0 ? matched / refKeys.size : 1
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { precision, recall, f1, matched, proposed: propKeys.size, reference: refKeys.size }
}

// Mean of each metric over a run's ticks. Pure.
export function meanAgreement(scores: AgreementScore[]): AgreementSummary {
  if (scores.length === 0) {
    return { precision: 0, recall: 0, f1: 0, proposed: 0, reference: 0 }
  }
  const mean = (pick: (s: AgreementScore) => number) =>
    scores.reduce((sum, s) => sum + pick(s), 0) / scores.length
  return {
    precision: mean((s) => s.precision),
    recall: mean((s) => s.recall),
    f1: mean((s) => s.f1),
    proposed: mean((s) => s.proposed),
    reference: mean((s) => s.reference),
  }
}
