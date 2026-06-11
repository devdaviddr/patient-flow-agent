import { tool } from "@opencode-ai/plugin"

// State-changing ACTION (gated as `ask`). Expedites a pending pharmacy script to
// unblock a discharge; the simulator emits a SimEvent that mutates world state.
// The real approval gate is the loop driver — this `ask` is defence-in-depth.
export default tool({
  description: "Expedite a pending pharmacy script to unblock a discharge (requires approval)",
  args: {
    patientId: tool.schema.string().describe("patient whose pharmacy script to expedite"),
  },
  async execute(a) {
    try {
      const r = await fetch(`${process.env.SIM_URL}/actions/expedite_script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a),
      })
      if (!r.ok) throw new Error(`sim ${r.status}`)
      return await r.text()
    } catch {
      return JSON.stringify({
        applied: false,
        patientId: a.patientId,
        note: "simulator unavailable — no event emitted (mock)",
        _mock: true,
      })
    }
  },
})
