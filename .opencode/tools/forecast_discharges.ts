import { tool } from "@opencode-ai/plugin"

// Read-only. Transparent discharge-readiness forecast; each prediction carries an
// inspectable rationale. No fallback — errors surface rather than fabricating data.
export default tool({
  description: "Heuristic discharge-readiness forecast for a ward, with inspectable rationale",
  args: {
    wardId: tool.schema.string().describe("ward id, e.g. 4A or 4B"),
    horizonHrs: tool.schema.number().describe("forecast horizon in hours"),
  },
  async execute(a) {
    try {
      const r = await fetch(`${process.env.SIM_URL}/forecast/discharges`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sim-service-token": process.env.SIM_SERVICE_TOKEN ?? "" },
        body: JSON.stringify(a),
      })
      if (!r.ok) return JSON.stringify({ error: `simulator returned ${r.status}` })
      return await r.text()
    } catch {
      return JSON.stringify({ error: `simulator unreachable at ${process.env.SIM_URL}` })
    }
  },
})
