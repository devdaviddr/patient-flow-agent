import { tool } from "@opencode-ai/plugin"

// Perception (read-only). Returns the current hospital WorldState as JSON from the
// simulator. No fallback — a down simulator surfaces as an error, never fake data.
export default tool({
  description: "Return the current hospital world state (wards, beds, patients, ED queue)",
  args: {},
  async execute() {
    try {
      const r = await fetch(`${process.env.SIM_URL}/state`)
      if (!r.ok) return JSON.stringify({ error: `simulator returned ${r.status}` })
      return await r.text()
    } catch {
      return JSON.stringify({ error: `simulator unreachable at ${process.env.SIM_URL}` })
    }
  },
})
