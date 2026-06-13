// Demo-only seed credentials, in a LEAF module with no server-only imports so it
// is safe to import from the client login page (A11 click-to-fill) without
// pulling better-sqlite3 / the Better Auth server graph into the browser bundle.
//
// These are SEED-ONLY, committed deliberately so a reviewer can sign in as either
// role; they guard nothing real. Synthetic accounts only — `.test` emails, no
// real PII (S13). `seed.ts` re-exports these so server callers keep one source.

export const COORDINATOR_EMAIL = "coordinator@example-hospital.test"
export const COORDINATOR_PASSWORD = "demo-coordinator-2026"
export const VIEWER_EMAIL = "viewer@example-hospital.test"
export const VIEWER_PASSWORD = "demo-viewer-2026"
