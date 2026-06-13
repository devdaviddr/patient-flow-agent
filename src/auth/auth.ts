// Better Auth server instance (Architecture.md §3; spec A2/A3/A12).
// Email/password over the SQLite/Drizzle store, DB-backed server sessions, the
// two-role hierarchy carried on the session, and a per-IP sign-in rate limiter
// keyed on the real client IP behind the Cloudflare Tunnel.
//
// Synthetic accounts only — no real PII (S13). Determinism (S12) is unaffected:
// this store is never read by the seeded simulator.

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { db } from "./db"
import { schema, ROLES } from "./schema"

// Fail loud and early on missing secrets rather than silently running insecure.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const BETTER_AUTH_SECRET = requireEnv("BETTER_AUTH_SECRET")
const BETTER_AUTH_URL = requireEnv("BETTER_AUTH_URL")

// The header Cloudflare sets with the real client IP; the origin is not directly
// routable (cloudflared dials outbound), so this header can be trusted for keying.
const CLIENT_IP_HEADER = "cf-connecting-ip"

// Sign-in is rate-limited harder than the global default.
const SIGN_IN_WINDOW_SECONDS = 60
const SIGN_IN_MAX_ATTEMPTS = 10

export const auth = betterAuth({
  appName: "patient-flow-orchestrator",
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // Seed-only this release — no public sign-up (onboarding lands in 0.5.0).
    disableSignUp: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      // Carried on the validated session so guards read the role server-side.
      // input: false — role is seed-assigned, never client-supplied on sign-up.
      role: {
        type: [...ROLES],
        required: false,
        input: false,
        defaultValue: "viewer",
      },
    },
  },
  session: {
    storeSessionInDatabase: true,
  },
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/email": { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
    },
  },
  advanced: {
    // Trust CF-Connecting-IP for rate-limit keying behind the tunnel (A12).
    ipAddress: {
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
    // HTTP-only by default; force Secure in all environments (TLS at the edge).
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    },
  },
  // Keep Next.js cookie handling correct for server actions / route handlers.
  plugins: [nextCookies()],
})
