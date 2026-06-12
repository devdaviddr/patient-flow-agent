"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../lib/auth"
import { Topbar } from "../components/shell/Topbar"
import { Sidebar } from "../components/shell/Sidebar"
import { ChatWidget } from "../components/ChatWidget"

const SIDEBAR_KEY = "pfo.sidebar"

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready) setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1")
  }, [ready])

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login")
  }, [ready, isAuthenticated, router])

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0")
      return next
    })

  if (!ready || !isAuthenticated) return null // avoid flash / redirecting

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
