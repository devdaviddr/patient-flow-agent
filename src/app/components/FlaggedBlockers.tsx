import type { Flag } from "@/driver"

// Read-only: non-actionable blockers (allied_health, placement) the agent surfaced.
// No Approve/Reject — these have no one-click fix in v1 (R6).
export function FlaggedBlockers({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="flagged">
      <div className="flagged-head">Flagged — no one-click fix</div>
      {flags.map((f, i) => (
        <div className="flag" key={`${f.patientId}-${i}`}>
          <span className={`badge ${f.blocker}`}>{f.blocker.replace("_", " ")}</span>{" "}
          <b>{f.patientId}</b> · {f.wardId} — {f.reason}
        </div>
      ))}
    </div>
  )
}
