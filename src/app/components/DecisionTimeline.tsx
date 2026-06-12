import type { DecisionRecord } from "@/driver"

function hhmm(at: string): string {
  const d = new Date(at)
  return `${`${d.getUTCHours()}`.padStart(2, "0")}:${`${d.getUTCMinutes()}`.padStart(2, "0")}`
}

const TYPE_STYLE: Record<string, string> = {
  gap: "text-dirty",
  plan: "text-primary",
  action: "text-clean",
}

export function DecisionTimeline({ records }: { records: DecisionRecord[] }) {
  if (records.length === 0) {
    return <div className="text-sm text-muted">No decisions recorded yet.</div>
  }
  return (
    <div className="divide-y divide-border">
      {records.map((r, i) => (
        <div key={i} className="flex gap-3 py-2 text-xs">
          <span
            className={`w-16 shrink-0 text-[10px] font-medium uppercase tracking-wide ${TYPE_STYLE[r.type] ?? "text-muted"}`}
          >
            {r.type}
          </span>
          <span className="w-14 shrink-0 tabular-nums text-muted">{hhmm(r.stateRef)}</span>
          <span className="text-text">{r.rationale}</span>
        </div>
      ))}
    </div>
  )
}
