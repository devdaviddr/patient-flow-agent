// Test helper: a controllable stand-in for the Better Auth server instance.
//
// The route guards (src/auth/session.ts) call `auth.api.getSession({ headers })`
// as the SOLE authoritative session check. Tests mock the `@/auth/auth` module
// with `mockAuth` so they can drive the session a request resolves to without a
// real DB / cookie / crypto round-trip. Synthetic identities only (no real PII).

import { vi } from "vitest"
import type { Role } from "@/auth/schema"

export interface MockUser {
  id: string
  name: string
  role: Role
}

// The synthetic identities the enumeration / guard tests sign in as.
export const VIEWER_USER: MockUser = { id: "u-viewer", name: "V. Viewer", role: "viewer" }
export const COORDINATOR_USER: MockUser = {
  id: "u-coordinator",
  name: "Dr. A. Coordinator",
  role: "coordinator",
}

// The current session the mocked `auth.api.getSession` will return. `null` = no
// session (an unauthenticated request). Tests set this before firing a request.
let currentUser: MockUser | null = null

export function setSession(user: MockUser | null): void {
  currentUser = user
}

// A minimal mock matching the shape session.ts reads: getSession resolves to
// `{ session, user } | null`, where `user` carries `id`, `name`, and `role`.
export const mockAuth = {
  api: {
    getSession: vi.fn(async () => {
      if (!currentUser) return null
      return {
        session: { id: "s-1", userId: currentUser.id },
        user: { ...currentUser },
      }
    }),
  },
  handler: vi.fn(),
}
