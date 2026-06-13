// Idempotent seed for the two demo accounts (spec A1/A9/A11). Run via
// `npm run seed:auth`. Re-runs are no-ops (existing accounts are left untouched).
//
// Accounts are SEED-ONLY this release — public sign-up is disabled — so we create
// them through Better Auth's internal context (createUser + linkAccount), hashing
// the password with the same KDF the sign-in path verifies against. No plaintext
// password is ever stored (A1).
//
// Synthetic accounts only: `.test` emails, no real PII (S13). The passwords below
// are DEMO-ONLY, committed deliberately so a reviewer can sign in as either role;
// they guard nothing real. The login page imports these same constants (A11).

import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { auth } from "./auth"
import type { Role } from "./schema"
import { count as inviteCount, generateInvites } from "./invite"
import {
  COORDINATOR_EMAIL,
  COORDINATOR_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from "./demo-credentials"

// Demo-only credentials live in a client-safe leaf module (no server imports) so
// the login page can import them without bundling better-sqlite3. Re-exported
// here to keep `@/auth/seed` as the single source for server callers.
export { COORDINATOR_EMAIL, COORDINATOR_PASSWORD, VIEWER_EMAIL, VIEWER_PASSWORD }

interface SeedAccount {
  email: string
  password: string
  name: string
  role: Role
}

const SEED_ACCOUNTS: readonly SeedAccount[] = [
  {
    email: COORDINATOR_EMAIL,
    password: COORDINATOR_PASSWORD,
    name: "Dr. A. Coordinator",
    role: "coordinator",
  },
  {
    email: VIEWER_EMAIL,
    password: VIEWER_PASSWORD,
    name: "V. Viewer",
    role: "viewer",
  },
]

// Better Auth's credential provider keys accounts under this providerId.
const CREDENTIAL_PROVIDER_ID = "credential"

async function seedAccount(account: SeedAccount): Promise<"created" | "exists"> {
  const ctx = await auth.$context
  const existing = await ctx.internalAdapter.findUserByEmail(account.email)
  if (existing) return "exists"

  const user = await ctx.internalAdapter.createUser({
    email: account.email,
    name: account.name,
    role: account.role,
    emailVerified: true,
  })

  const hash = await ctx.password.hash(account.password)
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    accountId: user.id,
    providerId: CREDENTIAL_PROVIDER_ID,
    password: hash,
  })

  return "created"
}

// The superadmin is bootstrap-only and NEVER advertised on the login screen
// (decision 6). Its password is out-of-band: SUPERADMIN_PASSWORD if set, otherwise
// a random one printed once at creation — never a committed constant.
const SUPERADMIN_EMAIL = "superadmin@example-hospital.test"
const INVITE_KEYS_FILE = join(process.cwd(), ".invite-keys.txt")

async function seedSuperadmin(): Promise<void> {
  const envPassword = process.env.SUPERADMIN_PASSWORD
  const password = envPassword ?? randomBytes(18).toString("base64url")
  const result = await seedAccount({
    email: SUPERADMIN_EMAIL,
    password,
    name: "S. Administrator",
    role: "superadmin",
  })
  console.log(`auth seed: ${SUPERADMIN_EMAIL} (superadmin) — ${result}`)
  if (result === "created" && !envPassword) {
    console.log(
      `auth seed: superadmin password (shown once) — ${password}\n` +
        `           set SUPERADMIN_PASSWORD to choose your own; it is never committed.`,
    )
  }
}

// Mint the invite keys once (B2). Idempotent: skip if any invite already exists, so
// re-running the seed never regenerates keys or overwrites the emitted file.
function seedInvites(): void {
  const existing = inviteCount()
  if (existing > 0) {
    console.log(`auth seed: invites — ${existing} already present, skipping`)
    return
  }
  const generated = generateInvites(new Date())
  const body = generated.map((g) => `${g.key}  ${g.role}`).join("\n")
  writeFileSync(
    INVITE_KEYS_FILE,
    "# Patient Flow Orchestrator — invite keys (synthetic, demo-only).\n" +
      `# ${generated.length} single-use keys; hand one out to onboard a viewer/coordinator.\n` +
      "# Gitignored and emitted ONCE — the DB stores only hashes.\n\n" +
      `${body}\n`,
    "utf8",
  )
  console.log(`auth seed: invites — generated ${generated.length} keys → ${INVITE_KEYS_FILE}`)
}

export async function seedAuth(): Promise<void> {
  for (const account of SEED_ACCOUNTS) {
    const result = await seedAccount(account)
    console.log(`auth seed: ${account.email} (${account.role}) — ${result}`)
  }
  await seedSuperadmin()
  seedInvites()
}

// Allow `tsx src/auth/seed.ts` directly. Fail loud and exit non-zero on error.
const isDirectRun = process.argv[1]?.endsWith("seed.ts") ?? false
if (isDirectRun) {
  seedAuth()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("auth seed failed:", err)
      process.exit(1)
    })
}
