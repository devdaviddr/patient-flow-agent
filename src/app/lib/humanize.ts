import { patientName } from "@/sim"
import { humanizeTimes } from "./time"

// Replace the technical vocabulary that leaks into agent-generated text with plain
// words a non-medical reader can follow.
const TERMS: [RegExp, string][] = [
  [/\bexpedite_script\b/g, "chase pharmacy"],
  [/\brequest_transport\b/g, "arrange transport"],
  [/\bpharmacy_script\b/g, "pharmacy"],
  [/\ballied_health\b/g, "allied health"],
  [/\bblocker_resolved\b/g, "blocker cleared"],
]

// Make decision-trail / rationale text human-friendly: patient ids → names,
// technical blocker/action names → plain words, ISO timestamps → DD-MM-YYYY HH:mm.
export function humanizeText(text: string): string {
  let out = humanizeTimes(text).replace(/\bp-\d+\b/g, (m) => patientName(m))
  for (const [re, rep] of TERMS) out = out.replace(re, rep)
  return out
}
