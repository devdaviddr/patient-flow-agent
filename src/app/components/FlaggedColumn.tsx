"use client"

import { ChevronRight } from "lucide-react"
import type { Flag } from "@/driver"
import { FlaggedBlockers } from "./FlaggedBlockers"

export function FlaggedColumn({
  flags,
  open,
  onToggle,
  className,
}: {
  flags: Flag[]
  open: boolean
  onToggle: () => void
  className?: string
}) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        title="Expand flagged"
        className={`flex items-center justify-center rounded-xl border border-border bg-surface py-4 hover:border-primary ${className ?? ""}`}
      >
        <span className="rotate-180 text-xs font-medium uppercase tracking-wide text-muted [writing-mode:vertical-rl]">
          Flagged ({flags.length})
        </span>
      </button>
    )
  }
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Flagged — no one-click fix ({flags.length})
        </h2>
        <button
          onClick={onToggle}
          title="Collapse"
          aria-label="Collapse flagged"
          className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="scroll-area max-h-[560px] overflow-y-auto pr-1">
        <FlaggedBlockers flags={flags} />
      </div>
    </section>
  )
}
