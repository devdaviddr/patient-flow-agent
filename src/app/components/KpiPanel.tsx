import type { EvalResult } from "@/eval"

function Metric({
  label,
  withA,
  without,
  lowerBetter,
}: {
  label: string
  withA: number
  without: number
  lowerBetter: boolean
}) {
  const helps = lowerBetter ? withA < without : withA > without
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <span>
        with <b>{withA}</b> · without {without}{" "}
        <span className={helps ? "text-clean" : "text-blocked"}>{helps ? "✓" : "✗"}</span>
      </span>
    </div>
  )
}

export function KpiPanel({
  results,
  busy,
  onRun,
}: {
  results: EvalResult[] | null
  busy: boolean
  onRun: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={onRun}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary disabled:opacity-50"
        >
          {busy ? "Running eval…" : "Run eval"}
        </button>
        <span className="text-xs text-muted">deterministic · with vs without agent</span>
      </div>
      {!results ? (
        <div className="mt-2.5 text-xs text-muted">
          Access-block hours (lower better) · End-of-day headroom (higher better)
        </div>
      ) : (
        results.map((r) => (
          <div key={r.scenario} className="mt-2.5 rounded-lg border border-border bg-surface-2 p-3">
            <div className="mb-1 text-sm font-semibold">{r.scenario}</div>
            <Metric
              label="access-block hours"
              withA={r.withAgent.accessBlockHours}
              without={r.withoutAgent.accessBlockHours}
              lowerBetter
            />
            <Metric
              label="end-of-day headroom"
              withA={r.withAgent.endOfDayHeadroom}
              without={r.withoutAgent.endOfDayHeadroom}
              lowerBetter={false}
            />
          </div>
        ))
      )}
    </div>
  )
}
