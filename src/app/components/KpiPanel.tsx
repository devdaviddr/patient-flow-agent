import type { EvalResult } from "@/eval"

const SCENARIO_LABEL: Record<string, string> = {
  "normal-weekday": "Normal weekday",
  "flu-surge": "Flu surge (busier day)",
}

function Metric({
  label,
  hint,
  withA,
  without,
  suffix = "",
  lowerBetter,
}: {
  label: string
  hint: string
  withA: number
  without: number
  suffix?: string
  lowerBetter: boolean
}) {
  const helps = lowerBetter ? withA < without : withA > without
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <div>
        <div className="text-text">{label}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <div className="whitespace-nowrap text-right">
        <span className="text-muted">with agent </span>
        <b>
          {withA}
          {suffix}
        </b>
        <span className="text-muted"> · without </span>
        {without}
        {suffix}{" "}
        <span className={helps ? "text-clean" : "text-blocked"}>{helps ? "✓" : "✗"}</span>
      </div>
    </div>
  )
}

export function KpiPanel({
  results,
  busy,
  canOperate,
  onRun,
}: {
  results: EvalResult[] | null
  busy: boolean
  canOperate: boolean
  onRun: () => void
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Running the eval is an operator action (server-enforced) — hidden for viewers. */}
        {canOperate && (
          <button
            disabled={busy}
            onClick={onRun}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary disabled:opacity-50"
          >
            {busy ? "Running…" : "Run the comparison"}
          </button>
        )}
        <span className="text-xs text-muted">
          Replays the same day twice — with the agent helping, and without it.
        </span>
      </div>

      {!results ? (
        <div className="mt-2.5 text-xs text-muted">
          Two simple measures: how long patients wait for a bed (lower is better), and how many spare,
          ready beds are left at the end of the day (higher is better).
        </div>
      ) : (
        results.map((r) => {
          const helped =
            r.withAgent.accessBlockHours < r.withoutAgent.accessBlockHours &&
            r.withAgent.endOfDayHeadroom > r.withoutAgent.endOfDayHeadroom
          return (
            <div key={r.scenario} className="mt-2.5 rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  {SCENARIO_LABEL[r.scenario] ?? r.scenario}
                </div>
                {helped && (
                  <span className="rounded-full bg-clean/10 px-2 py-0.5 text-[11px] font-medium text-clean">
                    Agent helped
                  </span>
                )}
              </div>
              <Metric
                label="Time patients waited for a bed"
                hint="lower is better"
                withA={r.withAgent.accessBlockHours}
                without={r.withoutAgent.accessBlockHours}
                suffix="h"
                lowerBetter
              />
              <Metric
                label="Spare ready beds at day's end"
                hint="higher is better"
                withA={r.withAgent.endOfDayHeadroom}
                without={r.withoutAgent.endOfDayHeadroom}
                lowerBetter={false}
              />
            </div>
          )
        })
      )}
    </div>
  )
}
