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
    <div className="metric">
      <span className="mlabel">{label}</span>
      <span className="mval">
        with <b>{withA}</b> · without {without}{" "}
        <span className={helps ? "delta good" : "delta bad"}>{helps ? "✓" : "✗"}</span>
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
      <div className="card-actions">
        <button disabled={busy} onClick={onRun}>
          {busy ? "Running eval…" : "Run eval"}
        </button>
        <span className="empty">deterministic · with vs without agent</span>
      </div>
      {!results ? (
        <div className="empty" style={{ marginTop: 10 }}>
          Access-block hours (lower better) · End-of-day headroom (higher better)
        </div>
      ) : (
        results.map((r) => (
          <div className="eval-scenario" key={r.scenario}>
            <div className="eval-head">{r.scenario}</div>
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
