"use client"

// Real auth — wraps Better Auth's React client. The server (middleware + the
// per-route withPolicy guard) is the authoritative gate; this hook gives the
// shell the signed-in identity (incl. the role) so it can hide operator-only
// controls and offer logout. The 0.3.0 localStorage flag + MOCK_USER are gone.
//
// Synthetic accounts only — no real PII (S13).

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { createAuthClient } from "better-auth/react"
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins"
import { ROLES, type Role } from "@/auth/schema"

// The Better Auth React client. The additional-fields plugin teaches the client
// about our custom `user.role` column so `useSession().data.user.role` is typed.
// We pass the field schema explicitly (rather than `<typeof auth>`) to avoid
// pulling the server instance into the client bundle.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { role: { type: "string" } } }),
    // Superadmin user administration (list/search/set-role/remove). The server
    // independently re-checks superadmin on every admin endpoint (decision 7).
    adminClient(),
  ],
})

// The identity the shell consumes. `role` is the authoritative server role;
// `initials` is derived for the avatar.
export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  initials: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  ready: boolean // session resolved (no longer pending) yet?
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]
  return letters.toUpperCase()
}

// Narrow the client's `string` role to our known union; default to the least
// privileged tier if the value is ever unexpected (defence-in-depth — the
// server, not this hook, is the real authority).
function toRole(value: string | undefined | null): Role {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "viewer"
}

// A non-leaky message for a failed sign-in — we never echo the server's reason.
const SIGN_IN_FAILED = "Invalid email or password."

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession()

  const value = useMemo<AuthState>(() => {
    const sessionUser = data?.user ?? null
    const user: AuthUser | null = sessionUser
      ? {
          id: sessionUser.id,
          name: sessionUser.name,
          email: sessionUser.email,
          role: toRole(sessionUser.role),
          initials: initialsFor(sessionUser.name),
        }
      : null

    const login: AuthState["login"] = async (email, password) => {
      const { error } = await authClient.signIn.email({ email, password })
      if (error) return { ok: false, error: SIGN_IN_FAILED }
      return { ok: true }
    }

    const logout: AuthState["logout"] = async () => {
      await authClient.signOut()
    }

    return { user, isAuthenticated: user !== null, ready: !isPending, login, logout }
  }, [data, isPending])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}
