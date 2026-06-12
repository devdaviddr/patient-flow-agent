"use client"

import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"

// A dashboard column that collapses to a thin vertical "Title (N)" banner; clicking
// the banner expands it. Used for Proposed interventions and Flagged.
export function CollapsibleColumn({
  title,
  count,
  open,
  onToggle,
  className,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  className?: string
  children: ReactNode
}) {
  const label = count === undefined ? title : `${title} (${count})`

  if (!open) {
    return (
      <button
        onClick={onToggle}
        title={`Expand — ${label}`}
        className={`flex items-center justify-center rounded-xl border border-border bg-surface py-4 hover:border-primary ${className ?? ""}`}
      >
        <span className="rotate-180 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted [writing-mode:vertical-rl]">
          {label}
        </span>
      </button>
    )
  }

  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{label}</h2>
        <button
          onClick={onToggle}
          title="Collapse"
          aria-label={`Collapse ${title}`}
          className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {children}
    </section>
  )
}
