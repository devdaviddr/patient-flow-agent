import type { Intervention } from "@/driver"
import { patientName, patientUr } from "@/sim"
import { humanizeTimes } from "../lib/time"

const ACTION_TITLE: Record<string, string> = {
  expedite_script: "Chase pharmacy",
  request_transport: "Arrange transport",
}

const ACTION_EXPLANATION: Record<string, string> = {
  expedite_script:
    "This patient is ready to leave but is waiting on pharmacy. Approving asks pharmacy to prioritise it so the bed frees up sooner.",
  request_transport:
    "This patient is ready to leave but is waiting on transport. Approving arranges transport so the bed frees up sooner.",
}

export function ApprovalCards({
  proposals,
  busy,
  onApprove,
  onReject,
}: {
  proposals: Intervention[]
  busy: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  if (proposals.length === 0) {
    return <div className="text-sm text-muted">No proposals yet — press Assess.</div>
  }
  return (
    <div className="space-y-2.5">
      {proposals.map((iv) => {
        const decided = iv.status !== "proposed"
        return (
          <div
            key={iv.id}
            className="rounded-xl border border-border bg-surface p-3.5 shadow-sm transition hover:shadow"
          >
            <div className="text-sm font-semibold">
              {ACTION_TITLE[iv.type] ?? iv.type.replace("_", " ")} ·{" "}
              {patientName(iv.targetPatientId)} ({patientUr(iv.targetPatientId)})
            </div>
            <div className="mt-0.5 text-xs text-muted">
              addresses gap: {iv.addressesGap} · impact {iv.impactScore.toFixed(2)}
            </div>
            <div className="my-1.5 h-1 overflow-hidden rounded bg-border">
              <span
                className="block h-full bg-clean"
                style={{ width: `${Math.round(iv.impactScore * 100)}%` }}
              />
            </div>
            {ACTION_EXPLANATION[iv.type] && (
              <div className="text-xs">{ACTION_EXPLANATION[iv.type]}</div>
            )}
            <div className="mt-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Agent&apos;s reasoning
              </div>
              <div className="text-xs text-muted">{humanizeTimes(iv.rationale)}</div>
            </div>
            {decided ? (
              <div
                className={`mt-1 text-xs ${
                  iv.status === "executed"
                    ? "text-clean"
                    : iv.status === "rejected"
                      ? "text-blocked"
                      : "text-muted"
                }`}
              >
                {iv.status}
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => onApprove(iv.id)}
                  className="rounded-lg border border-clean px-3 py-1.5 text-xs font-medium text-clean hover:bg-clean/10 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busy}
                  onClick={() => onReject(iv.id)}
                  className="rounded-lg border border-blocked px-3 py-1.5 text-xs font-medium text-blocked hover:bg-blocked/10 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
