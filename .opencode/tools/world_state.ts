import { tool } from "@opencode-ai/plugin"

// Perception (read-only). Returns the current hospital WorldState as JSON.
// Calls the simulator over HTTP; falls back to a representative mock so the
// harness is runnable before the simulator (Phase 1) exists.
export default tool({
  description: "Return the current hospital world state (wards, beds, patients, ED queue)",
  args: {},
  async execute() {
    try {
      const r = await fetch(`${process.env.SIM_URL}/state`)
      if (!r.ok) throw new Error(`sim ${r.status}`)
      return await r.text()
    } catch {
      return JSON.stringify(MOCK_STATE)
    }
  },
})

// --- mock fallback (removed once the simulator is wired) ---------------------
const MOCK_STATE = {
  at: "2026-06-11T14:00:00Z",
  wards: [
    { id: "4A", name: "Ward 4A", bedCount: 10 },
    { id: "4B", name: "Ward 4B", bedCount: 10 },
  ],
  beds: [
    { id: "4B-01", wardId: "4B", status: "occupied", patientId: "p-101" },
    { id: "4B-02", wardId: "4B", status: "empty_dirty" },
    { id: "4A-01", wardId: "4A", status: "occupied", patientId: "p-201" },
    { id: "4A-02", wardId: "4A", status: "empty_clean" },
  ],
  patients: [
    {
      id: "p-101", wardId: "4B", bedId: "4B-01", admittedAt: "2026-06-09T08:00:00Z",
      predictedDischarge: { at: "2026-06-11T16:00:00Z", confidence: 0.7, ready: false },
      blocker: "pharmacy_script",
    },
    {
      id: "p-201", wardId: "4A", bedId: "4A-01", admittedAt: "2026-06-10T11:00:00Z",
      predictedDischarge: { at: "2026-06-11T18:00:00Z", confidence: 0.6, ready: false },
      blocker: "transport",
    },
  ],
  edQueue: ["p-301", "p-302", "p-303"],
  _mock: true,
}
