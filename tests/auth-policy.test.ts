// Enforcing enumeration test (spec A7/A13). The two things it proves:
//
//   1. EXPLICIT classification — every on-disk app/api/**/route.ts has an explicit
//      entry in policy.ts. A route that falls through to the fail-closed `operator`
//      DEFAULT (i.e. no explicit entry) FAILS this test, so a forgotten route can't
//      silently ship behind the default.
//
//   2. The guard actually EXECUTES — for each non-public route we fire a real
//      request through the exported handler: unauthenticated → 401, a viewer hitting
//      an operator route → 403, and an authorized caller → NOT 401/403 (the guard
//      lets it through; the handler may then 200/400/502 on its own).
//
// The Better Auth server is mocked so the run is fast, offline, and deterministic.

import { readdirSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  COORDINATOR_USER,
  SUPERADMIN_USER,
  VIEWER_USER,
  mockAuth,
  setSession,
  type MockUser,
} from "./helpers/mock-session"

vi.mock("@/auth/auth", () => ({ auth: mockAuth }))

// The agent-run routes (plan/assess/ask) reach for the OpenCode SDK over the
// network. We aren't testing the agent here — only that the guard lets the
// authorized caller THROUGH — so stub the adapter to fail fast instead of hanging
// on a socket. The routes catch this and return 502 (still not 401/403).
vi.mock("@/driver/adapter", () => {
  const fail = async () => {
    throw new Error("adapter stubbed in tests")
  }
  return {
    promptOrchestrator: fail,
    askOrchestrator: fail,
    planViaOrchestrator: fail,
    planViaOrchestratorLogged: fail,
  }
})

import { DEFAULT_TIER, ROUTE_POLICY, policyFor, type PolicyTier } from "@/auth/policy"
import { SIM_SERVICE_PRINCIPAL } from "@/auth/session"
import { getSimulator } from "@/sim"

const API_ROOT = join(process.cwd(), "src", "app", "api")

// A discovered route: its on-disk dir relative to app/api, the URL pathname guards
// resolve against, and the absolute import path of its route module.
interface DiscoveredRoute {
  pathname: string
  importPath: string
}

// Walk app/api for every route.ts and derive its URL pathname. Next App Router
// dynamic segments ([...all]) are catch-alls — policyFor special-cases /api/auth.
function discoverRoutes(): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = []
  const walk = (absDir: string, segments: string[]): void => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, entry.name)
      if (entry.isDirectory()) {
        walk(abs, [...segments, entry.name])
      } else if (entry.name === "route.ts") {
        out.push({
          pathname: "/api/" + segments.join("/"),
          importPath: abs,
        })
      }
    }
  }
  walk(API_ROOT, [])
  return out
}

const ROUTES = discoverRoutes()

// Make a same-origin request (no Origin/Referer header) so the custom routes'
// CSRF check treats it as same-origin and the guard outcome is what's under test.
function makeRequest(pathname: string): Request {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
}

// Invoke whichever HTTP verb the route exports, through withPolicy. A handler that
// PASSES its guard may then fail on a dependency the guard test doesn't stand up
// (no migrated DB, mocked auth.$context) — that throw is NOT an authz refusal, so we
// surface it as a 500. The guard outcomes under test (401/403, or admitted) are what
// matter; withPolicy returns its refusals as Responses, never throws.
async function fireRoute(importPath: string, pathname: string): Promise<Response> {
  const mod = (await import(importPath)) as Record<string, unknown>
  const handler = (mod.POST ?? mod.GET ?? mod.PUT ?? mod.DELETE ?? mod.PATCH) as
    | ((req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response)
    | undefined
  if (!handler) throw new Error(`No HTTP handler exported from ${importPath}`)
  try {
    return await handler(makeRequest(pathname), { params: Promise.resolve({}) })
  } catch {
    return new Response(null, { status: 500 })
  }
}

describe("route discovery sanity", () => {
  it("finds the 24 on-disk api routes", () => {
    // 23 app routes (+2 action routes for allied_health/placement, #35) + the
    // Better Auth catch-all handler.
    expect(ROUTES.length).toBe(24)
  })
})

describe("explicit classification — no route relies on the fail-closed default (A7/A13)", () => {
  it.each(ROUTES)("$pathname has an explicit policy entry", ({ pathname }) => {
    const isAuthCatchAll = pathname === "/api/auth" || pathname.startsWith("/api/auth/")
    const explicit = isAuthCatchAll || pathname in ROUTE_POLICY
    expect(
      explicit,
      `${pathname} has no explicit entry in ROUTE_POLICY and would silently fall through to the ` +
        `DEFAULT_TIER ("${DEFAULT_TIER}"). Add an explicit classification in src/auth/policy.ts.`,
    ).toBe(true)
  })
})

// The protected (non-public) routes we actually fire probes at.
const PROTECTED = ROUTES.filter((r) => policyFor(r.pathname) !== "public")
const OPERATOR_ROUTES = PROTECTED.filter((r) => policyFor(r.pathname) === "operator")
const SUPERADMIN_ROUTES = PROTECTED.filter((r) => policyFor(r.pathname) === "superadmin")

beforeEach(() => {
  setSession(null)
})

describe("the guard executes — unauthenticated is refused 401 (A13)", () => {
  it.each(PROTECTED)("$pathname → 401 with no session", async ({ pathname, importPath }) => {
    setSession(null)
    const res = await fireRoute(importPath, pathname)
    expect(res.status).toBe(401)
  })
})

describe("the guard executes — a viewer hitting an operator route is refused 403 (A6)", () => {
  it.each(OPERATOR_ROUTES)("$pathname → 403 for a viewer", async ({ pathname, importPath }) => {
    setSession(VIEWER_USER)
    const res = await fireRoute(importPath, pathname)
    expect(res.status).toBe(403)
  })
})

describe("the guard executes — a non-superadmin hitting a superadmin route is refused 403 (B7)", () => {
  it.each(SUPERADMIN_ROUTES)("$pathname → 403 for a viewer", async ({ pathname, importPath }) => {
    setSession(VIEWER_USER)
    expect((await fireRoute(importPath, pathname)).status).toBe(403)
  })
  it.each(SUPERADMIN_ROUTES)("$pathname → 403 for a coordinator", async ({ pathname, importPath }) => {
    setSession(COORDINATOR_USER)
    expect((await fireRoute(importPath, pathname)).status).toBe(403)
  })
})

describe("the guard lets the authorized caller through (A6)", () => {
  // For each protected route, the role that should be admitted.
  const cases: { pathname: string; importPath: string; as: MockUser; tier: PolicyTier }[] =
    PROTECTED.map((r) => {
      const tier = policyFor(r.pathname)
      return {
        pathname: r.pathname,
        importPath: r.importPath,
        // Superadmin routes need a superadmin; operator routes a coordinator;
        // authenticated routes admit a viewer.
        as:
          tier === "superadmin"
            ? SUPERADMIN_USER
            : tier === "operator"
              ? COORDINATOR_USER
              : VIEWER_USER,
        tier,
      }
    })

  it.each(cases)("$pathname admits the $tier caller (not 401/403)", async ({ pathname, importPath, as }) => {
    setSession(as)
    const res = await fireRoute(importPath, pathname)
    // The guard passed: the handler ran (it may 200/400/500/502 on its own merits,
    // but it is NOT an authn/authz refusal).
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

// The admin-plugin CRUD lives under the /api/auth/[...all] catch-all, so the
// discovery loop above can't probe it per-endpoint. Fire the catch-all directly at
// an admin path to prove the independent superadmin gate (decision 7, B7).
describe("admin-plugin endpoints are independently gated to superadmin (B7)", () => {
  const authRoute = ROUTES.find((r) => r.pathname.startsWith("/api/auth"))
  const fireAdmin = async (user: MockUser | null): Promise<Response> => {
    setSession(user)
    const mod = (await import(authRoute!.importPath)) as { GET: (req: Request) => Promise<Response> }
    return mod.GET(new Request("http://localhost/api/auth/admin/list-users", { method: "GET" }))
  }

  it("unauthenticated → 401", async () => {
    expect((await fireAdmin(null)).status).toBe(401)
  })
  it("viewer → 403", async () => {
    expect((await fireAdmin(VIEWER_USER)).status).toBe(403)
  })
  it("coordinator → 403", async () => {
    expect((await fireAdmin(COORDINATOR_USER)).status).toBe(403)
  })
  it("superadmin → delegated, not refused (not 401/403)", async () => {
    const res = await fireAdmin(SUPERADMIN_USER)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

// Fix A + #42: the OpenCode agent reaches the auth-gated sim API server-to-server
// with a shared service token (it has no browser session). The token is a credential
// ONLY on the agent's read-only sim routes — never the mutating ones (/actions/*,
// /step, /scenario) — so the human-approval gate (Driver.approve()) is the SOLE path
// to a bed change (R7), and the token stays worthless off the sim path entirely.
describe("agent → sim service token (read-only sim routes only)", () => {
  const TOKEN = "test-sim-service-token-deadbeef"
  const original = process.env.SIM_SERVICE_TOKEN

  beforeAll(() => {
    process.env.SIM_SERVICE_TOKEN = TOKEN
  })
  afterAll(() => {
    if (original === undefined) delete process.env.SIM_SERVICE_TOKEN
    else process.env.SIM_SERVICE_TOKEN = original
  })

  const fire = async (pathname: string, token: string | null): Promise<Response> => {
    setSession(null) // no browser session — the token is the only credential
    const route = ROUTES.find((r) => r.pathname === pathname)
    const mod = (await import(route!.importPath)) as Record<string, unknown>
    const isGet = typeof mod.GET === "function"
    const handler = (mod.GET ?? mod.POST) as (
      req: Request,
      ctx: { params: Promise<Record<string, string>> },
    ) => Promise<Response>
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (token !== null) headers["x-sim-service-token"] = token
    const req = new Request(`http://localhost${pathname}`, {
      method: isGet ? "GET" : "POST",
      headers,
      body: isGet ? undefined : "{}",
    })
    try {
      return await handler(req, { params: Promise.resolve({}) })
    } catch {
      return new Response(null, { status: 500 })
    }
  }

  // G1 — the three read endpoints the agent's perceive + forecast tools call are admitted.
  const READ_ROUTES = [
    "/api/sim/state",
    "/api/sim/forecast/discharges",
    "/api/sim/forecast/demand",
  ]
  it.each(READ_ROUTES)("admits the agent to read route %s (not 401/403)", async (path) => {
    const res = await fire(path, TOKEN)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it("a wrong token is refused 401", async () => {
    expect((await fire("/api/sim/state", "wrong-token")).status).toBe(401)
  })
  it("no token is refused 401", async () => {
    expect((await fire("/api/sim/state", null)).status).toBe(401)
  })

  // G2 — the token is NOT a credential on the mutating sim routes: the only writer is
  // Driver.approve()'s human gate. Each is refused with the valid token + no session.
  const MUTATING_ROUTES = [
    "/api/sim/actions/expedite_script",
    "/api/sim/actions/request_transport",
    "/api/sim/actions/page_allied_health",
    "/api/sim/actions/request_placement",
    "/api/sim/step",
    "/api/sim/scenario",
  ]
  it.each(MUTATING_ROUTES)("refuses the service token on mutating route %s (401)", async (path) => {
    expect((await fire(path, TOKEN)).status).toBe(401)
  })

  it("a refused action leaves sim state unchanged", async () => {
    const before = JSON.stringify(getSimulator().getState())
    await fire("/api/sim/actions/expedite_script", TOKEN)
    expect(JSON.stringify(getSimulator().getState())).toBe(before)
  })

  // G3 — still worthless off the sim path entirely.
  it("the token is worthless off the sim path — driver stays 401", async () => {
    expect((await fire("/api/driver/approve", TOKEN)).status).toBe(401)
  })

  // G4 — least privilege: the principal is viewer, never operator. A bump back to
  // `coordinator` (which would re-open the gate) trips here. See spec/agent-gate/.
  it("the service principal is least-privileged (viewer)", () => {
    expect(SIM_SERVICE_PRINCIPAL.role).toBe("viewer")
  })
})
