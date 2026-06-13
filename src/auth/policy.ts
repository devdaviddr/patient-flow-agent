// Central route → required-tier map (spec A7/A13). Every on-disk /api route is
// classified here; an unmapped route falls back to the most restrictive tier
// (`operator`) so a forgotten route fails closed. The enforcing enumeration test
// asserts every app/api/**/route.ts has an EXPLICIT entry — hitting the default
// fails CI — and fires unauth/wrong-role probes to prove the guard executes.

export type PolicyTier = "public" | "authenticated" | "operator"

// Fail-closed default for any route without an explicit classification.
export const DEFAULT_TIER: PolicyTier = "operator"

// Keys are URL pathnames (the route's on-disk path under app/, sans the
// route.ts segment). Catch-all routes use their static prefix; see policyFor.
export const ROUTE_POLICY: Record<string, PolicyTier> = {
  // Operator (coordinator): state changes + agent/model runs (R7).
  "/api/driver/approve": "operator",
  "/api/driver/reject": "operator",
  "/api/driver/assess": "operator",
  "/api/driver/plan": "operator",
  "/api/sim/actions/expedite_script": "operator",
  "/api/sim/actions/request_transport": "operator",
  "/api/sim/step": "operator",
  "/api/sim/scenario": "operator",
  "/api/eval/run": "operator",

  // Authenticated (any role): read-only views + read-only Q&A + forecasts.
  "/api/sim/state": "authenticated",
  "/api/driver/records": "authenticated",
  "/api/driver/proposals": "authenticated",
  "/api/driver/flags": "authenticated",
  "/api/driver/assessment": "authenticated",
  "/api/driver/ask": "authenticated",
  "/api/sim/forecast/demand": "authenticated",
  "/api/sim/forecast/discharges": "authenticated",

  // Public: Better Auth's own endpoints (sign-in/out/session). Catch-all prefix.
  "/api/auth": "public",
}

// Resolve a pathname to its tier. The Better Auth handler is a catch-all under
// /api/auth/*, so anything beneath that prefix inherits the public tier; every
// other route resolves by exact pathname, falling back to the fail-closed default.
export function policyFor(pathname: string): PolicyTier {
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "public"
  return ROUTE_POLICY[pathname] ?? DEFAULT_TIER
}
