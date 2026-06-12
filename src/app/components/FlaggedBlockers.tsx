import type { Flag } from "@/driver"

// Read-only: non-actionable blockers (allied_health, placement) the agent surfaced.
// No Approve/Reject — these have no one-click fix in v1 (R6).
export function FlaggedBlockers({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        Flagged — no one-click fix
      </div>
      <div className="space-y-1.5">
        {flags.map((f, i) => (
          <div key={`${f.patientId}-${i}`} className="text-xs text-muted">
            <span
              className={`mr-1 inline-block rounded-full border px-1.5 py-px text-[10px] ${
                f.blocker === "placement"
                  ? "border-placement text-placement"
                  : "border-allied-health text-allied-health"
              }`}
            >
              {f.blocker.replace("_", " ")}
            </span>
            <span className="font-semibold text-text">{f.patientId}</span> · {f.wardId} — {f.reason}
          </div>
        ))}
      </div>
    </div>
  )
}
