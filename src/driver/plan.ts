// The plan contract: the orchestrator must end its turn with a strict JSON plan.
// We extract, JSON.parse, and zod-validate it; the driver assigns stable ids.

import { z } from "zod"
import type { ProposedPlan } from "./types"

const GapSchema = z.object({
  wardId: z.string(),
  atTime: z.string(),
  projectedDeficit: z.number(),
  factors: z.array(z.string()),
})

const InterventionInputSchema = z.object({
  type: z.enum([
    "expedite_script",
    "request_transport",
    "page_allied_health",
    "request_placement",
  ]),
  targetPatientId: z.string(),
  addressesGap: z.string(),
  impactScore: z.number(),
  rationale: z.string(),
})

const FlagSchema = z.object({
  patientId: z.string(),
  wardId: z.string(),
  blocker: z.enum(["allied_health", "placement"]),
  reason: z.string(),
})

const PlanInputSchema = z.object({
  gaps: z.array(GapSchema),
  interventions: z.array(InterventionInputSchema),
  flags: z.array(FlagSchema).optional(), // sparse replies still parse
})

/** Pull the last fenced ```json block, or fall back to the outermost {...}. */
export function extractJson(text: string): string {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  if (fences.length > 0) return fences[fences.length - 1][1].trim()
  const first = text.indexOf("{")
  const last = text.lastIndexOf("}")
  if (first !== -1 && last > first) return text.slice(first, last + 1)
  throw new Error("no JSON object found in plan output")
}

export function parsePlan(text: string): ProposedPlan {
  const parsed = PlanInputSchema.parse(JSON.parse(extractJson(text)))
  return {
    gaps: parsed.gaps,
    interventions: parsed.interventions.map((iv, i) => ({
      ...iv,
      id: `iv-${i + 1}`,
      status: "proposed" as const,
    })),
    flags: parsed.flags ?? [],
  }
}
