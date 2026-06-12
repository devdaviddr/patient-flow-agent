import type { Intervention } from "@/driver"

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
    return <div className="empty">No proposals yet — press Assess.</div>
  }
  return (
    <div>
      {proposals.map((iv) => {
        const decided = iv.status !== "proposed"
        return (
          <div className="card" key={iv.id}>
            <div className="type">{iv.type.replace("_", " ")} · {iv.targetPatientId}</div>
            <div className="meta">addresses gap: {iv.addressesGap} · impact {iv.impactScore.toFixed(2)}</div>
            <div className="impact"><span style={{ width: `${Math.round(iv.impactScore * 100)}%` }} /></div>
            <div className="rationale">{iv.rationale}</div>
            {decided ? (
              <div className={`status ${iv.status}`}>{iv.status}</div>
            ) : (
              <div className="card-actions">
                <button className="approve" disabled={busy} onClick={() => onApprove(iv.id)}>
                  Approve
                </button>
                <button className="reject" disabled={busy} onClick={() => onReject(iv.id)}>
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
