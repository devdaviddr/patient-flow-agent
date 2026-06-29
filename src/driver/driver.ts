// The outer loop + the real approval gate. The agent PROPOSES (via plan()); a
// human APPROVES/REJECTS item-by-item; only then does the driver execute, in-process
// via the simulator. The gate lives here, never in the harness `ask`.

import { getSimulator, Simulator, type ActionResult, type SimEvent } from "@/sim"
import { DecisionLog } from "./records"
import { BLOCKER_FOR, groundInterventions } from "./grounding"
import { rankByImpact } from "./ranking"
import type { RecordStore } from "./record-store"
import type { Assessment, DecisionActor, Flag, Intervention, ProposedPlan } from "./types"

const TICK_PROMPT =
  "Assess the current bed position. Perceive via world_state, call the forecast " +
  "tools, detect capacity gaps over the next 8 hours and explain why, then propose " +
  "a ranked list of interventions to address them."

export interface DriverDeps {
  /** Inject for deterministic, offline tests; defaults to the real orchestrator (lazy-loads the SDK adapter). */
  planner?: (promptBody: string) => Promise<ProposedPlan>
  /** Inject a fresh Simulator for tests; defaults to the shared dev-server singleton. */
  sim?: Simulator
  /** Inject a persistence backend (the app wires SQLite); omitted in tests → in-memory only (#33). */
  recordStore?: RecordStore
}

export class Driver {
  private readonly planner: (promptBody: string) => Promise<ProposedPlan>
  private readonly sim: Simulator
  private readonly log: DecisionLog
  private current: Intervention[] = []
  private currentFlags: Flag[] = []
  private assessmentState: Assessment | null = null

  constructor(deps: DriverDeps = {}) {
    this.sim = deps.sim ?? getSimulator()
    this.log = new DecisionLog(deps.recordStore)
    this.planner =
      deps.planner ??
      ((body) => import("./adapter").then((m) => m.planViaOrchestrator(body)))
  }

  /** Record a plan's gaps + stash the grounded proposals/flags. No state change. */
  private applyPlan(plan: ProposedPlan): void {
    const state = this.sim.getState()
    const stateRef = state.at
    // Ground the plan against the live world: only interventions whose target patient
    // exists and is blocked on the matching type can act, so surface only those. The
    // rest are dropped (and recorded) instead of silently no-opping on approval (#74).
    const { grounded, dropped } = groundInterventions(plan.interventions, state)
    // Rank the grounded set by a deterministic bed-hours estimate, not the model's
    // bare impactScore — so the order is defensible (#74 item 2).
    this.current = rankByImpact(grounded, state)
    this.currentFlags = plan.flags ?? []
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
      rationale:
        `Proposed ${grounded.length} grounded action(s) to free beds` +
        (dropped.length > 0 ? `; dropped ${dropped.length} ungrounded` : "") +
        `; flagged ${this.currentFlags.length} blocker(s) for a human to chase`,
      payload: { interventions: grounded, dropped },
    })
  }

  /** One tick: prompt the agent, record the gaps + plan, stash the proposals. No state change. */
  async plan(): Promise<ProposedPlan> {
    const plan = await this.planner(TICK_PROMPT)
    this.applyPlan(plan)
    return plan
  }

  assessment(): Assessment | null {
    return this.assessmentState
      ? { ...this.assessmentState, log: [...this.assessmentState.log] }
      : null
  }

  // Server-push for the live assessment (#34): listeners are notified on every log
  // line and status change, so an SSE endpoint can stream progress instead of the
  // client polling. Returns an unsubscribe.
  private readonly assessmentListeners = new Set<() => void>()
  subscribeAssessment(listener: () => void): () => void {
    this.assessmentListeners.add(listener)
    return () => this.assessmentListeners.delete(listener)
  }
  private notifyAssessment(): void {
    for (const listener of this.assessmentListeners) listener()
  }

  /**
   * Kick off an assessment in the BACKGROUND, capturing the agent's live activity.
   * Returns immediately; poll assessment() for progress.
   */
  startAssessment(): Assessment {
    if (this.assessmentState?.status === "running") return this.assessment()!
    const state: Assessment = {
      startedAt: new Date().toISOString(),
      status: "running",
      log: [],
    }
    this.assessmentState = state
    const onLog = (text: string) => {
      state.log.push({ at: new Date().toISOString(), text })
      this.notifyAssessment()
    }

    void (async () => {
      try {
        onLog("Assessment started — prompting the orchestrator")
        const m = await import("./adapter")
        const plan = await m.planViaOrchestratorLogged(TICK_PROMPT, onLog)
        this.applyPlan(plan)
        const flagged = (plan.flags ?? []).length
        onLog(`Done — ${plan.interventions.length} action(s) proposed, ${flagged} flagged`)
        state.status = "done"
        state.interventions = plan.interventions.length
        state.flags = flagged
        state.finishedAt = new Date().toISOString()
        this.notifyAssessment()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        onLog(`Error: ${msg}`)
        state.status = "error"
        state.error = msg
        state.finishedAt = new Date().toISOString()
        this.notifyAssessment()
      }
    })()

    return this.assessment()!
  }

  proposals(): Intervention[] {
    return this.current.map((iv) => ({ ...iv }))
  }

  flags(): Flag[] {
    return this.currentFlags.map((f) => ({ ...f }))
  }

  /** Human approves one item → execute it via the simulator and record the outcome. */
  approve(interventionId: string, actor?: DecisionActor): ActionResult {
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
      rationale: `Approved — ${iv.type} for ${iv.targetPatientId} (${result.applied ? "blocker cleared, bed will free up" : "no change"})`,
      payload: { intervention: iv, result },
      actor,
    })
    return result
  }

  /** Human rejects one item → record it; state is untouched. */
  reject(interventionId: string, actor?: DecisionActor): void {
    const iv = this.current.find((i) => i.id === interventionId)
    if (!iv) return
    iv.status = "rejected"
    const stateRef = this.sim.getState().at
    this.log.add({
      at: stateRef,
      type: "action",
      stateRef,
      rationale: `Rejected — ${iv.type} for ${iv.targetPatientId} (no change)`,
      payload: { intervention: iv, result: { applied: false } },
      actor,
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
