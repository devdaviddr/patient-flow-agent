// The client-side auth-gate decision for a guarded (app) page.
//
// The edge middleware is OPTIMISTIC — it only checks that a session cookie is
// present, not that it is valid (the Edge runtime can't open the SQLite store).
// So a present-but-invalid session (after logout clears it client-side, or from
// a stale cookie signed with an old BETTER_AUTH_SECRET) slips past the edge. The
// client is then the only place that can resolve it: when the session resolves
// to unauthenticated we must send the visitor to /login, not render a blank
// shell forever. See src/middleware.ts and src/app/(app)/layout.tsx.

export type AuthGate = "loading" | "redirect" | "render"

export function authGate(ready: boolean, isAuthenticated: boolean): AuthGate {
  if (!ready) return "loading"
  return isAuthenticated ? "render" : "redirect"
}
