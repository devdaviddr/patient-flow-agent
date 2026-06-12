"use client"

import { Loader2, Pause, Play } from "lucide-react"
import { fmtDateTime } from "../lib/time"

export function ClockControls({
  at,
  busy,
  assessing,
  assessed,
  playing,
  onStep,
  onAssess,
  onTogglePlay,
}: {
  at: string | undefined
  busy: boolean
  assessing: boolean
  assessed: boolean
  playing: boolean
  onStep: () => void
  onAssess: () => void
  onTogglePlay: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm tabular-nums text-text">
        <span className="text-muted" aria-hidden>🕑</span>
        {fmtDateTime(at)}
      </span>
      <button
        onClick={onTogglePlay}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary disabled:opacity-50"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        disabled={busy}
        onClick={onStep}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary disabled:opacity-50"
      >
        Step 30m
      </button>
      <button
        disabled={busy || assessing}
        onClick={onAssess}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
      >
        {assessing && <Loader2 size={15} className="animate-spin" />}
        {assessing ? "Assessing…" : assessed ? "Re-assess" : "Assess"}
      </button>
    </div>
  )
}
