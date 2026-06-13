// Authoritative server-side session validation + the role-hierarchy guards
// (spec A4/A6/A7). This is the *sole* authoritative check — middleware only does
// an optimistic cookie-presence test. Route handlers run in the Node runtime,
// where better-sqlite3 (and therefore this validation) works.

import { timingSafeEqual } from "node:crypto"
import { auth } from "./auth"
import type { Role } from "./schema"

// The minimal identity the app threads around (e.g. onto DecisionRecord.actor).
export interface SessionUser {
  id: string
  name: string
  role: Role
}

// The OpenCode agent reaches the simulator surface server-to-server (no browser
// session), so it authenticates with a shared service token instead. This is the
// trusted-agent path the auth layer otherwise (correctly) walls off; it is scoped
// to /api/sim/* ONLY — never the driver, admin, or account routes — so a leaked
// token can perceive/act on the synthetic sim but cannot touch attribution, user
// administration, or accounts. Presents as an operator-level synthetic principal.
const SIM_PATH_PREFIX = "/api/sim"
const SERVICE_TOKEN_HEADER = "x-sim-service-token"
export const SIM_SERVICE_PRINCIPAL: SessionUser = {
  id: "svc-agent",
  name: "Agent (service)",
  role: "coordinator",
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function simServiceCaller(req: Request): SessionUser | null {
  const token = process.env.SIM_SERVICE_TOKEN
  if (!token) return null
  const presented = req.headers.get(SERVICE_TOKEN_HEADER)
  if (!presented || !constantTimeEqual(presented, token)) return null
  const { pathname } = new URL(req.url)
  if (pathname !== SIM_PATH_PREFIX && !pathname.startsWith(`${SIM_PATH_PREFIX}/`)) return null
  return SIM_SERVICE_PRINCIPAL
}

// Role hierarchy: viewer(0) < coordinator(1) < superadmin(2). Guards compare ranks.
const RANK: Record<Role, number> = { viewer: 0, coordinator: 1, superadmin: 2 }

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

// Any authenticated user; throws 401 otherwise. The trusted agent's sim service
// token (scoped to /api/sim/*) counts as authenticated — it returns an operator-
// level principal, so the operator-tier sim routes admit it too.
export async function requireAuth(req: Request): Promise<SessionUser> {
  const service = simServiceCaller(req)
  if (service) return service
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

// Superadmin only (the administration tier, 0.5.0); throws 403 otherwise. This is
// the independent assertion gating /api/auth/admin/* so the admin plugin is never
// the sole authority (B7, decision 7).
export async function requireSuperadmin(req: Request): Promise<SessionUser> {
  const user = await requireAuth(req)
  if (RANK[user.role] < RANK.superadmin) {
    throw new AuthError(403, "Superadmin role required")
  }
  return user
}
