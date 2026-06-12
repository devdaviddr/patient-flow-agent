"use client"

import { useCallback, useEffect, useState } from "react"
import type { WorldState } from "@/sim"
import type { DecisionRecord, Flag, Intervention } from "@/driver"
import type { EvalResult } from "@/eval"
import { BedBoard } from "./components/BedBoard"
import { ApprovalCards } from "./components/ApprovalCards"
import { FlaggedBlockers } from "./components/FlaggedBlockers"
import { DecisionTimeline } from "./components/DecisionTimeline"
import { KpiPanel } from "./components/KpiPanel"
import { QuestionBox } from "./components/QuestionBox"
import { ClockControls } from "./components/ClockControls"

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

export default function Home() {
  const [world, setWorld] = useState<WorldState | null>(null)
  const [proposals, setProposals] = useState<Intervention[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [answer, setAnswer] = useState("")
  const [evalResults, setEvalResults] = useState<EvalResult[] | null>(null)
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
    // Initial async load — setState runs after the await, not synchronously in the effect.
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

  const loadScenario = async (scenario: string) => {
    setBusy(true)
    try {
      await postJSON("/api/sim/scenario", { scenario })
      setProposals([])
      setFlags([])
      setAnswer("")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const assess = async () => {
    setAssessing(true)
    try {
      const plan = await postJSON<{ interventions?: Intervention[]; error?: string }>("/api/driver/plan")
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
    <main className="app">
      <div className="header">
        <div>
          <h1>🏥 Patient Flow Orchestrator</h1>
          <div className="sub">Perceive → reason → plan → act · synthetic data · human-approved</div>
        </div>
        <ClockControls
          at={world?.at}
          busy={busy}
          assessing={assessing}
          onStep={step}
          onAssess={assess}
          onScenario={loadScenario}
        />
      </div>

      <div className="grid">
        <div className="panel">
          <h2>Bed-board</h2>
          <BedBoard world={world} />
        </div>

        <div>
          <div className="panel">
            <h2>Proposed interventions</h2>
            <ApprovalCards
              proposals={proposals}
              busy={busy}
              onApprove={(id) => decide("/api/driver/approve", id)}
              onReject={(id) => decide("/api/driver/reject", id)}
            />
            <FlaggedBlockers flags={flags} />
          </div>
          <div className="panel">
            <h2>Flow KPIs</h2>
            <KpiPanel results={evalResults} busy={evaluating} onRun={runEval} />
          </div>
          <div className="panel">
            <h2>Ask</h2>
            <QuestionBox busy={asking} answer={answer} onAsk={ask} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Decision timeline</h2>
        <DecisionTimeline records={records} />
      </div>
    </main>
  )
}
