import type { Patient, WorldState } from "@/sim"

function hhmm(at: string): string {
  const d = new Date(at)
  return `${`${d.getUTCHours()}`.padStart(2, "0")}:${`${d.getUTCMinutes()}`.padStart(2, "0")}`
}

export function BedBoard({ world }: { world: WorldState | null }) {
  if (!world) return <div className="empty">Loading…</div>
  const byBed = new Map<string, Patient>()
  for (const p of world.patients) byBed.set(p.bedId, p)

  return (
    <div>
      {world.wards.map((ward) => {
        const beds = world.beds.filter((b) => b.wardId === ward.id)
        const free = beds.filter((b) => b.status === "empty_clean").length
        return (
          <div className="ward" key={ward.id}>
            <div className="ward-head">
              <span>{ward.name}</span>
              <span>{free} clean / {ward.bedCount}</span>
            </div>
            <div className="beds">
              {beds.map((bed) => {
                const p = bed.patientId ? byBed.get(bed.patientId) : undefined
                return (
                  <div className={`bed ${bed.status}`} key={bed.id}>
                    <div className="bid">{bed.id}</div>
                    {p ? (
                      <>
                        <div className="pid">{p.id}</div>
                        {p.predictedDischarge && (
                          <div className="when">→ {hhmm(p.predictedDischarge.at)}</div>
                        )}
                        {p.blocker !== "none" && (
                          <span className={`badge ${p.blocker}`}>{p.blocker.replace("_", " ")}</span>
                        )}
                      </>
                    ) : (
                      <div className="when">{bed.status.replace("empty_", "")}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="ed-queue">
        ED queue ({world.edQueue.length}):{" "}
        {world.edQueue.length === 0
          ? "—"
          : world.edQueue.map((id) => (
              <span className="chip" key={id}>{id}</span>
            ))}
      </div>
    </div>
  )
}
