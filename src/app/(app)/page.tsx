"use client"

import { useCallback, useEffect, useState } from "react"
import type { WorldState } from "@/sim"
import type { DecisionRecord, Flag, Intervention } from "@/driver"
import type { EvalResult } from "@/eval"
import { BedBoard } from "../components/BedBoard"
import { ApprovalCards } from "../components/ApprovalCards"
import { FlaggedColumn } from "../components/FlaggedColumn"
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

export default function DashboardPage() {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [proposals, setProposals] = useState<Intervention[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [evalResults, setEvalResults] = useState<EvalResult[] | null>(null)
  const [assessNote, setAssessNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [flaggedOpen, setFlaggedOpen] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlaggedOpen(localStorage.getItem("pfo.flagged") !== "0")
  }, [])

  const toggleFlagged = () =>
    setFlaggedOpen((o) => {
      const next = !o
      localStorage.setItem("pfo.flagged", next ? "1" : "0")
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
    try {
      const plan = await postJSON<{ error?: string }>("/api/driver/plan")
      if (plan.error) setAssessNote(`Assess failed: ${plan.error} (is opencode serve running?)`)
      await refresh()
    } finally {
      setAssessing(false)
    }
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
          playing={playing}
          onStep={step}
          onAssess={assess}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Panel title="Bed-board" className="lg:flex-[5]">
          <BedBoard world={world} />
        </Panel>

        <Panel title={`Proposed interventions (${proposals.length})`} className="lg:flex-[4]">
          <div className="scroll-area max-h-[560px] overflow-y-auto pr-1">
            <ApprovalCards
              proposals={proposals}
              busy={busy}
              onApprove={(id) => decide("/api/driver/approve", id)}
              onReject={(id) => decide("/api/driver/reject", id)}
            />
          </div>
        </Panel>

        <FlaggedColumn
          flags={flags}
          open={flaggedOpen}
          onToggle={toggleFlagged}
          className={flaggedOpen ? "lg:flex-[3]" : "lg:w-12 lg:flex-none"}
        />
      </div>

      <Panel title="Flow KPIs">
        <KpiPanel results={evalResults} busy={evaluating} onRun={runEval} />
      </Panel>

      <Panel title="Decision timeline">
        <DecisionTimeline records={records} />
      </Panel>
    </div>
  )
}
