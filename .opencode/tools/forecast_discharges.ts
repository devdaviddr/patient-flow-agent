import { tool } from "@opencode-ai/plugin"

// Read-only. Transparent heuristic discharge-readiness forecast; each prediction
// carries a plain-English rationale (the rationale is part of the contract).
// Calls the simulator; falls back to a mock until Phase 1/2 are wired.
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a),
      })
      if (!r.ok) throw new Error(`sim ${r.status}`)
      return await r.text()
    } catch {
      return JSON.stringify(mock(a.wardId, a.horizonHrs))
    }
  },
})

// --- mock fallback (removed once the simulator is wired) ---------------------
const mock = (wardId: string, horizonHrs: number) => ({
  wardId,
  horizonHrs,
  predicted: [
    {
      patientId: wardId === "4B" ? "p-101" : "p-201",
      at: "2026-06-11T16:00:00Z",
      ready: false,
      blocker: wardId === "4B" ? "pharmacy_script" : "transport",
      rationale: "Stay length past typical median; predicted discharge but a blocker is open.",
    },
  ],
  _mock: true,
})
