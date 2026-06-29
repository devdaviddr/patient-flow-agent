// Forecast route input validation (#49). Edge inputs must fail loud with a 400 at
// the boundary instead of producing nonsense (negative admissions, Invalid Date).
// The Better Auth server is mocked so the run is fast + offline; a viewer session
// clears the `authenticated` tier these read routes require.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { VIEWER_USER, mockAuth, setSession } from "./helpers/mock-session"

vi.mock("@/auth/auth", () => ({ auth: mockAuth }))

import type { NextRequest } from "next/server"
import { POST as demandPOST } from "@/app/api/sim/forecast/demand/route"
import { POST as dischargesPOST } from "@/app/api/sim/forecast/discharges/route"

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

const fire = (handler: Handler, body: unknown): Promise<Response> =>
  handler(
    new Request("http://localhost/api/sim/forecast/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({}) },
  )

beforeEach(() => setSession(VIEWER_USER))

describe("forecast route validation (#49)", () => {
  it("accepts a valid body", async () => {
    expect((await fire(demandPOST, { wardId: "4A", horizonHrs: 8 })).status).toBe(200)
  })
  it("defaults an empty/malformed body", async () => {
    expect((await fire(demandPOST, {})).status).toBe(200)
  })
  it("rejects a negative horizon (400)", async () => {
    expect((await fire(demandPOST, { horizonHrs: -5 })).status).toBe(400)
  })
  it("rejects a non-numeric horizon (400)", async () => {
    expect((await fire(demandPOST, { horizonHrs: "abc" })).status).toBe(400)
  })
  it("rejects an over-cap horizon (400)", async () => {
    expect((await fire(demandPOST, { horizonHrs: 1000 })).status).toBe(400)
  })
  it("rejects an unknown ward (400)", async () => {
    expect((await fire(demandPOST, { wardId: "ZZ" })).status).toBe(400)
  })
  it("validates the discharges route too", async () => {
    expect((await fire(dischargesPOST, { horizonHrs: -1 })).status).toBe(400)
    expect((await fire(dischargesPOST, { wardId: "4B", horizonHrs: 8 })).status).toBe(200)
  })
})
