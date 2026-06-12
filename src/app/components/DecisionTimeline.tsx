import type { DecisionRecord } from "@/driver"
import { fmtDateTime } from "../lib/time"
import { humanizeText } from "../lib/humanize"

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  gap: { label: "Shortfall", cls: "text-dirty" },
  plan: { label: "Plan", cls: "text-primary" },
  action: { label: "Action", cls: "text-clean" },
}

export function DecisionTimeline({ records }: { records: DecisionRecord[] }) {
  if (records.length === 0) {
    return <div className="text-sm text-muted">No decisions recorded yet.</div>
  }
  return (
    <div className="divide-y divide-border">
      {records.map((r, i) => {
        const t = TYPE_LABEL[r.type] ?? { label: r.type, cls: "text-muted" }
        return (
          <div key={i} className="flex gap-3 py-2.5 text-xs">
            <span className={`w-20 shrink-0 text-[11px] font-semibold ${t.cls}`}>{t.label}</span>
            <span className="w-32 shrink-0 tabular-nums text-muted">{fmtDateTime(r.stateRef)}</span>
            <span className="leading-5 text-text">{humanizeText(r.rationale)}</span>
          </div>
        )
      })}
    </div>
  )
}
