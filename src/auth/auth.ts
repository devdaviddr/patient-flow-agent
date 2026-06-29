// Better Auth server instance (Architecture.md §3; spec A2/A3/A12).
// Email/password over the SQLite/Drizzle store, DB-backed server sessions, the
// two-role hierarchy carried on the session, and a per-IP sign-in rate limiter
// keyed on the real client IP behind the Cloudflare Tunnel.
//
// Synthetic accounts only — no real PII (S13). Determinism (S12) is unaffected:
// this store is never read by the seeded simulator.

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { adminAc, userAc } from "better-auth/plugins/admin/access"
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

// Explicit session lifetime (was Better Auth's default). Sized for a demo app: long
// enough a reviewer isn't re-prompted mid-session, short enough a stale cookie
// expires. Refreshed (sliding) when used within a day of expiry.
const SESSION_EXPIRES_SECONDS = 60 * 60 * 24 * 7 // 7 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 // 1 day

export const auth = betterAuth({
  appName: "patient-flow-orchestrator",
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // Built-in open sign-up stays disabled (decision 2): onboarding is invite-gated
    // via the custom /api/register route, so signUpEmail returns signup_disabled.
    disableSignUp: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      // Carried on the validated session so guards read the role server-side.
      // input: false — role is seed-assigned (or invite-encoded), never client-
      // supplied on sign-up.
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
    expiresIn: SESSION_EXPIRES_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
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
  plugins: [
    // Superadmin user administration (B4): list/search/edit/delete/set-role.
    // The plugin needs each admin role defined in its access-control config, so we
    // map our roles onto the built-in permission sets: `superadmin` gets the full
    // admin grant (adminAc), `coordinator`/`viewer` get none (userAc). New accounts
    // default to viewer. The endpoints are ALSO independently gated at the route
    // layer (requireSuperadmin in /api/auth/[...all]) so the plugin is not the sole
    // authority (decision 7).
    admin({
      roles: { superadmin: adminAc, coordinator: userAc, viewer: userAc },
      adminRoles: ["superadmin"],
      defaultRole: "viewer",
    }),
    // Keep Next.js cookie handling correct for server actions / route handlers.
    // Must stay last so its cookie hooks wrap the others.
    nextCookies(),
  ],
})
