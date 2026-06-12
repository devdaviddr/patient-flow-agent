"use client"

import { useState } from "react"

function stamp(at: string | undefined): string {
  if (!at) return "—"
  const d = new Date(at)
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z"
}

export function ClockControls({
  at,
  busy,
  assessing,
  onStep,
  onAssess,
  onScenario,
}: {
  at: string | undefined
  busy: boolean
  assessing: boolean
  onStep: () => void
  onAssess: () => void
  onScenario: (scenario: string) => void
}) {
  const [scenario, setScenario] = useState("normal-weekday")
  return (
    <div className="controls">
      <span className="clock">🕑 {stamp(at)}</span>
      <button disabled={busy} onClick={onStep}>Step 30m</button>
      <button className="primary" disabled={busy || assessing} onClick={onAssess}>
        {assessing ? "Assessing…" : "Assess"}
      </button>
      <select value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={busy}>
        <option value="normal-weekday">normal-weekday</option>
        <option value="flu-surge">flu-surge</option>
      </select>
      <button disabled={busy} onClick={() => onScenario(scenario)}>Load</button>
    </div>
  )
}
