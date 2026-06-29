import { tool } from "@opencode-ai/plugin"

// Read-only. Transparent incoming-demand forecast for a ward over a horizon, with
// an inspectable rationale. No fallback — errors surface rather than fabricating data.
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
        headers: { "content-type": "application/json", "x-sim-service-token": process.env.SIM_SERVICE_TOKEN ?? "" },
        body: JSON.stringify(a),
      })
      if (!r.ok) return JSON.stringify({ error: `simulator returned ${r.status}` })
      return await r.text()
    } catch (e) {
      // Surface the real cause (fail loud) rather than collapsing every failure to
      // a generic "unreachable" the agent can't act on.
      const detail = e instanceof Error ? e.message : String(e)
      return JSON.stringify({ error: `simulator unreachable at ${process.env.SIM_URL}: ${detail}` })
    }
  },
})
