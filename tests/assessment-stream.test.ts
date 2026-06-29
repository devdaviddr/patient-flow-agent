// Assessment SSE stream (#34). Verifies the endpoint emits a text/event-stream and
// closes cleanly when no assessment is running. Better Auth is mocked; a temp DB
// backs the driver's record store.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"
import { VIEWER_USER, mockAuth, setSession } from "./helpers/mock-session"

vi.mock("@/auth/auth", () => ({ auth: mockAuth }))

import type { NextRequest } from "next/server"

let temp: TempAuthDb
let GET: typeof import("@/app/api/driver/assessment/stream/route").GET

beforeAll(async () => {
  temp = setupTempAuthDb()
  ;({ GET } = await import("@/app/api/driver/assessment/stream/route"))
})
afterAll(() => temp.cleanup())

describe("assessment SSE stream (#34)", () => {
  it("emits an event-stream and closes when no assessment is running", async () => {
    setSession(VIEWER_USER)
    const req = new Request("http://localhost/api/driver/assessment/stream") as unknown as NextRequest
    const res = await GET(req, { params: Promise.resolve({}) })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    // With no running assessment the stream sends one snapshot then closes, so
    // reading to completion resolves (no hang) and carries an SSE data frame.
    const body = await res.text()
    expect(body).toContain("data:")
  })

  it("refuses an unauthenticated caller (401)", async () => {
    setSession(null)
    const req = new Request("http://localhost/api/driver/assessment/stream") as unknown as NextRequest
    const res = await GET(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(401)
  })
})
