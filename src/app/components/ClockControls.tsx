"use client"

function stamp(at: string | undefined): string {
  if (!at) return "—"
  return new Date(at).toISOString().slice(0, 16).replace("T", " ") + "Z"
}

export function ClockControls({
  at,
  busy,
  assessing,
  onStep,
  onAssess,
}: {
  at: string | undefined
  busy: boolean
  assessing: boolean
  onStep: () => void
  onAssess: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm tabular-nums text-muted">🕑 {stamp(at)}</span>
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
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {assessing ? "Assessing…" : "Assess"}
      </button>
    </div>
  )
}
