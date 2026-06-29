"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { WorldState } from "@/sim"
import type { Assessment, DecisionRecord, Flag, Intervention } from "@/driver"
import type { EvalResult } from "@/eval"
import { useAuth } from "../lib/auth"
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

// An API call that failed at the HTTP layer (non-2xx). Carries a user-facing
// message parsed from the route's `{ error }` body so handlers can surface it
// instead of silently casting an error body to a domain type (#44).
class ApiError extends Error {}

async function errorMessage(r: Response): Promise<string> {
  try {
    const data = (await r.json()) as { error?: unknown }
    if (typeof data?.error === "string") return data.error
  } catch {
    /* body wasn't JSON — fall through to the status line */
  }
  return `Request failed (${r.status})`
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" })
  if (!r.ok) throw new ApiError(await errorMessage(r))
  return r.json() as Promise<T>
}
async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new ApiError(await errorMessage(r))
  return r.json() as Promise<T>
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

type ColId = "edqueue" | "discharge" | "proposed" | "flagged" | "assessment"

export default function DashboardPage() {
  const { user } = useAuth()
  // Mirror the server's operator tier (R7). The server (withPolicy) is the
  // authority; this only decides whether to render the operator controls so a
  // viewer isn't shown buttons that would 403 (#45).
  const canOperate = user?.role === "coordinator" || user?.role === "superadmin"

  const [world, setWorld] = useState<WorldState | null>(null)
  const [proposals, setProposals] = useState<Intervention[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [records, setRecords] = useState<DecisionRecord[]>([])
  const [evalResults, setEvalResults] = useState<EvalResult[] | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [assessNote, setAssessNote] = useState("")
  const [error, setError] = useState("")
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
    refresh().catch((e) => setError(msg(e)))
  }, [refresh])

  // Real-time playback: auto-advance the clock while playing. A step failure
  // (e.g. a lapsed session → 401) stops playback and surfaces, rather than
  // 403-ing silently every 3s (#44).
  useEffect(() => {
    if (!playing) return
    let active = true
    const id = setInterval(async () => {
      if (!active) return
      try {
        await postJSON("/api/sim/step")
        await refresh()
      } catch (e) {
        if (active) {
          setError(msg(e))
          setPlaying(false)
        }
      }
    }, 3000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [playing, refresh])

  const step = async () => {
    setBusy(true)
    setError("")
    try {
      await postJSON("/api/sim/step")
      await refresh()
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const noteIfError = (a: Assessment | null) => {
    if (a?.status === "error") setAssessNote(`Assess failed: ${a.error} (is opencode serve running?)`)
  }

  // Fallback when SSE is unavailable: poll the assessment to completion (#34/#43).
  const pollAssessment = async (): Promise<void> => {
    for (;;) {
      const a = await getJSON<Assessment | null>("/api/driver/assessment")
      setAssessment(a)
      if (!a || a.status !== "running") {
        noteIfError(a)
        return
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
  }

  // Stream the live assessment via SSE — one connection, server-pushed (#34). Falls
  // back to polling if EventSource can't connect.
  const streamAssessment = (): Promise<void> =>
    new Promise<void>((resolve) => {
      let settled = false
      let es: EventSource | null = null
      const finish = (fallback?: Promise<void>) => {
        if (settled) return
        settled = true
        es?.close()
        resolve(fallback ?? Promise.resolve())
      }
      try {
        es = new EventSource("/api/driver/assessment/stream")
      } catch {
        finish(pollAssessment())
        return
      }
      es.onmessage = (ev) => {
        const a = JSON.parse(ev.data) as Assessment | null
        setAssessment(a)
        if (!a || a.status !== "running") {
          noteIfError(a)
          finish()
        }
      }
      es.onerror = () => finish(pollAssessment())
    })

  // Kick off an assessment, then stream it to completion. try/finally guarantees the
  // spinner always clears — a transport/JSON throw used to leave the button stuck on
  // "Assessing…" forever (#43).
  const assess = async () => {
    setAssessing(true)
    setAssessNote("")
    setError("")
    setAssessment(null) // clear the previous run's log
    try {
      const kickoff = await fetch("/api/driver/assess", { method: "POST" })
      if (!kickoff.ok) throw new ApiError(await errorMessage(kickoff))
      await streamAssessment()
      await refresh()
    } catch (e) {
      setAssessNote(`Assess failed: ${msg(e)}`)
    } finally {
      setAssessing(false)
    }
  }

  const decide = async (path: string, interventionId: string) => {
    setBusy(true)
    setError("")
    try {
      await postJSON(path, { interventionId })
      await refresh()
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  const runEval = async () => {
    setEvaluating(true)
    setError("")
    try {
      setEvalResults(await getJSON<EvalResult[]>("/api/eval/run"))
    } catch (e) {
      setError(msg(e))
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Active Wards</h1>
          {assessNote && <p className="mt-1 text-xs text-blocked">{assessNote}</p>}
        </div>
        <ClockControls
          at={world?.at}
          busy={busy}
          assessing={assessing}
          assessed={!!assessment}
          playing={playing}
          canOperate={canOperate}
          onStep={step}
          onAssess={assess}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blocked/40 bg-blocked/10 px-3 py-2 text-xs text-blocked">
          <span>{error}</span>
          <button onClick={() => setError("")} className="shrink-0 underline hover:no-underline">
            dismiss
          </button>
        </div>
      )}

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
                  canOperate={canOperate}
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
        <KpiPanel results={evalResults} busy={evaluating} canOperate={canOperate} onRun={runEval} />
      </Panel>

      <Panel title="Decision timeline">
        <DecisionTimeline records={records} />
      </Panel>
    </div>
  )
}
