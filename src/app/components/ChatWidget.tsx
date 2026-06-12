"use client"

import { useState } from "react"
import { MessageSquare, Send, X } from "lucide-react"

interface Msg {
  role: "user" | "assistant"
  text: string
}

// A floating assistant. A sticky button (bottom-right) toggles a chat overlay that
// asks the orchestrator plain-language questions about the live picture (R9).
export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])

  const send = async () => {
    const question = q.trim()
    if (!question || busy) return
    setMsgs((m) => [...m, { role: "user", text: question }])
    setQ("")
    setBusy(true)
    try {
      const r = await fetch("/api/driver/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const d = await r.json()
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          text: d.answer ?? `Ask failed: ${d.error} (is opencode serve running?)`,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Ask the assistant"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:opacity-90"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[60vh] max-h-[560px] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">Ask the assistant</div>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-text">
              <X size={18} />
            </button>
          </div>

          <div className="scroll-area flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="text-sm text-muted">
                Ask about the live picture — e.g. “what&apos;s tonight looking like?” or “why is 4B
                blocked?”
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${
                    m.role === "user" ? "bg-primary text-white" : "bg-surface-2 text-text"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-muted">Thinking…</div>}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Ask…"
                className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={send}
                disabled={busy || !q.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
