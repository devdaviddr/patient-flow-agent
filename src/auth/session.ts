// Authoritative server-side session validation + the role-hierarchy guards
// (spec A4/A6/A7). This is the *sole* authoritative check — middleware only does
// an optimistic cookie-presence test. Route handlers run in the Node runtime,
// where better-sqlite3 (and therefore this validation) works.

import { auth } from "./auth"
import type { Role } from "./schema"

// The minimal identity the app threads around (e.g. onto DecisionRecord.actor).
export interface SessionUser {
  id: string
  name: string
  role: Role
}

// Role hierarchy: viewer(0) < coordinator(1). Guards compare ranks so adding a
// higher tier later (0.5.0 superadmin) is a one-line change.
const RANK: Record<Role, number> = { viewer: 0, coordinator: 1 }

// Thrown by the require* guards; withPolicy turns it into the response below.
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message)
    this.name = "AuthError"
  }
}

// Validate the session against the DB-backed store. Returns the identity, or
// null when there is no valid session. Never throws on "not signed in".
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const result = await auth.api.getSession({ headers: req.headers })
  if (!result) return null
  const { user } = result
  // `role` is typed optional (the additional field is non-required), but the DB
  // column is NOT NULL with a default; fall back to the least-privileged tier.
  const role: Role = user.role ?? "viewer"
  return { id: user.id, name: user.name, role }
}

// Any authenticated user; throws 401 otherwise.
export async function requireAuth(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req)
  if (!user) throw new AuthError(401, "Authentication required")
  return user
}

// Coordinator or above (the R7 mutating / agent-run tier); throws 403 otherwise.
export async function requireOperator(req: Request): Promise<SessionUser> {
  const user = await requireAuth(req)
  if (RANK[user.role] < RANK.coordinator) {
    throw new AuthError(403, "Coordinator role required")
  }
  return user
}
