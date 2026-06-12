import type { DecisionRecord } from "@/driver"

function hhmm(at: string): string {
  const d = new Date(at)
  return `${`${d.getUTCHours()}`.padStart(2, "0")}:${`${d.getUTCMinutes()}`.padStart(2, "0")}`
}

export function DecisionTimeline({ records }: { records: DecisionRecord[] }) {
  if (records.length === 0) {
    return <div className="empty">No decisions recorded yet.</div>
  }
  return (
    <div>
      {records.map((r, i) => (
        <div className="record" key={i}>
          <span className={`rtype ${r.type}`}>{r.type}</span>
          <span className="rtime">{hhmm(r.stateRef)}</span>
          <span>{r.rationale}</span>
        </div>
      ))}
    </div>
  )
}
