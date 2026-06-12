"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MOCK_USER, useAuth } from "../lib/auth"

export default function LoginPage() {
  const { login, isAuthenticated, ready } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState(MOCK_USER.email)
  const [password, setPassword] = useState("demo")

  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/")
  }, [ready, isAuthenticated, router])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login()
    router.replace("/")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>🏥</span>
          <span className="text-lg font-semibold tracking-tight">Patient Flow Orchestrator</span>
        </div>
        <p className="mb-6 text-sm text-muted">Sign in to continue. (Demo — any credentials work.)</p>

        <label className="mb-1 block text-sm text-muted">Email</label>
        <input
          className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="mb-1 block text-sm text-muted">Password</label>
        <input
          type="password"
          className="mb-6 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
