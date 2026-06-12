import type { Patient, WorldState } from "@/sim"
import { fmtTime } from "../lib/time"

const STATUS_ACCENT: Record<string, string> = {
  occupied: "border-l-occupied",
  empty_clean: "border-l-clean",
  empty_dirty: "border-l-dirty",
  blocked: "border-l-blocked",
}

const BLOCKER_STYLE: Record<string, string> = {
  pharmacy_script: "text-pharmacy-script border-pharmacy-script",
  transport: "text-transport border-transport",
  allied_health: "text-allied-health border-allied-health",
  placement: "text-placement border-placement",
}

export function BedBoard({ world }: { world: WorldState | null }) {
  if (!world) return <div className="text-sm text-muted">Loading…</div>
  const byBed = new Map<string, Patient>()
  for (const p of world.patients) byBed.set(p.bedId, p)

  return (
    <div className="space-y-5">
      {world.wards.map((ward) => {
        const beds = world.beds.filter((b) => b.wardId === ward.id)
        const free = beds.filter((b) => b.status === "empty_clean").length
        return (
          <div key={ward.id}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{ward.name}</span>
              <span className="text-muted">
                {free} clean / {ward.bedCount}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {beds.map((bed) => {
                const p = bed.patientId ? byBed.get(bed.patientId) : undefined
                return (
                  <div
                    key={bed.id}
                    className={`min-h-[68px] rounded-lg border border-l-4 border-border bg-surface p-2 text-xs ${STATUS_ACCENT[bed.status]}`}
                  >
                    <div className="text-[10px] text-muted">{bed.id}</div>
                    {p ? (
                      <>
                        <div className="mt-0.5 font-semibold">{p.id}</div>
                        {p.predictedDischarge && (
                          <div className="text-muted">→ {fmtTime(p.predictedDischarge.at)}</div>
                        )}
                        {p.blocker !== "none" && (
                          <span
                            className={`mt-1 inline-block rounded-full border px-1.5 py-px text-[10px] ${BLOCKER_STYLE[p.blocker]}`}
                          >
                            {p.blocker.replace("_", " ")}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="mt-0.5 text-muted">{bed.status.replace("empty_", "")}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="text-sm text-muted">
        ED queue ({world.edQueue.length}):{" "}
        {world.edQueue.length === 0 ? (
          "—"
        ) : (
          world.edQueue.map((id) => (
            <span
              key={id}
              className="mr-1 inline-block rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs text-text"
            >
              {id}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
