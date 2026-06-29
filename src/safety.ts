// The clinical-vocabulary denylist (S13) — the single source for "no clinical
// output". Used by the safety test over authored files/outputs AND by the agent-
// config validator, so a coordinator can't save a custom prompt that smuggles
// clinical wording into the agent's instructions (#56).
//
// NOTE: this file deliberately contains the denied words (it defines them), so it is
// NOT itself scanned by the S13 test.

// Whole-word, case-insensitive. Department/logistics words (pharmacy, transport,
// script, placement, allied-health) are NOT clinical and stay allowed.
export const CLINICAL_DENYLIST = [
  "acuity",
  "triage",
  "diagnosis",
  "diagnose",
  "treatment",
  "treat",
  "prognosis",
  "symptom",
  "medication",
  "drug",
] as const

// The denied terms present in `text` (whole-word, case-insensitive); [] if clean.
export function findClinicalTerms(text: string): string[] {
  return CLINICAL_DENYLIST.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(text))
}
