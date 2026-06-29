import { NextResponse } from "next/server"
import { withPolicy } from "@/auth/withPolicy"

export const dynamic = "force-dynamic"

// GET /api/agent/models -> the models OpenCode actually has configured, as
// provider/model choices (#75). Empty array if the harness is unreachable, so the
// Settings picker degrades to free-text. Operator-only (it's part of AI config).
export const GET = withPolicy("operator", async () => {
  const { listModels } = await import("@/driver/adapter")
  return NextResponse.json(await listModels())
})
