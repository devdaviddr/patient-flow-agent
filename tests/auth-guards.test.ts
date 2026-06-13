// Unit behaviour of the role-hierarchy guards (spec A4/A6). getSessionUser is the
// sole authoritative session check; requireAuth/requireOperator build on it. The
// underlying Better Auth server is mocked so these stay fast + deterministic and
// never touch a DB or the network.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { COORDINATOR_USER, VIEWER_USER, mockAuth, setSession } from "./helpers/mock-session"

vi.mock("@/auth/auth", () => ({ auth: mockAuth }))

import { AuthError, getSessionUser, requireAuth, requireOperator } from "@/auth/session"

const emptyReq = () => new Request("http://localhost/api/x")

beforeEach(() => {
  setSession(null)
})

describe("getSessionUser", () => {
  it("returns null when there is no session", async () => {
    setSession(null)
    expect(await getSessionUser(emptyReq())).toBeNull()
  })

  it("returns the identity for a valid session", async () => {
    setSession(COORDINATOR_USER)
    expect(await getSessionUser(emptyReq())).toEqual(COORDINATOR_USER)
  })
})

describe("requireAuth", () => {
  it("throws 401 when unauthenticated", async () => {
    setSession(null)
    await expect(requireAuth(emptyReq())).rejects.toMatchObject({ status: 401 })
    await expect(requireAuth(emptyReq())).rejects.toBeInstanceOf(AuthError)
  })

  it("returns either role when authenticated", async () => {
    setSession(VIEWER_USER)
    expect(await requireAuth(emptyReq())).toEqual(VIEWER_USER)
  })
})

describe("requireOperator", () => {
  it("throws 401 when unauthenticated", async () => {
    setSession(null)
    await expect(requireOperator(emptyReq())).rejects.toMatchObject({ status: 401 })
  })

  it("throws 403 for a viewer", async () => {
    setSession(VIEWER_USER)
    await expect(requireOperator(emptyReq())).rejects.toMatchObject({ status: 403 })
  })

  it("returns the user for a coordinator", async () => {
    setSession(COORDINATOR_USER)
    expect(await requireOperator(emptyReq())).toEqual(COORDINATOR_USER)
  })
})
