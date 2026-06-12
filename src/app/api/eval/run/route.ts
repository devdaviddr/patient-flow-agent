import { NextResponse } from "next/server"
import { evaluate } from "@/eval"

export const dynamic = "force-dynamic"

// GET /api/eval/run -> with/without-agent KPIs for both scenarios (deterministic, fast)
export function GET() {
  return NextResponse.json(evaluate())
}
