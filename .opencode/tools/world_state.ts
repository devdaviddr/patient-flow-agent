import { tool } from "@opencode-ai/plugin"

// Perception (read-only). Returns the current hospital WorldState as JSON from the
// simulator. No fallback — a down simulator surfaces as an error, never fake data.
export default tool({
  description: "Return the current hospital world state (wards, beds, patients, ED queue)",
  args: {},
  async execute() {
    try {
      const r = await fetch(`${process.env.SIM_URL}/state`, {
        headers: { "x-sim-service-token": process.env.SIM_SERVICE_TOKEN ?? "" },
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
