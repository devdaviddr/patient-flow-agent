"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { WorldState } from "@/sim"
import type { Assessment, DecisionRecord, Flag, Intervention } from "@/driver"
import type { EvalResult } from "@/eval"
import { BedBoard } from "../components/BedBoard"
import { EdQueue, DischargeQueue } from "../components/Queues"
import { AssessmentPanel } from "../components/AssessmentPanel"
import { ApprovalCards } from "../components/ApprovalCards"
import { FlaggedBlockers } from "../components/FlaggedBlockers"
import { CollapsibleColumn } from "../components/CollapsibleColumn"
import { DecisionTimeline } from "../components/DecisionTimeline"
import { KpiPanel } from "../components/KpiPanel"
import { ClockControls } from "../components/ClockControls"
import { Panel } from "../components/Panel"

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" })
  return r.json()
}
async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  return r.json()
}

type ColId = "edqueue" | "discharge" | "proposed" | "flagged" | "assessment"

export default function DashboardPage() {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [proposals, setProposals] = useState<Intervention[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [evalResults, setEvalResults] = useState<EvalResult[] | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [assessNote, setAssessNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [playing, setPlaying] = useState(false)
  // Accordion: at most one working column open at a time.
  const [active, setActive] = useState<ColId | null>("proposed")

  useEffect(() => {
    const saved = localStorage.getItem("pfo.active")
    if (!saved) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(saved === "none" ? null : (saved as ColId))
  }, [])

  const setActiveCol = (id: ColId) =>
    setActive((prev) => {
      const next = prev === id ? null : id
      localStorage.setItem("pfo.active", next ?? "none")
      return next
    })

  const refresh = useCallback(async () => {
    const [w, p, f, r] = await Promise.all([
      getJSON<WorldState>("/api/sim/state"),
      getJSON<Intervention[]>("/api/driver/proposals"),
      getJSON<Flag[]>("/api/driver/flags"),
      getJSON<DecisionRecord[]>("/api/driver/records"),
    ])
    setWorld(w)
    setProposals(p)
    setFlags(f)
    setRecords(r)
  }, [])

  useEffect(() => {
    // Initial async load — setState runs after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // Real-time playback: auto-advance the clock while playing.
  useEffect(() => {
    if (!playing) return
    let active = true
    const id = setInterval(async () => {
      if (!active) return
      await fetch("/api/sim/step", { method: "POST" })
      await refresh()
    }, 3000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [playing, refresh])

  const step = async () => {
    setBusy(true)
    try {
      await postJSON("/api/sim/step")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const assess = async () => {
    setAssessing(true)
    setAssessNote("")
    setAssessment(null) // clear the previous run's log
    await fetch("/api/driver/assess", { method: "POST" })
    // Poll the live assessment until it finishes.
    for (;;) {
      const a = await getJSON<Assessment | null>("/api/driver/assessment")
      setAssessment(a)
      if (!a || a.status !== "running") {
        if (a?.status === "error") {
          setAssessNote(`Assess failed: ${a.error} (is opencode serve running?)`)
        }
        break
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
    await refresh()
    setAssessing(false)
  }

  const decide = async (path: string, interventionId: string) => {
    setBusy(true)
    try {
      await postJSON(path, { interventionId })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const runEval = async () => {
    setEvaluating(true)
    try {
      setEvalResults(await getJSON<EvalResult[]>("/api/eval/run"))
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Bed position</h1>
          <p className="text-xs text-muted">
            Perceive → reason → plan → act · synthetic data · human-approved
          </p>
          {assessNote && <p className="mt-1 text-xs text-blocked">{assessNote}</p>}
        </div>
        <ClockControls
          at={world?.at}
          busy={busy}
          assessing={assessing}
          assessed={!!assessment}
          playing={playing}
          onStep={step}
          onAssess={assess}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      </div>

      {/* Bed-board — its own row */}
      <Panel title="Bed-board">
        <BedBoard world={world} />
      </Panel>

      {/* One column open at a time — collapsed banners on the left, the open one fills the right */}
      {(() => {
        const columns: { id: ColId; title: string; count?: number; body: ReactNode }[] = [
          { id: "edqueue", title: "ED queue", count: world?.edQueue.length, body: <EdQueue world={world} /> },
          {
            id: "discharge",
            title: "Discharge queue",
            count: world ? world.patients.filter((p) => p.predictedDischarge).length : undefined,
            body: <DischargeQueue world={world} />,
          },
          {
            id: "proposed",
            title: "Proposed interventions",
            count: proposals.length,
            body: (
              <div className="scroll-area max-h-[560px] overflow-y-auto pr-1">
                <ApprovalCards
                  proposals={proposals}
                  busy={busy}
                  onApprove={(id) => decide("/api/driver/approve", id)}
                  onReject={(id) => decide("/api/driver/reject", id)}
                />
              </div>
            ),
          },
          {
            id: "flagged",
            title: "Flagged — no one-click fix",
            count: flags.length,
            body: (
              <div className="scroll-area max-h-[560px] overflow-y-auto pr-1">
                <FlaggedBlockers flags={flags} />
              </div>
            ),
          },
          {
            id: "assessment",
            title: "Assessment — what the agent is doing",
            body: <AssessmentPanel assessment={assessment} onClear={() => setAssessment(null)} />,
          },
        ]
        const open = columns.find((c) => c.id === active)
        return (
          <div className="flex flex-col gap-4 lg:flex-row">
            {open && (
              <CollapsibleColumn
                key={open.id}
                title={open.title}
                count={open.count}
                open
                onToggle={() => setActiveCol(open.id)}
                className="lg:flex-1"
              >
                {open.body}
              </CollapsibleColumn>
            )}
            {columns
              .filter((c) => c.id !== active)
              .map((c) => (
                <CollapsibleColumn
                  key={c.id}
                  title={c.title}
                  count={c.count}
                  open={false}
                  onToggle={() => setActiveCol(c.id)}
                  className="lg:w-12 lg:flex-none"
                >
                  {c.body}
                </CollapsibleColumn>
              ))}
          </div>
        )
      })()}

      <Panel title="Does the agent help?">
        <KpiPanel results={evalResults} busy={evaluating} onRun={runEval} />
      </Panel>

      <Panel title="Decision timeline">
        <DecisionTimeline records={records} />
      </Panel>
    </div>
  )
}
