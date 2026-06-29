// Central route → required-tier map (spec A7/A13). Every on-disk /api route is
// classified here; an unmapped route falls back to the most restrictive tier
// (`operator`) so a forgotten route fails closed. The enforcing enumeration test
// asserts every app/api/**/route.ts has an EXPLICIT entry — hitting the default
// fails CI — and fires unauth/wrong-role probes to prove the guard executes.

export type PolicyTier = "public" | "authenticated" | "operator" | "superadmin"

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
  "/api/sim/actions/page_allied_health": "operator",
  "/api/sim/actions/request_placement": "operator",
  "/api/sim/step": "operator",
  "/api/sim/scenario": "operator",
  "/api/eval/run": "operator",
  "/api/agent/config": "operator",
  "/api/agent/models": "operator",

  // Authenticated (any role): read-only views + read-only Q&A + forecasts +
  // self-service account management (change-password, delete-own-account).
  "/api/sim/state": "authenticated",
  "/api/driver/records": "authenticated",
  "/api/driver/proposals": "authenticated",
  "/api/driver/flags": "authenticated",
  "/api/driver/assessment": "authenticated",
  "/api/driver/assessment/stream": "authenticated",
  "/api/driver/ask": "authenticated",
  "/api/sim/forecast/demand": "authenticated",
  "/api/sim/forecast/discharges": "authenticated",
  "/api/account": "authenticated",
  "/api/account/password": "authenticated",

  // Superadmin: the standalone admin surface (invite overview). The admin-plugin
  // CRUD lives under /api/auth/admin/* and is gated in policyFor + the catch-all.
  "/api/admin/invites": "superadmin",
  "/api/admin/audit": "superadmin",

  // Public: invite-gated sign-up. Better Auth's own endpoints (sign-in/out/session)
  // are public via the /api/auth prefix special-case in policyFor.
  "/api/register": "public",
}

// Better Auth's admin-plugin subtree. These resolve to the superadmin tier — the
// independent gate (decision 7) so the plugin is never the sole authority.
const ADMIN_PREFIX = "/api/auth/admin"

// Resolve a pathname to its tier. The Better Auth handler is a catch-all under
// /api/auth/*: its admin subtree (/api/auth/admin/*) requires superadmin, the rest
// is public. Every other route resolves by exact pathname, falling back to the
// fail-closed default.
export function policyFor(pathname: string): PolicyTier {
  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) return "superadmin"
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "public"
  return ROUTE_POLICY[pathname] ?? DEFAULT_TIER
}
