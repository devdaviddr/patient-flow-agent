import { tool } from "@opencode-ai/plugin"

// Read-only. Transparent heuristic demand forecast (expected admissions) for a
// ward over a horizon, with a plain-English rationale.
// Calls the simulator; falls back to a mock until Phase 1/2 are wired.
export default tool({
  description: "Heuristic incoming-demand forecast for a ward, with inspectable rationale",
  args: {
    wardId: tool.schema.string().describe("ward id, e.g. 4A or 4B"),
    horizonHrs: tool.schema.number().describe("forecast horizon in hours"),
  },
  async execute(a) {
    try {
      const r = await fetch(`${process.env.SIM_URL}/forecast/demand`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a),
      })
      if (!r.ok) throw new Error(`sim ${r.status}`)
      return await r.text()
    } catch {
      return JSON.stringify({
        wardId: a.wardId,
        horizonHrs: a.horizonHrs,
        expectedAdmissions: 3,
        rationale: "ED queue of 3 plus typical afternoon arrival rate over the horizon.",
        _mock: true,
      })
    }
  },
})
