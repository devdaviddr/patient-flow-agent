import { getDriver } from "@/driver"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/driver/assessment/stream -> Server-Sent Events of the live assessment
// (#34). The browser opens one connection and the server pushes each log line +
// status change, replacing the 1.2s poll. Closes when the assessment finishes.
export const GET = withPolicy("authenticated", () => {
  const driver = getDriver()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (): void => {
        if (closed) return
        const a = driver.assessment()
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(a)}\n\n`))
        if (!a || a.status !== "running") {
          closed = true
          unsubscribe()
          controller.close()
        }
      }
      // Push the current snapshot immediately, then on every change.
      const unsubscribe = driver.subscribeAssessment(send)
      send()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  })
})
