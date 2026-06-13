import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/auth/auth"

// Better Auth's own endpoints (sign-in/out/session). Public per the policy
// allow-list; Better Auth applies its own CSRF + rate limiting here.
export const { GET, POST } = toNextJsHandler(auth.handler)
