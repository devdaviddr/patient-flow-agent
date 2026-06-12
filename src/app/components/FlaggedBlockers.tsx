import type { Flag } from "@/driver"

// Read-only: non-actionable blockers (allied_health, placement) the agent surfaced.
// No Approve/Reject — these have no one-click fix in v1 (R6).
export function FlaggedBlockers({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) {
    return <div className="text-sm text-muted">No non-actionable blockers.</div>
  }
  return (
    <div className="space-y-2">
      {flags.map((f, i) => (
        <div key={`${f.patientId}-${i}`} className="rounded-lg border border-border bg-surface p-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block rounded-full border px-1.5 py-px text-[10px] ${
                f.blocker === "placement"
                  ? "border-placement text-placement"
                  : "border-allied-health text-allied-health"
              }`}
            >
              {f.blocker.replace("_", " ")}
            </span>
            <span className="font-semibold">{f.patientId}</span>
            <span className="text-muted">· {f.wardId}</span>
          </div>
          <div className="mt-1 text-xs text-muted">{f.reason}</div>
        </div>
      ))}
    </div>
  )
}
