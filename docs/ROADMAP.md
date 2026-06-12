# Roadmap — what to do next

> Status: **pre-release** (`0.x`). Shipped: `0.1.0` (core build) · `0.2.0` (complete blocker coverage).
> In flight: `0.3.0` — the UX redesign (PR #18). The agent loop is proven (S11) and the app runs via
> Docker or `make dev`.

This is the parked "next steps" list — both engineering and product. Pick by audience: a **portfolio /
interview artefact** favours the demo + story; a **product seed** favours integration + a pilot.

---

## Tech

1. **Ship the UX work** — merge **PR #18**, tag **`0.3.0`**, add `releases/0.3.0.md`. (Large, well-tested
   branch sitting open.)
2. **Tidy the open quality items** (all scoped in `development-Plan.md`):
   - **Real-agent eval mode** — run the KPI comparison with the actual LLM agent in the loop (N trials,
     report the spread), not just the deterministic oracle policy.
   - **Playwright e2e** — automated DOM coverage for the UI (login → assess → approve → KPIs).
   - **Persistence** — decision records / sessions survive a restart (currently in-process).
3. **Stream instead of poll** — the live Assessment log polls the OpenCode session messages; switching to
   the OpenCode **SSE event stream** (`client.event.subscribe()`) makes it instant and lighter.
4. **Deepen the agent** — give `allied_health` / `placement` real actions (page allied health, request
   placement) so all four blockers are actionable; add more wards / scenarios; or replace the transparent
   heuristic forecaster with a learned one.
5. **Deployment** — the Docker stack containerises cleanly; the Azure Container Apps path is noted for
   later (`Architecture.md §9`).

## Product / business flow

1. **Tell the story** — record a ~2-minute demo (sign in → Step → Assess → approve → KPIs) and a one-page
   case study built on the with/without numbers. For a portfolio/reviewer audience this *is* the deliverable.
2. **Make the value legible** — frame **ROI**: "X bed-hours saved per day → Y fewer ED boarders." The KPI
   panel ("Does the agent help?") is the seed of that.
3. **Define the real-world integration story** (even if unbuilt) — where the synthetic tools map to
   **HL7 / FHIR** feeds (ADT for admissions/discharges, a bed-management system). Reviewers will ask
   "how would this touch a real hospital?"
4. **Scope a pilot narrative** — one ward, shadow mode (agent proposes, coordinator decides), measure
   access-block hours for a week. The human-approval gate is exactly what makes this safe to pilot.
5. **Decide the audience** — portfolio/interview artefact vs product seed. That choice reorders everything
   above.

---

**Recommended order:** merge PR #18 → tag `0.3.0` → record the demo (highest leverage for the portfolio
goal) → then pick a tech or product thread above.
