"use client"

import { useCallback, useEffect, useState } from "react"
import type { WorldState } from "@/sim"
import type { DecisionRecord, Flag, Intervention } from "@/driver"
import type { EvalResult } from "@/eval"
import { BedBoard } from "../components/BedBoard"
import { ApprovalCards } from "../components/ApprovalCards"
import { FlaggedBlockers } from "../components/FlaggedBlockers"
import { DecisionTimeline } from "../components/DecisionTimeline"
import { KpiPanel } from "../components/KpiPanel"
import { QuestionBox } from "../components/QuestionBox"
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
  const [answer, setAnswer] = useState("")
  const [busy, setBusy] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

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
    try {
      const plan = await postJSON<{ error?: string }>("/api/driver/plan")
      if (plan.error) setAnswer(`Assess failed: ${plan.error} (is opencode serve running?)`)
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

  const ask = async (question: string) => {
    setAsking(true)
    setAnswer("")
    try {
      const res = await postJSON<{ answer?: string; error?: string }>("/api/driver/ask", { question })
      setAnswer(res.answer ?? `Ask failed: ${res.error} (is opencode serve running?)`)
    } finally {
      setAsking(false)
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
        </div>
        <ClockControls
          at={world?.at}
          busy={busy}
          assessing={assessing}
          onStep={step}
          onAssess={assess}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Bed-board" className="lg:col-span-2">
          <BedBoard world={world} />
        </Panel>

        <div className="space-y-4">
          <Panel title="Proposed interventions">
            <ApprovalCards
              proposals={proposals}
              busy={busy}
              onApprove={(id) => decide("/api/driver/approve", id)}
              onReject={(id) => decide("/api/driver/reject", id)}
            />
            <FlaggedBlockers flags={flags} />
          </Panel>
          <Panel title="Flow KPIs">
            <KpiPanel results={evalResults} busy={evaluating} onRun={runEval} />
          </Panel>
          <Panel title="Ask">
            <QuestionBox busy={asking} answer={answer} onAsk={ask} />
          </Panel>
        </div>
      </div>

      <Panel title="Decision timeline">
        <DecisionTimeline records={records} />
      </Panel>
    </div>
  )
}
