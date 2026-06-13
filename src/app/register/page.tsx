"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

// Public, invite-gated sign-up (spec B1). Posts to /api/register; on success the
// response carries the session cookie, so we land straight on the dashboard. The
// server returns one non-leaky error for every failure mode, which we surface as-is.

export default function RegisterPage() {
  const router = useRouter()
  const [inviteKey, setInviteKey] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteKey, name: name || undefined, email, password }),
      })
      if (res.ok) {
        router.replace("/")
        return
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? "Could not create an account.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-3">
        <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <span className="text-2xl" aria-hidden>🏥</span>
            <span className="text-lg font-semibold tracking-tight">Patient Flow Orchestrator</span>
          </div>
          <p className="mb-6 text-sm text-muted">
            Create an account with an invite key. Synthetic, demo-only — no real data.
          </p>

          <label className="mb-1 block text-sm text-muted">Invite key</label>
          <input
            type="text"
            required
            autoComplete="off"
            placeholder="XXXXX-XXXXX-XXXXX-…"
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            value={inviteKey}
            onChange={(e) => setInviteKey(e.target.value)}
          />

          <label className="mb-1 block text-sm text-muted">Name (optional)</label>
          <input
            type="text"
            autoComplete="name"
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="mb-1 block text-sm text-muted">Email</label>
          <input
            type="email"
            autoComplete="username"
            required
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="mb-1 block text-sm text-muted">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p role="alert" className="mb-4 text-sm text-blocked">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
