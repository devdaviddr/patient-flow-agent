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
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  COORDINATOR_USER,
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

// Invoke whichever HTTP verb the route exports, through withPolicy.
async function fireRoute(importPath: string, pathname: string): Promise<Response> {
  const mod = (await import(importPath)) as Record<string, unknown>
  const handler = (mod.POST ?? mod.GET ?? mod.PUT ?? mod.DELETE ?? mod.PATCH) as
    | ((req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response)
    | undefined
  if (!handler) throw new Error(`No HTTP handler exported from ${importPath}`)
  return handler(makeRequest(pathname), { params: Promise.resolve({}) })
}

describe("route discovery sanity", () => {
  it("finds the 18 on-disk api routes", () => {
    // 17 app routes + the Better Auth catch-all handler.
    expect(ROUTES.length).toBe(18)
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

describe("the guard lets the authorized caller through (A6)", () => {
  // For each protected route, the role that should be admitted.
  const cases: { pathname: string; importPath: string; as: MockUser; tier: PolicyTier }[] =
    PROTECTED.map((r) => {
      const tier = policyFor(r.pathname)
      return {
        pathname: r.pathname,
        importPath: r.importPath,
        // Operator routes need a coordinator; authenticated routes admit a viewer.
        as: tier === "operator" ? COORDINATOR_USER : VIEWER_USER,
        tier,
      }
    })

  it.each(cases)("$pathname admits the $tier caller (not 401/403)", async ({ pathname, importPath, as }) => {
    setSession(as)
    const res = await fireRoute(importPath, pathname)
    // The guard passed: the handler ran (it may 200/400/502 on its own merits, but
    // it is NOT an authn/authz refusal).
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
