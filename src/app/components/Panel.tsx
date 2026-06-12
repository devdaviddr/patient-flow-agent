import type { ReactNode } from "react"

export function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className ?? ""}`}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}
