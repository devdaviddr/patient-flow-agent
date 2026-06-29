import { tool } from "@opencode-ai/plugin"

// State-changing ACTION (gated as `ask`). Page allied health to unblock a discharge; the simulator emits a
// blocker_resolved event. The real approval gate is the loop driver — this `ask`
// is defence-in-depth, and the agent's service token can't reach this route anyway.
export default tool({
  description: "Page allied health to clear an allied-health sign-off blocking a discharge (requires approval)",
  args: {
    patientId: tool.schema.string().describe("patient whose allied_health blocker to clear"),
  },
  async execute(a) {
    try {
      const r = await fetch(`${process.env.SIM_URL}/actions/page_allied_health`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sim-service-token": process.env.SIM_SERVICE_TOKEN ?? "" },
        body: JSON.stringify(a),
      })
      if (!r.ok) return JSON.stringify({ error: `simulator returned ${r.status}` })
      return await r.text()
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      return JSON.stringify({ error: `simulator unreachable at ${process.env.SIM_URL}: ${detail}` })
    }
  },
})
