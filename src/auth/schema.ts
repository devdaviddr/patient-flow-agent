// Drizzle table definitions for the Better Auth store (Architecture.md §3, §5).
// Shapes follow Better Auth's required schema for the SQLite/Drizzle adapter; the
// domain additions are `user.role` (carried on the session) and the `invite` table.
// The admin plugin (0.5.0) requires `banned`/`banReason`/`banExpires` on user and
// `impersonatedBy` on session — present so the adapter's reads/writes line up.
// Synthetic accounts only — never any real PII (S13).

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// The role hierarchy `viewer ⊂ coordinator ⊂ superadmin`. Kept as a literal union
// so guards compare known values; superadmin is the admin-capable tier (0.5.0).
export const ROLES = ["viewer", "coordinator", "superadmin"] as const
export type Role = (typeof ROLES)[number]

// Roles an invite key may grant. Superadmin is NEVER invite-grantable (B1) — it is
// seed-bootstrapped, then granted only by an existing superadmin via the admin area.
export const INVITABLE_ROLES = ["viewer", "coordinator"] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  // Domain role. Defaults to the least-privileged tier.
  role: text("role", { enum: ROLES }).notNull().default("viewer"),
  // Admin-plugin fields (unused flows, but the adapter expects the columns).
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  // Set by the admin plugin's impersonation flow (unused, column present for the adapter).
  impersonatedBy: text("impersonated_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  // The password KDF hash for the email/password provider lives here (A1).
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})

// Invite keys for gated sign-up (0.5.0, B2/B3). Only the KDF/HMAC hash of a key is
// stored — never the plaintext. `usedBy` is NULL until a real user id claims the key
// (claim-then-compensate); it points at the account the key created and survives that
// account's deletion (set null) so the invite history stays inspectable.
export const invite = sqliteTable("invite", {
  codeHash: text("code_hash").primaryKey(),
  role: text("role", { enum: INVITABLE_ROLES }).notNull(),
  usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// The driver's audit trail (R10), persisted so the decision timeline survives a
// container restart (#33). Lives on the same SQLite volume as auth but is written
// only by the driver; the seeded simulator never reads it, so S12 is unaffected.
// `payload`/`actor` are JSON text; `id` autoincrements to preserve append order.
export const decisionRecord = sqliteTable("decision_record", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  type: text("type", { enum: ["gap", "plan", "action"] }).notNull(),
  stateRef: text("state_ref").notNull(),
  rationale: text("rationale").notNull(),
  payload: text("payload").notNull(),
  actor: text("actor"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// Auth audit trail (#28): sign-in, role change, account deletion, and other admin
// actions, with the acting principal + target. Synthetic identities only (S13);
// queried directly by the audit module, so it stays out of the Better Auth map.
export const authEvent = sqliteTable("auth_event", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  type: text("type").notNull(),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  targetId: text("target_id"),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// Better Auth's adapter only needs the auth tables; decisionRecord + authEvent are
// queried directly, so they stay out of this map.
export const schema = { user, session, account, verification, invite }
