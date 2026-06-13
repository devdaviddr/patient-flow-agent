"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../lib/auth"
import { authGate } from "../lib/auth-gate"
import { Topbar } from "../components/shell/Topbar"
import { Sidebar } from "../components/shell/Sidebar"
import { ChatWidget } from "../components/ChatWidget"

const SIDEBAR_KEY = "pfo.sidebar"

export default function AppLayout({ children }: { children: ReactNode }) {
  // The default-deny middleware is the first gate, but it is OPTIMISTIC: it only
  // sees that a session cookie is present, not that it is valid. So a logout
  // (cookie cleared client-side, no navigation) or a stale cookie lands here
  // authenticated === false. We must actively redirect to /login — returning a
  // bare `null` would leave the visitor staring at a blank shell. See auth-gate.
  const { isAuthenticated, ready } = useAuth()
  const router = useRouter()
  const gate = authGate(ready, isAuthenticated)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (gate === "redirect") router.replace("/login")
  }, [gate, router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1")
  }, [ready])

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0")
      return next
    })

  if (gate !== "render") return null // loading, or redirecting to /login

  return (
    <div className="flex h-screen flex-col">
      <Topbar onToggleSidebar={toggle} />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} />
        <main className="scroll-area min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <ChatWidget />
    </div>
  )
}
