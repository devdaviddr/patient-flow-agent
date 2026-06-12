"use client"

import { useState } from "react"

export function QuestionBox({
  busy,
  answer,
  onAsk,
}: {
  busy: boolean
  answer: string
  onAsk: (q: string) => void
}) {
  const [q, setQ] = useState("")
  return (
    <div>
      <textarea
        rows={2}
        placeholder="Ask… e.g. what's tonight looking like? why is 4B blocked?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2">
        <button
          disabled={busy || !q.trim()}
          onClick={() => onAsk(q.trim())}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </div>
      {answer && <div className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>}
    </div>
  )
}
