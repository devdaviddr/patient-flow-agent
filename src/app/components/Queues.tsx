import type { WorldState } from "@/sim"
import { patientName, patientUr } from "@/sim"
import { fmtTime } from "../lib/time"

const BLOCKER_STYLE: Record<string, string> = {
  pharmacy_script: "text-pharmacy-script border-pharmacy-script",
  transport: "text-transport border-transport",
  allied_health: "text-allied-health border-allied-health",
  placement: "text-placement border-placement",
}

// Patients waiting in ED for an inpatient bed.
export function EdQueue({ world }: { world: WorldState | null }) {
  const queue = world?.edQueue ?? []
  if (queue.length === 0) {
    return <div className="text-sm text-muted">No one waiting in ED.</div>
  }
  return (
    <div className="scroll-area grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
      {queue.map((id, i) => (
        <div
          key={`${id}-${i}`}
          className="rounded-lg border border-l-4 border-border border-l-dirty bg-surface p-2.5"
        >
          <div className="truncate text-sm font-semibold">{patientName(id)}</div>
          <div className="text-[11px] text-muted">{patientUr(id)}</div>
          <div className="mt-0.5 text-xs text-muted">waiting for a bed</div>
        </div>
      ))}
    </div>
  )
}

// Patients with a predicted discharge — who's expected to leave, soonest first,
// and what (if anything) is holding them up.
export function DischargeQueue({ world }: { world: WorldState | null }) {
  if (!world) return <div className="text-sm text-muted">Loading…</div>
  const patients = world.patients
    .filter((p) => p.predictedDischarge)
    .sort(
      (a, b) =>
        new Date(a.predictedDischarge!.at).getTime() -
        new Date(b.predictedDischarge!.at).getTime(),
    )
  if (patients.length === 0) {
    return <div className="text-sm text-muted">No discharges expected.</div>
  }
  return (
    <div className="scroll-area grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
      {patients.map((p) => {
        const ready = p.predictedDischarge!.ready
        return (
          <div
            key={p.id}
            className={`rounded-lg border border-l-4 border-border bg-surface p-2.5 ${
              ready ? "border-l-clean" : "border-l-blocked"
            }`}
          >
            <div className="truncate text-sm font-semibold">{p.name}</div>
            <div className="text-[11px] text-muted">
              {p.ur} · {p.bedId}
            </div>
            <div className="mt-0.5 text-xs text-muted">→ {fmtTime(p.predictedDischarge!.at)}</div>
            {ready ? (
              <span className="mt-1 inline-block rounded-full border border-clean px-1.5 py-px text-[10px] text-clean">
                ready
              </span>
            ) : (
              <span
                className={`mt-1 inline-block rounded-full border px-1.5 py-px text-[10px] ${BLOCKER_STYLE[p.blocker]}`}
              >
                {p.blocker.replace("_", " ")}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
