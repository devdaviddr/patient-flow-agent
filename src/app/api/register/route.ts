import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/auth/auth"
import { redeem, roleForUnusedKey } from "@/auth/invite"
import { isSameOrigin } from "@/auth/same-origin"

export const dynamic = "force-dynamic"

// Public, invite-gated sign-up (spec B1/B3). Built-in Better Auth sign-up stays
// disabled; we create the account through the same internalAdapter path the seed
// uses (server-controlled, no admin caller required), then atomically claim the
// invite key and start a session. Order is create → claim → compensate-on-failure
// so `used_by` only ever points at a real user id.

const RegisterBody = z.object({
  inviteKey: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
})

// Better Auth's credential provider keys accounts under this providerId (as in seed.ts).
const CREDENTIAL_PROVIDER_ID = "credential"

// One non-leaky message for every failure mode — we never reveal which of invalid
// key / used key / duplicate email occurred (B1).
const GENERIC_ERROR = "Could not create an account. Check your invite key and details."

export async function POST(req: NextRequest): Promise<Response> {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  const parsed = RegisterBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }
  const { inviteKey, email, password, name } = parsed.data

  // Pre-check the key for an early, friendly rejection. The redeem UPDATE below is
  // still the atomic authority (a key can be claimed between here and there).
  const role = roleForUnusedKey(inviteKey)
  if (!role) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  const ctx = await auth.$context
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  // Create the account, then claim the key. Any failure after the user exists — a
  // lost claim race, or a thrown error — compensates by deleting the user so no
  // orphan account survives (B3).
  let createdUserId: string | null = null
  try {
    const created = await ctx.internalAdapter.createUser({
      email,
      name: name ?? email,
      role,
      emailVerified: true,
    })
    createdUserId = created.id

    const hash = await ctx.password.hash(password)
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      accountId: created.id,
      providerId: CREDENTIAL_PROVIDER_ID,
      password: hash,
    })

    if (!redeem(inviteKey, created.id)) {
      await ctx.internalAdapter.deleteUser(created.id)
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 409 })
    }
  } catch {
    if (createdUserId) {
      await ctx.internalAdapter.deleteUser(createdUserId).catch(() => undefined)
    }
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  // Success: start a session and return its Set-Cookie so the new user is signed in.
  return auth.api.signInEmail({ body: { email, password }, asResponse: true })
}
