import { NextResponse } from "next/server"
import { withPolicy } from "@/auth/withPolicy"
import { count, remaining } from "@/auth/invite"

export const dynamic = "force-dynamic"

// Invite overview for the admin area (spec B4). Superadmin-only: how many of the
// seeded keys remain unclaimed. Only aggregate counts — never the keys themselves
// (the DB holds hashes; plaintext was emitted once at seed).
export const GET = withPolicy("superadmin", async () => {
  const total = count()
  const left = remaining()
  return NextResponse.json({ total, remaining: left, used: total - left })
})
