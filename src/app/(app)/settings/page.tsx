"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../../lib/auth"
import { Panel } from "../../components/Panel"

// Mirrors src/driver/agent-config.ts (kept local so the client bundle doesn't import
// the server's DB-backed module).
interface AgentConfig {
  model: string
  systemPrompt: string | null
  planInstruction: string
  promptTimeoutMs: number
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const canOperate = user?.role === "coordinator" || user?.role === "superadmin"
  const router = useRouter()
  const [scenario, setScenario] = useState("normal-weekday")
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)

  // Self-service account management (spec B6).
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  // AI configuration (#56) — operator-only; the server is the authority.
  const [cfg, setCfg] = useState<AgentConfig | null>(null)
  const [cfgBusy, setCfgBusy] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!canOperate) return
    fetch("/api/agent/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: AgentConfig | null) => c && setCfg(c))
      .catch(() => {})
  }, [canOperate])

  const saveConfig = async () => {
    if (!cfg) return
    setCfgBusy(true)
    setCfgMsg(null)
    try {
      const res = await fetch("/api/agent/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      })
      const body = (await res.json()) as AgentConfig & { error?: string }
      if (res.ok) {
        setCfg(body)
        setCfgMsg({ ok: true, text: "Saved." })
      } else {
        setCfgMsg({ ok: false, text: body.error ?? "Could not save." })
      }
    } finally {
      setCfgBusy(false)
    }
  }

  const resetConfig = async () => {
    setCfgBusy(true)
    setCfgMsg(null)
    try {
      const res = await fetch("/api/agent/config", { method: "DELETE" })
      if (res.ok) {
        setCfg((await res.json()) as AgentConfig)
        setCfgMsg({ ok: true, text: "Reset to defaults." })
      }
    } finally {
      setCfgBusy(false)
    }
  }

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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    setPwBusy(true)
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPwMsg({ ok: true, text: "Password changed." })
        setCurrentPassword("")
        setNewPassword("")
      } else {
        setPwMsg({ ok: false, text: "Could not change password. Check your current password." })
      }
    } finally {
      setPwBusy(false)
    }
  }

  const deleteAccount = async () => {
    setDelError(null)
    setDelBusy(true)
    try {
      const res = await fetch("/api/account", { method: "DELETE" })
      if (res.ok) {
        await logout()
        router.replace("/login")
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setDelError(body?.error ?? "Could not delete your account.")
    } finally {
      setDelBusy(false)
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

      <Panel title="AI configuration">
        {!canOperate ? (
          <p className="text-sm text-muted">
            The AI configuration is managed by coordinators. Default model:{" "}
            <span className="font-medium">opencode/big-pickle</span> (OpenCode Zen free tier).
          </p>
        ) : !cfg ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Retune the agent at runtime — applied on the next assessment, no redeploy. Custom prompts
              are checked for disallowed wording before saving.
            </p>
            <div>
              <label className="mb-1 block text-sm text-muted">Model (provider/model)</label>
              <input
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                value={cfg.model}
                onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                list="model-presets"
              />
              <datalist id="model-presets">
                <option value="opencode/big-pickle" />
                <option value="anthropic/claude-sonnet-4-5" />
                <option value="anthropic/claude-haiku-4-5" />
                <option value="ollama/llama3.1" />
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">
                System prompt override (blank = the built-in agent prompt)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                value={cfg.systemPrompt ?? ""}
                onChange={(e) => setCfg({ ...cfg, systemPrompt: e.target.value || null })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">Plan instruction</label>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                value={cfg.planInstruction}
                onChange={(e) => setCfg({ ...cfg, planInstruction: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted">Prompt timeout (ms)</label>
              <input
                type="number"
                min={1000}
                className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                value={cfg.promptTimeoutMs}
                onChange={(e) => setCfg({ ...cfg, promptTimeoutMs: Number(e.target.value) })}
              />
            </div>
            {cfgMsg && (
              <p role="alert" className={`text-sm ${cfgMsg.ok ? "text-clean" : "text-blocked"}`}>
                {cfgMsg.text}
              </p>
            )}
            <div className="flex gap-2">
              <button
                disabled={cfgBusy}
                onClick={saveConfig}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {cfgBusy ? "Saving…" : "Save"}
              </button>
              <button
                disabled={cfgBusy}
                onClick={resetConfig}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}
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

      <Panel title="Change password">
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">New password (8+ characters)</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {pwMsg && (
            <p role="alert" className={`text-sm ${pwMsg.ok ? "text-clean" : "text-blocked"}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwBusy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pwBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </Panel>

      <Panel title="Delete account">
        <p className="mb-3 text-sm text-muted">
          Permanently deletes your account and signs you out. Prior decisions you approved are kept
          for the audit trail. The last superadmin account cannot be deleted.
        </p>
        {delError && (
          <p role="alert" className="mb-3 text-sm text-blocked">
            {delError}
          </p>
        )}
        {confirming ? (
          <div className="flex gap-2">
            <button
              onClick={deleteAccount}
              disabled={delBusy}
              className="rounded-lg bg-blocked px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {delBusy ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={delBusy}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-blocked/60 px-3 py-1.5 text-sm font-medium text-blocked hover:bg-blocked/10"
          >
            Delete my account
          </button>
        )}
      </Panel>
    </div>
  )
}
