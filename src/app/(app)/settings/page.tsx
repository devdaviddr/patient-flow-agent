"use client"

import { useState } from "react"
import { useAuth } from "../../lib/auth"
import { Panel } from "../../components/Panel"

export default function SettingsPage() {
  const { user } = useAuth()
  const [scenario, setScenario] = useState("normal-weekday")
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      await fetch("/api/sim/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      })
      setLoaded(scenario)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted">Demo configuration — synthetic data only.</p>
      </div>

      <Panel title="Scenario & seed">
        <p className="mb-3 text-sm text-muted">
          Load a fresh, seeded day. The same scenario always replays an identical day; loading resets
          the world and the decision log.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            disabled={busy}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="normal-weekday">normal-weekday (seed 42)</option>
            <option value="flu-surge">flu-surge (seed 7)</option>
          </select>
          <button
            disabled={busy}
            onClick={load}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load scenario"}
          </button>
          {loaded && <span className="text-xs text-clean">Loaded {loaded} ✓</span>}
        </div>
      </Panel>

      <Panel title="Reasoning model">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Active model</span>
          <span className="font-medium">opencode/big-pickle</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          OpenCode Zen free tier — no API key, no cost. Swappable to hosted Claude or local Ollama by
          editing the agent files in <code>.opencode/agents/</code>.
        </p>
      </Panel>

      <Panel title="Profile">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-white">
            {user?.initials}
          </div>
          <div>
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-muted">
              {user?.role} · {user?.email}
            </div>
          </div>
          <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            signed in
          </span>
        </div>
      </Panel>
    </div>
  )
}
