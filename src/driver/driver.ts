// The outer loop + the real approval gate. The agent PROPOSES (via plan()); a
// human APPROVES/REJECTS item-by-item; only then does the driver execute, in-process
// via the simulator. The gate lives here, never in the harness `ask`.

import { getSimulator, Simulator, type ActionResult, type SimEvent } from "@/sim"
import { DecisionLog } from "./records"
import type { Intervention, InterventionType, ProposedPlan } from "./types"

const BLOCKER_FOR: Record<InterventionType, "pharmacy_script" | "transport"> = {
  expedite_script: "pharmacy_script",
  request_transport: "transport",
}

const TICK_PROMPT =
  "Assess the current bed position. Perceive via world_state, call the forecast " +
  "tools, detect capacity gaps over the next 8 hours and explain why, then propose " +
  "a ranked list of interventions to address them."

export interface DriverDeps {
  /** Inject for deterministic, offline tests; defaults to the real orchestrator (lazy-loads the SDK adapter). */
  planner?: (promptBody: string) => Promise<ProposedPlan>
  /** Inject a fresh Simulator for tests; defaults to the shared dev-server singleton. */
  sim?: Simulator
}

export class Driver {
  private readonly planner: (promptBody: string) => Promise<ProposedPlan>
  private readonly sim: Simulator
  private readonly log = new DecisionLog()
  private current: Intervention[] = []

  constructor(deps: DriverDeps = {}) {
    this.sim = deps.sim ?? getSimulator()
    this.planner =
      deps.planner ??
      ((body) => import("./adapter").then((m) => m.planViaOrchestrator(body)))
  }

  /** One tick: prompt the agent, record the gaps + plan, stash the proposals. No state change. */
  async plan(): Promise<ProposedPlan> {
    const stateRef = this.sim.getState().at
    const plan = await this.planner(TICK_PROMPT)
    this.current = plan.interventions.map((iv) => ({ ...iv }))
    for (const gap of plan.gaps) {
      this.log.add({
        at: stateRef,
        type: "gap",
        stateRef,
        rationale: gap.factors.join("; "),
        payload: gap,
      })
    }
    this.log.add({
      at: stateRef,
      type: "plan",
      stateRef,
      rationale: `${plan.interventions.length} intervention(s) proposed`,
      payload: plan.interventions,
    })
    return plan
  }

  proposals(): Intervention[] {
    return this.current.map((iv) => ({ ...iv }))
  }

  /** Human approves one item → execute it via the simulator and record the outcome. */
  approve(interventionId: string): ActionResult {
    const iv = this.current.find((i) => i.id === interventionId)
    if (!iv) {
      return { applied: false, patientId: "", note: `No such intervention ${interventionId}` }
    }
    const stateRef = this.sim.getState().at
    const result = this.sim.resolveBlocker(iv.targetPatientId, BLOCKER_FOR[iv.type])
    iv.status = result.applied ? "executed" : "approved"
    this.log.add({
      at: stateRef,
      type: "action",
      stateRef,
      rationale: `Approved ${iv.type} for ${iv.targetPatientId}: ${result.note}`,
      payload: { intervention: iv, result },
    })
    return result
  }

  /** Human rejects one item → record it; state is untouched. */
  reject(interventionId: string): void {
    const iv = this.current.find((i) => i.id === interventionId)
    if (!iv) return
    iv.status = "rejected"
    const stateRef = this.sim.getState().at
    this.log.add({
      at: stateRef,
      type: "action",
      stateRef,
      rationale: `Rejected ${iv.type} for ${iv.targetPatientId}`,
      payload: { intervention: iv, result: { applied: false } },
    })
  }

  /** Advance the simulated clock one tick (a re-plan trigger). */
  advanceClock(): SimEvent[] {
    return this.sim.step()
  }

  records() {
    return this.log.all()
  }
}
