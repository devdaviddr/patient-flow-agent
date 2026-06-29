import { tool } from "@opencode-ai/plugin"

// State-changing ACTION (gated as `ask`). Clears a pending pharmacy script to
// unblock a discharge; the simulator emits a blocker_resolved event. The real
// approval gate is the loop driver — this `ask` is defence-in-depth.
export default tool({
  description: "Expedite a pending pharmacy script to unblock a discharge (requires approval)",
  args: {
    patientId: tool.schema.string().describe("patient whose pharmacy script to expedite"),
  },
  async execute(a) {
    try {
      const r = await fetch(`${process.env.SIM_URL}/actions/expedite_script`, {
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
