// Invite-key system for gated sign-up (spec B2/B3). Keys are credentials, so:
//   - only an HMAC-SHA256(key, BETTER_AUTH_SECRET) digest is stored — never the
//     plaintext, and not a bare SHA-256 (decision 4): a stolen DB yields no usable
//     keys without the server secret;
//   - each key carries ≥128 bits of entropy, rendered as 26 base32 chars;
//   - redemption is single-use and atomic via a conditional UPDATE (B3).
//
// Synthetic, demo-only — these keys guard a portfolio app, no real PII (S13).

import { createHmac, randomBytes } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "./db"
import { invite } from "./schema"
import type { InvitableRole } from "./schema"

// RFC 4648 base32 alphabet (no padding). 16 random bytes → 128 bits → 26 chars.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const KEY_BYTES = 16
const GROUP_SIZE = 5

// How many keys the seed mints, and their role split (B2: exactly 50). Coordinator-
// heavy because that is the useful demo role; viewer keys round out the set.
export const INVITE_TOTAL = 50
const INVITE_ROLE_PLAN: readonly { role: InvitableRole; count: number }[] = [
  { role: "coordinator", count: 40 },
  { role: "viewer", count: 10 },
]

function base32(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

// A fresh key in grouped display form (ABCDE-FGHIJ-...). Display only; the stored
// and compared form is always the normalized (un-grouped) string.
function generateKey(): string {
  const raw = base32(randomBytes(KEY_BYTES))
  const groups: string[] = []
  for (let i = 0; i < raw.length; i += GROUP_SIZE) {
    groups.push(raw.slice(i, i + GROUP_SIZE))
  }
  return groups.join("-")
}

// Strip formatting (dashes, spaces, case) so a user can paste a key however it was
// presented. Hashing always runs on this canonical form.
export function normalizeKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, "")
}

// HMAC-with-secret, not a bare hash (decision 4). Read the secret per call (lazily)
// so importing this module never throws before env is set.
export function hashKey(input: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("Missing required environment variable: BETTER_AUTH_SECRET")
  return createHmac("sha256", secret).update(normalizeKey(input)).digest("hex")
}

export interface GeneratedInvite {
  key: string // plaintext, grouped — emitted ONCE, never stored
  role: InvitableRole
}

// Mint INVITE_TOTAL keys, store only their hashes, and return the plaintext once
// for the caller to emit to a gitignored file. Idempotent at the seam: callers
// check `count()` first and skip if invites already exist.
export function generateInvites(now: Date): GeneratedInvite[] {
  const generated: GeneratedInvite[] = []
  for (const { role, count } of INVITE_ROLE_PLAN) {
    for (let i = 0; i < count; i++) {
      const key = generateKey()
      generated.push({ key, role })
      db.insert(invite).values({ codeHash: hashKey(key), role, createdAt: now }).run()
    }
  }
  return generated
}

// Total invites on record (used + unused). The seed uses this for idempotency.
export function count(): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(invite).get()
  return row?.n ?? 0
}

// How many keys remain unclaimed. Sign-up closes when this hits zero (B2).
export function remaining(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(invite)
    .where(isNull(invite.usedBy))
    .get()
  return row?.n ?? 0
}

// The role an UNUSED key grants, or null if the key is unknown or already claimed.
// A pre-check for the sign-up route; redemption is still the atomic authority.
export function roleForUnusedKey(input: string): InvitableRole | null {
  const row = db
    .select({ role: invite.role })
    .from(invite)
    .where(and(eq(invite.codeHash, hashKey(input)), isNull(invite.usedBy)))
    .get()
  return row?.role ?? null
}

// Atomically claim a key for a real user id (B3). The conditional UPDATE is the
// race guard: exactly one concurrent redemption of the same key sets used_by, so
// `changes === 1` means this caller won. A loser (or invalid/used key) gets false
// and the route compensates by deleting the just-created user.
export function redeem(input: string, userId: string): boolean {
  const res = db
    .update(invite)
    .set({ usedBy: userId })
    .where(and(eq(invite.codeHash, hashKey(input)), isNull(invite.usedBy)))
    .run()
  return res.changes === 1
}
