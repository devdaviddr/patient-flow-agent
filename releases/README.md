# Releases

Product, features, and architecture notes for each tagged release.

- [`0.1.0.md`](./0.1.0.md) — the complete agentic system: simulated hospital, the perceive → reason →
  plan → act loop, the human approval gate, transparent forecasts, real interventions, and the KPI
  evidence (S11). Full product + architecture.
- [`0.2.0.md`](./0.2.0.md) — complete blocker coverage: the agent diagnoses all four blocker types and
  surfaces the non-actionable ones (`allied_health`, `placement`) as read-only flags.
- [`0.3.0.md`](./0.3.0.md) — professional light UI (app shell, login/dashboard/settings/about), patient
  identities, readable plain-English content, the accordion dashboard, and a live view of the agent at work.
- [`0.4.0.md`](./0.4.0.md) — real self-hosted auth (Better Auth + SQLite/Drizzle, server sessions,
  viewer/coordinator roles, fail-closed `withPolicy` enforcement), approvals attributed to the signed-in
  actor, and a Cloudflare Tunnel ingress.
- [`0.5.0.md`](./0.5.0.md) — onboarding + administration: invite-gated sign-up (single-use hashed keys), a
  superadmin tier + admin area, self-service change-password / delete-account, and a DB-level
  last-superadmin lockout guard.
