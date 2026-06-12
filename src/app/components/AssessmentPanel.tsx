"use client"

import { Loader2, X } from "lucide-react"
import type { Assessment } from "@/driver"
import { fmtClock, fmtClockTime } from "../lib/time"

const STATUS = {
  running: { label: "running", cls: "bg-primary-weak text-primary" },
  done: { label: "done", cls: "bg-clean/10 text-clean" },
  error: { label: "error", cls: "bg-blocked/10 text-blocked" },
} as const

export function AssessmentPanel({
  assessment,
  onClear,
}: {
  assessment: Assessment | null
  onClear: () => void
}) {
  if (!assessment) {
    return (
      <div className="text-sm text-muted">
        No assessment yet — press <span className="font-medium">Assess</span> to watch the agent work.
      </div>
    )
  }
  const s = STATUS[assessment.status]
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Started</span>
        <span className="font-medium tabular-nums">{fmtClock(assessment.startedAt)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
        {assessment.status === "done" && (
          <span className="text-muted">
            · {assessment.interventions} proposed · {assessment.flags} flagged
          </span>
        )}
        {assessment.status !== "running" && (
          <button
            onClick={onClear}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      <div className="scroll-area mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-5">
        {assessment.log.length === 0 ? (
          <div className="text-muted">waiting for the agent…</div>
        ) : (
          assessment.log.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-muted">{fmtClockTime(l.at)}</span>
              <span className="text-text">{l.text}</span>
            </div>
          ))
        )}
        {assessment.status === "running" && (
          <div className="mt-1 flex items-center gap-1.5 text-muted">
            <Loader2 size={12} className="animate-spin" /> working…
          </div>
        )}
      </div>
    </div>
  )
}
