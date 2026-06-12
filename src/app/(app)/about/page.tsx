import type { ReactNode } from "react"
import { Mermaid } from "../../components/Mermaid"

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      {eyebrow && (
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-primary">
          {eyebrow}
        </div>
      )}
      <h2 className="mb-3 text-base font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text">{children}</div>
    </section>
  )
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Hero */}
      <header className="rounded-xl border border-border bg-surface p-6">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-primary">
          About this system
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          An AI assistant for hospital bed flow
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          This tool helps a hospital&apos;s bed-flow coordinator stay ahead of a bed shortage. It
          watches a (simulated) hospital, predicts where beds will run short, explains why, and
          proposes fixes that a human approves before anything happens. It runs entirely on
          synthetic data and never makes clinical decisions.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill color="bg-occupied" label="Synthetic data only" />
          <Pill color="bg-clean" label="Human approves every action" />
          <Pill color="bg-dirty" label="No clinical decisions" />
        </div>
      </header>

      {/* What it is */}
      <Card eyebrow="What it is" title="A copilot for the bed coordinator">
        <p>
          In a hospital, one person is often responsible for the flow of patients through beds. When
          the emergency department fills up faster than beds free up, patients wait — sometimes for
          hours — for a place to go. That waiting is costly and stressful for everyone.
        </p>
        <p>
          This system is an assistant for that coordinator. It doesn&apos;t replace their judgement.
          It does the tedious watching and arithmetic: it tracks every bed, forecasts when the
          hospital will run short, works out <em>why</em>, and hands the coordinator a short list of
          concrete actions to approve.
        </p>
        <p className="text-muted">
          Everything you see is a simulation. No real patients, no real clinical data, and no
          medical decisions of any kind are involved.
        </p>
      </Card>

      {/* Business flow */}
      <Card eyebrow="The business flow" title="Where beds get stuck">
        <p>
          A bed shortage is rarely caused by a lack of beds — it&apos;s caused by beds that
          can&apos;t be freed up. Here is the chain of events the system reasons about:
        </p>
        <ol className="ml-4 list-decimal space-y-2">
          <li>
            <span className="font-medium">Patients arrive at the ED.</span> Demand builds through
            the day, sometimes in surges.
          </li>
          <li>
            <span className="font-medium">They need an inpatient bed.</span> To leave the ED, a
            patient needs a free bed on a ward.
          </li>
          <li>
            <span className="font-medium">Beds free up on discharge.</span> A bed becomes available
            when an existing patient is sent home or moved on.
          </li>
          <li>
            <span className="font-medium">Discharges get stuck on blockers.</span> A patient ready
            to leave often can&apos;t, because of a hold-up.
          </li>
        </ol>

        <p className="pt-1">There are four kinds of blocker:</p>
        <div className="flex flex-wrap gap-2">
          <Pill color="bg-pharmacy-script" label="Pharmacy script" />
          <Pill color="bg-transport" label="Transport" />
          <Pill color="bg-allied-health" label="Allied health" />
          <Pill color="bg-placement" label="Placement" />
        </div>

        <p className="pt-1">
          The agent spots the looming shortfall, works out which blockers are causing it, and
          proposes the two it can act on directly — <span className="font-medium">chasing a
          pharmacy script</span> and <span className="font-medium">arranging transport</span>. The
          other two (allied health and placement) need human relationships and judgement, so they are
          flagged for a person to chase rather than actioned automatically.
        </p>
      </Card>

      {/* Flow diagram */}
      <Card eyebrow="At a glance" title="The flow, end to end">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <Mermaid
            chart={`flowchart LR
  ED([ED arrival]) --> WAIT["Waiting<br/>for a bed"]
  WAIT -->|needs a bed| OCC["Admitted<br/>bed occupied"]
  OCC --> RDY["Ready to leave"]
  RDY -->|blocker clears| FREE["Bed freed<br/>& cleaned"]
  FREE -.->|opens a bed| WAIT
  RDY -.->|"pharmacy · transport"| ACT["Agent proposes a fix<br/>(human approves)"]
  RDY -.->|"allied health · placement"| FLAG["Flagged<br/>for a human"]
  class ACT act
  class FLAG flag
  classDef act fill:#eaf2fd,stroke:#2c7be5,color:#1a2b3c
  classDef flag fill:#fdeef0,stroke:#d6455b,color:#1a2b3c`}
          />
        </div>
      </Card>

      {/* How the agent works */}
      <Card eyebrow="How the agent works" title="Perceive → reason → plan → act">
        <p>
          The agent runs a simple loop, the same one a good coordinator runs in their head, just
          faster and without missing anything:
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            {
              n: "1",
              t: "Perceive",
              d: "Read the current state of every bed and the forecast for the rest of the day.",
            },
            {
              n: "2",
              t: "Reason",
              d: "Predict where and when beds will run short, and which blockers are to blame.",
            },
            {
              n: "3",
              t: "Plan",
              d: "Choose the actions that close the gap, and flag the rest for a human.",
            },
            {
              n: "4",
              t: "Act",
              d: "Only after a person approves — then the change takes effect.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-1 text-xs font-semibold text-primary">Step {s.n}</div>
              <div className="font-medium">{s.t}</div>
              <p className="mt-1 text-xs text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary-weak p-4">
          <div className="text-sm font-semibold text-primary">The human approval gate</div>
          <p className="mt-1 text-sm text-text">
            The agent never changes the world on its own. It <em>proposes</em>; a person reviews and{" "}
            <em>approves</em>; only then does anything happen. Every action passes through this gate,
            so the coordinator stays firmly in control.
          </p>
        </div>
      </Card>

      {/* Architecture */}
      <Card eyebrow="The architecture" title="Two nested loops, five components">
        <p>
          The design separates <span className="font-medium">the world</span> from{" "}
          <span className="font-medium">the reasoning</span>. We own the world and the clock; an
          external reasoning harness does the thinking within a single tick of that clock.
        </p>

        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <Mermaid
            chart={`flowchart TB
  subgraph OUTER["Our app — the environment (we own the world + clock)"]
    direction TB
    UI["Web UI"]
    DRV["Loop driver<br/>owns the clock · the approval gate"]
    SIM["Simulator<br/>the hospital"]
  end
  subgraph INNER["OpenCode harness — reasoning within one tick"]
    direction TB
    ORCH["Orchestrator"]
    SUB["Discharge + Demand<br/>read-only specialists"]
  end
  UI --- DRV
  DRV -->|one prompt per tick| ORCH
  ORCH --> SUB
  ORCH -->|read-only tool calls| SIM
  DRV -->|approved action only| SIM
  SIM -->|new bed position| DRV`}
          />
        </div>

        <p className="pt-1 font-medium">The five components:</p>
        <ul className="space-y-2">
          <li>
            <span className="font-medium">Simulator</span> — the environment. A pure, seeded model of
            the hospital: beds, arrivals, discharges, and blockers.
          </li>
          <li>
            <span className="font-medium">Tools bridge</span> — the only hospital-aware code. It
            translates between the simulator and the reasoning layer.
          </li>
          <li>
            <span className="font-medium">OpenCode harness</span> — the orchestrator, plus two
            read-only specialist subagents that analyse but never change anything.
          </li>
          <li>
            <span className="font-medium">Loop driver</span> — owns the clock and the real approval
            gate, advancing the world only when a human signs off.
          </li>
          <li>
            <span className="font-medium">Web UI</span> — this interface, where the coordinator sees
            the board, the forecast, and the proposals.
          </li>
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-sm font-semibold">Safety boundary</div>
            <p className="mt-1 text-xs text-muted">
              Only the tools know this is a hospital. The reasoning layer works with abstract
              capacity and queues — it never sees clinical concepts at all.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-sm font-semibold">Determinism</div>
            <p className="mt-1 text-xs text-muted">
              The simulator is seeded, so a given day always replays identically. The reasoning model
              is not deterministic — which is exactly why a human stays in the loop.
            </p>
          </div>
        </div>
      </Card>

      {/* Evidence */}
      <Card eyebrow="The evidence" title="It's measured, not assumed">
        <p>
          We don&apos;t just claim the agent helps — we measure it. The exact same seeded day is run
          twice: once <span className="font-medium">with</span> the agent, once{" "}
          <span className="font-medium">without</span>. Because the day is deterministic, the only
          difference between the two runs is the agent itself.
        </p>
        <p>The two runs are compared on two KPIs:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-sm font-semibold">Access-block hours</div>
            <p className="mt-1 text-xs text-muted">
              How long patients waited for a bed across the day. Lower is better.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="text-sm font-semibold">End-of-day headroom</div>
            <p className="mt-1 text-xs text-muted">
              How much spare bed capacity is left at the end of the day. Higher is better.
            </p>
          </div>
        </div>
        <p className="text-muted">
          The agent improves both: less time spent waiting for beds, and more headroom going into
          the night.
        </p>
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        Synthetic demonstration — no real patients, no real clinical data, no medical decisions.
      </p>
    </div>
  )
}
