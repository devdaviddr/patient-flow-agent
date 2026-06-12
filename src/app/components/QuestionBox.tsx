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
    <div className="qa">
      <textarea
        rows={2}
        placeholder="Ask… e.g. what's tonight looking like? why is 4B blocked?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="card-actions">
        <button disabled={busy || !q.trim()} onClick={() => onAsk(q.trim())}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </div>
      {answer && <div className="answer">{answer}</div>}
    </div>
  )
}
