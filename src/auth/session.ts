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
// session), so it authenticates with a shared service token instead. The token is
// a credential ONLY on the agent's READ endpoints below — never the mutating sim
// routes (/actions/*, /step, /scenario), nor the driver/admin/account routes. This
// is what keeps R7 structural: the agent can perceive + forecast, but the only path
// to a bed change is the driver's human-approval gate (Driver.approve()). Default-
// deny — any path not in this set is not a credential (falls through to the session
// check → 401). A new agent read tool must add its endpoint here.
const SIM_SERVICE_READONLY_PATHS = new Set<string>([
  "/api/sim/state",
  "/api/sim/forecast/discharges",
  "/api/sim/forecast/demand",
])
const SERVICE_TOKEN_HEADER = "x-sim-service-token"
// Least-privileged synthetic principal: the token grants READ access to the sim
// only, so the principal carries `viewer` (authenticated, non-operator). It can
// never clear an operator check, so even a future route misclassification can't
// hand the agent a mutating endpoint — belt-and-braces with the allow-list above.
export const SIM_SERVICE_PRINCIPAL: SessionUser = {
  id: "svc-agent",
  name: "Agent (service)",
  role: "viewer",
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
  if (!SIM_SERVICE_READONLY_PATHS.has(pathname)) return null
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
// token (scoped to the read-only sim routes) counts as authenticated — it returns a
// viewer-level principal, so the read-tier sim routes admit it; the operator-tier
// mutating routes do not (the path isn't a credential there → 401).
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
