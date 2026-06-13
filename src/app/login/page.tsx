"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "../lib/auth"
import {
  COORDINATOR_EMAIL,
  COORDINATOR_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from "@/auth/demo-credentials"

// The two seeded demo accounts (A11). Passwords are committed demo-only values —
// they guard nothing real (synthetic `.test` accounts, no PII). Click-to-fill so
// a reviewer can sign in as either role in one click.
const DEMO_ACCOUNTS = [
  { label: "Coordinator", role: "approves / rejects · runs the agent", email: COORDINATOR_EMAIL, password: COORDINATOR_PASSWORD },
  { label: "Viewer", role: "read-only", email: VIEWER_EMAIL, password: VIEWER_PASSWORD },
] as const

export default function LoginPage() {
  const { login, isAuthenticated, ready } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/")
  }, [ready, isAuthenticated, router])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email, password)
      if (result.ok) {
        router.replace("/")
      } else {
        setError(result.error)
      }
    } finally {
      setBusy(false)
    }
  }

  const fill = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email)
    setPassword(account.password)
    setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm space-y-3">
        <form
          onSubmit={submit}
          className="rounded-xl border border-border bg-surface p-8 shadow-sm"
        >
          <div className="mb-6 flex items-center gap-2">
            <span className="text-2xl" aria-hidden>🏥</span>
            <span className="text-lg font-semibold tracking-tight">Patient Flow Orchestrator</span>
          </div>
          <p className="mb-6 text-sm text-muted">Sign in to continue.</p>

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
            autoComplete="current-password"
            required
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Demo accounts
          </div>
          <p className="mb-3 text-xs text-muted">
            Synthetic, demo-only — click to fill the form, then sign in.
          </p>
          <p className="mb-3 text-xs text-muted">
            Have an invite key?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create an account
            </Link>
            .
          </p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fill(account)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-surface-2"
              >
                <span>
                  <span className="font-medium">{account.label}</span>
                  <span className="text-muted"> · {account.role}</span>
                  <span className="block text-muted">{account.email}</span>
                </span>
                <span className="shrink-0 text-muted">Fill</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
