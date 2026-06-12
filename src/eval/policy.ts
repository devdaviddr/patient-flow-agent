// The deterministic "oracle" intervention policy — the agent's stand-in for a
// reproducible eval. It takes the SAME class of actions the agent proposes: clear
// overdue, actionable discharge blockers (pharmacy_script, transport). The other
// two blocker types have no v1 lever and are left untouched in both runs.

import type { Simulator } from "../sim"
import { atOrBefore } from "../sim/time"

export function applyOraclePolicy(sim: Simulator): void {
  const state = sim.getState()
  for (const p of state.patients) {
    if (!p.predictedDischarge) continue
    if (!atOrBefore(p.predictedDischarge.at, state.at)) continue // only overdue/due
    if (p.blocker === "pharmacy_script") sim.resolveBlocker(p.id, "pharmacy_script")
    else if (p.blocker === "transport") sim.resolveBlocker(p.id, "transport")
  }
}
