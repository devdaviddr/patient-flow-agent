import { NextResponse } from "next/server"
import { getDriver } from "@/driver"

export const dynamic = "force-dynamic"

// POST /api/driver/assess -> kick off an assessment in the background; returns
// immediately. Poll GET /api/driver/assessment for live progress + the agent's log.
export function POST() {
  return NextResponse.json(getDriver().startAssessment())
}
