# Spec — UX Redesign (professional light app shell)

| | |
| --- | --- |
| **Feature** | A professional, light, medical-grade UI: app shell (topbar + collapsible sidebar), login / dashboard / settings / about screens, mock auth — plus readability + live-agent-visibility extras (see §9) |
| **Target release** | `0.3.0` |
| **Status** | ✅ Built & verified — PR #18 (grew well beyond the original plan; see §9) |
| **Branch** | `feat/ux-redesign` (plan) → `feat/ux-redesign-impl` (code) |
| **Companions** | `releases/0.1.0.md` (current architecture), `docs/PRD.md` (§6 demo-friendliness) |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md` (written after this spec + its open
> questions are settled).

---

## 1. Problem

The app works, but it *looks* like a developer tool: a dark, high-contrast, "hacker" theme on a single
scrolling page with no navigation, no identity, and no structure. For the in-world audience (a hospital
flow coordinator) and the real audience (technical reviewers judging the design), that undersells it.

This feature re-skins and re-structures the front end into something **calm, light, and
professional-grade** — a white/light medical palette that's easy on the eyes, a proper application
**shell** (topbar + collapsible icon sidebar), and distinct **login / dashboard / settings** screens.
It changes **only the presentation layer** — the agent, simulator, driver, tools, and eval are untouched.

## 2. How this fits the solution

- **It is a Web UI (component 5) overhaul.** Same data, same `/api/*` routes, same agent loop — a new
  shell and theme around the existing dashboard. (`releases/0.1.0.md`)
- **It changes nothing below the UI.** No agent, simulator, driver, tools, or eval changes; the 38
  existing tests must stay green.
- **It serves PRD §6 (demo-friendly).** A polished, legible, navigable interface makes the with/without
  story and the live loop far more convincing to a reviewer.
- **Auth is mock, on purpose.** The PRD scopes out real auth/login; this adds a *mock* login + user so
  the shell feels complete, with no real backend or credentials.

## 3. Users

- **The flow coordinator (in-world)** — wants a clean, calm, clinical interface they can read at a
  glance and navigate without thinking.
- **The technical reviewer (real audience)** — should see a professional product, not a dev console.
- **The developer** — needs the redesign to leave all existing behaviour and tests intact.

## 4. User stories

- As a user, I land on a **login screen**; a mock sign-in takes me into the app.
- As a user, I see a **topbar** with the app name on the left and my **avatar** on the top right.
- As a user, I navigate via a **left sidebar** with icon + label items (Dashboard, Settings), and I can
  **collapse it to a thin icon-only rail** and expand it again.
- As a user, I **log out** from a control at the **bottom of the sidebar**, returning to the login screen.
- As a coordinator, the **dashboard** presents the bed-board, proposals, KPIs, timeline, and Q&A in a
  clean, well-placed light layout that scrolls sensibly.
- As a user, a **settings screen** lets me see/adjust app settings (scenario, provider info, profile).
- As anyone, the whole thing is **light, minimal, medical, and easy on the eyes** — no dark hacker feel.

## 5. Acceptance criteria

| # | Criterion |
| --- | --- |
| H1 | A **light, medical theme** replaces the dark one everywhere: white/near-white surfaces, a calm clinical palette (soft blues/teals/greens + neutral grays), legible typography, low eye-strain. Bed/status colours re-mapped to read well on light. |
| H2 | A persistent **app shell** — fixed **topbar** + left **sidebar** — wraps the authenticated screens. |
| H3 | The **topbar** shows the **app name/logo on the left** and the **user avatar on the top right**. |
| H4 | The **sidebar** is a vertical nav of **icon + label** items (at least **Dashboard** and **Settings**), with a **logout control pinned to the bottom**. |
| H5 | The sidebar **collapses to a thin icon-only rail** and **expands** back via a toggle button; the chosen state persists across reloads. |
| H6 | A standalone **login screen** with a **mock user + mock login** (no real backend); submitting signs in and routes to the dashboard. |
| H7 | **Route protection (mock):** an unauthenticated visit redirects to **/login**; **logout** clears the mock session and returns to **/login**. |
| H8 | The **dashboard** screen re-lays the existing panels (bed-board, proposals + flags, KPIs, decision timeline, Q&A, clock controls) with **deliberate placement** and good use of space. |
| H9 | A **settings** screen exists with real, sensible content (e.g. scenario/seed, the active model/provider, mock profile) — see §8 for the agreed content. |
| H10 | **Layout & scroll:** the topbar and sidebar stay fixed; the content region scrolls independently; the layout holds at common desktop widths without overflow/breakage. |
| H11 | **Minimal & professional:** consistent spacing, type scale, and components throughout; no clutter. |
| H12 | **No regressions:** the agent/sim/driver/eval are unchanged and all existing behaviour + the 38 tests still pass; `typecheck`/`lint`/`build` green. |

## 6. Scope

### In scope
- A light medical **design system** (colours, typography, spacing, components) replacing the dark theme.
- The **app shell**: topbar + collapsible icon sidebar with logout.
- Three **screens**: login, dashboard (the existing functionality re-laid-out), settings.
- **Mock auth**: a mock user, a mock login form, mock route protection + logout.
- Re-organising the dashboard panels for good placement and scroll behaviour.

### Out of scope (later / never)
- **Real authentication**, real users, passwords, sessions, or any auth backend.
- Any change to the **agent, simulator, driver, tools, or eval** behaviour.
- **Mobile-first** responsive design (basic desktop resilience only).
- Persisting settings to a backend (mock/local only).
- New product features — this is presentation + navigation only.

## 7. Dependencies & assumptions

- Builds on the current 0.2.0 UI (`src/app/`) and its `/api/*` routes — all reused unchanged.
- Pure front-end: no new backend routes required (mock auth is client-side).
- Assumes desktop browser use for the demo; graceful at common widths, not phone-optimised.

## 8. Resolved decisions (detail in implementation.md)

1. **Styling** → **Tailwind CSS** (v4) with a light design system / theme tokens.
2. **Icons** → **`lucide-react`**.
3. **Typography** → **Inter** via `next/font`.
4. **Mock auth** → client-side **auth context + `localStorage`** with a redirect guard.
5. **Routing** → App Router **route group `(app)`** (shell layout) for `/` + `/settings`; `/login`
   standalone.
6. **Settings content** → scenario/seed selector + read-only active model/provider + mock user profile.
7. **Palette** → **clinical blue** primary `#2c7be5` on white/`#f7f9fc` surfaces; green/amber/red
   reserved for bed-status semantics.

## 9. Delivered (beyond the original plan)

The redesign shipped the original shell (H1–H12) **and** a series of readability + live-agent-visibility
improvements added during review. All remain presentation-only — no agent/sim/eval logic changed except
where noted; the 38 tests stay green.

| # | Delivered | Notes |
| --- | --- | --- |
| U1 | **Patient identities** — every patient has a fake **name** + **UR number** (Unit Record), shown on the bed-board, intervention cards, queues, and flagged list. | The only sim change: deterministic `patientName(id)`/`patientUr(id)` in `src/sim/` (safety + determinism tests still pass). |
| U2 | **Bed-board on its own full-width row**, each ward shown as a single row of beds on wide screens. | layout |
| U3 | **Inter via `@fontsource/inter`** (self-hosted) rather than `next/font/google`, to avoid a build-time network fetch. | same font; build is offline-safe |
| U4 | **About page** (`/about`, in the sidebar) — business flow, the agent loop, the architecture (two nested loops, five components, safety boundary, determinism), and the KPI evidence — with **Mermaid** diagrams themed to the palette. | New nav item; `<Mermaid>` client component (dynamic import). |
| U5 | **Plain-English content** — intervention cards lead with a friendly action ("Chase pharmacy" / "Arrange transport") + patient name, a one-line explanation, and the agent's raw rationale as muted supporting text; the KPI panel renamed **"Does the agent help?"** with plain measures ("Time patients waited for a bed", "Spare ready beds"). | Non-medical readers can follow it. |
| U6 | **ED queue** + **Discharge queue** panels of patient cards (waiting-for-a-bed, and predicted discharges soonest-first with ready/blocker badges). | Replaces the inline ED-queue line. |
| U7 | **Accordion dashboard** — the working columns (ED queue · Discharge queue · Proposed · Flagged · Assessment) sit in one row; **one open at a time**, the open panel on the left filling the width, the rest as thin vertical banners; choice persisted. | Replaces the per-column collapse toggles. |
| U8 | **Live Assessment panel** — pressing **Assess** streams the agent's activity: start time, status, and a raw log of each **tool call and its result** (incl. subagent `task` delegation), polled live; **spinner** on the button; **Re-assess** clears the previous log. | New `startAssessment()` background flow in the driver; `planViaOrchestratorLogged()` polls OpenCode session messages. SDK stays isolated to `adapter.ts`. |
| U9 | **Floating chat assistant** — Q&A moved into a sticky bottom-right button that opens a chat overlay (message log, Enter-to-send), available on every screen. | Replaces the dashboard Ask panel. |
| U10 | **Real-time playback** — a **Play/Pause** that auto-advances the clock (~3s/tick). | PRD §6 "played". |
| U11 | **All app times via dayjs** (`DD-MM-YYYY HH:mm`, UTC for sim times); ISO timestamps inside the agent's rationale text reformatted in-place. | `src/app/lib/time.ts`. |
