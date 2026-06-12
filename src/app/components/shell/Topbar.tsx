"use client"

import { PanelLeft } from "lucide-react"
import { useAuth } from "../../lib/auth"

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user } = useAuth()
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"
        >
          <PanelLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🏥</span>
          <span className="font-semibold tracking-tight">Patient Flow Orchestrator</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium leading-tight">{user?.name}</div>
          <div className="text-xs text-muted leading-tight">{user?.role}</div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          {user?.initials}
        </div>
      </div>
    </header>
  )
}
