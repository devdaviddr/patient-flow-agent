import { NextResponse } from "next/server"
import { withPolicy } from "@/auth/withPolicy"
import { recentAuthEvents } from "@/auth/audit"

export const dynamic = "force-dynamic"

// GET /api/admin/audit -> recent auth events (sign-in, role change, account deletion,
// admin actions). Superadmin-only — the administrative trace (#28).
export const GET = withPolicy("superadmin", () => {
  return NextResponse.json(recentAuthEvents(50))
})
