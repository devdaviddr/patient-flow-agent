# Implementation Plan — UX Redesign (professional light app shell)

| | |
| --- | --- |
| **Feature** | Light medical theme + app shell (topbar + collapsible sidebar) + login/dashboard/settings + mock auth |
| **Target release** | `v1.2` |
| **Status** | Plan PR — awaiting review/merge |
| **Implements** | `spec.md` (same folder) |

> SDD step 2 (Plan): *how* the spec is built — layout, decisions/trade-offs, and how each acceptance
> criterion (H1–H12) is met and verified. Task breakdown at the end (the code PR).

---

## 1. Architecture

A **presentation-only** change. No `/api/*`, agent, simulator, driver, or eval code is touched — the
existing data flow is reused verbatim. We add Tailwind, a mock auth layer, an app shell, and re-skin the
dashboard; we add two routes (login, settings).

```
src/app/
  layout.tsx              # root: <html>, Inter font, <AuthProvider>, global Tailwind css
  globals.css             # @import "tailwindcss" + @theme tokens (clinical blue, light surfaces)
  login/page.tsx          # standalone login screen (no shell)
  (app)/                   # route group — the authenticated shell
    layout.tsx            # auth guard + AppShell (Topbar + Sidebar + scrollable <main>)
    page.tsx              # Dashboard (existing panels, re-laid-out)
    settings/page.tsx     # Settings screen
  components/
    shell/Topbar.tsx       # app name/logo left · avatar right
    shell/Sidebar.tsx      # nav (Dashboard, Settings) w/ lucide icons · collapse toggle · logout (bottom)
    shell/SidebarLink.tsx
    (existing dashboard components, restyled with Tailwind + light theme)
  lib/
    auth.tsx               # AuthProvider, useAuth(), MOCK_USER, localStorage persistence
    ui.ts                  # tiny class helpers / shared tokens if needed
postcss.config.mjs         # @tailwindcss/postcss
```

`/api/*` routes, `src/sim`, `src/driver`, `src/eval`, and `tests/` are **unchanged**.

## 2. Component & layer design

### 2.1 Theme — Tailwind v4 + tokens (H1, H7-palette)
Add `tailwindcss@4` + `@tailwindcss/postcss`; `postcss.config.mjs` enables the plugin; `globals.css`
becomes `@import "tailwindcss";` plus an `@theme` block defining the light medical palette:

```
--color-primary: #2c7be5;     /* clinical blue */
--color-bg: #f7f9fc;  --color-surface: #ffffff;  --color-border: #e3e8ef;
--color-text: #1a2b3c;  --color-muted: #5b6b7f;
/* status (kept semantic): occupied=blue · empty_clean=#18a957 · empty_dirty=#e0a800 · blocked=#d6455b */
```
The old dark `globals.css` rules are removed; components move to Tailwind utility classes.

### 2.2 Mock auth — `lib/auth.tsx` (H6, H7)
A client `AuthProvider` exposing `useAuth(): { user, isAuthenticated, login, logout }`. `login()` accepts
any input (mock), sets a hardcoded `MOCK_USER` (`{ name: "Dr. A. Coordinator", role: "Flow Coordinator",
initials: "AC" }`), and persists an `authed` flag + user in `localStorage`. `logout()` clears it. No
backend, no real credentials.

### 2.3 Routing + guard (H2, H7, H10)
- **Root `layout.tsx`** — `<html>`, Inter via `next/font`, wraps everything in `<AuthProvider>`.
- **`login/page.tsx`** — standalone (outside the shell): a centered card with email/password fields
  (prefilled mock values), a "Sign in" button → `login()` → `router.push("/")`.
- **`(app)/layout.tsx`** — a client guard: if `!isAuthenticated`, `redirect("/login")`; otherwise render
  `<AppShell>` (fixed Topbar, fixed Sidebar, a scrollable `<main>` for the page). The route group keeps
  the shell out of `/login`.

### 2.4 App shell (H2–H5, H10)
- **Topbar** (fixed, full width): logo + **app name on the left**; **avatar (initials) top right** (with
  a small dropdown showing the mock user; optional).
- **Sidebar** (fixed, left): `Dashboard` + `Settings` nav as **lucide icon + label** links (active state
  highlighted); a **collapse toggle** (PanelLeft icon) switches between full (~240px) and a **thin
  icon-only rail** (~64px); the state is persisted in `localStorage` (`sidebar-collapsed`). A **Logout**
  button (LogOut icon) is pinned to the **bottom**.
- **Content** — `<main>` scrolls independently beneath the fixed topbar / beside the fixed sidebar.

### 2.5 Dashboard re-layout (H8, H11)
Same components and data, re-skinned and re-placed on light:
- A top **controls row** (clock: current time · Step · Assess · scenario indicator).
- A **two-column grid**: left = **bed-board** (the focus); right = **proposals + flags**, **KPIs**, **Q&A**.
- A full-width **decision timeline** below.
Cards become light surfaces with subtle borders/shadow; bed-status colours re-mapped per the tokens.

### 2.6 Settings screen (H9)
A simple settings page: **Scenario & seed** (the scenario selector + Load, moved here), **Reasoning
model** (read-only — `opencode/big-pickle`, with the swap note), and **Profile** (the mock user). Uses
the existing `/api/sim/scenario` route.

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Tailwind v4** (chosen) | Fast, consistent utility styling for a professional dashboard; good with Next 16. | Adds Tailwind + a build plugin; every existing component's markup is rewritten to utilities. |
| **Clinical blue `#2c7be5` on light** (chosen) | Trustworthy healthcare look; status colours stay semantic. | Bed-status palette must be re-tuned for contrast on white. |
| **lucide-react + Inter** (chosen) | Crisp icons + professional type — the "professional grade" ask. | Two new (small, common) deps. |
| **Mock auth = client context + localStorage** | Simplest honest mock; no backend, matches "mock login for now". | Not real security (by design); guard is client-side (a flash-guard, fine for a demo). |
| **Route group `(app)` + standalone `/login`** | Clean separation of shell vs no-shell; idiomatic App Router. | One more layout file. |
| **Presentation-only; no API/logic change** | Protects the 38 tests and the verified agent loop. | The dashboard rewrite is large but contained to `src/app`. |

## 4. Verification (maps to acceptance criteria)

Mostly a **live walkthrough** (UI), plus the existing suite proving no regressions.

| Criterion | How verified |
| --- | --- |
| H1, H11 | Browser: light medical theme throughout; consistent spacing/type; no dark surfaces. |
| H2–H5 | Topbar (name left, avatar right); sidebar nav + collapse-to-rail + persisted state; logout pinned bottom. |
| H6, H7 | Visiting `/` while logged out → `/login`; mock sign-in → dashboard; logout → `/login`. |
| H8, H10 | Dashboard panels well-placed; topbar/sidebar fixed; content scrolls; holds at common widths. |
| H9 | Settings shows scenario/seed (loads via `/api/sim/scenario`), model, profile. |
| H12 | `npm test` (38) green; `typecheck`/`lint`/`build` clean — the agent/sim/driver/eval untouched. |

## 5. Task breakdown (SDD step 3) — the code PR

1. **Tailwind v4** setup (deps, `postcss.config.mjs`, `globals.css` tokens) + **Inter** font + **lucide-react**.
2. **`lib/auth.tsx`** mock auth + `MOCK_USER`; **`login/page.tsx`**.
3. **Root layout** (font + provider); **`(app)/layout.tsx`** guard + **AppShell**; **Topbar**, **Sidebar**
   (collapse + logout).
4. **Dashboard** (`(app)/page.tsx`) — re-lay the existing panels; **restyle** each component with Tailwind.
5. **Settings** (`(app)/settings/page.tsx`).
6. Verify: live walkthrough (H1–H11); full suite + build green (H12).

## 6. Out of scope (restated)

Real auth/users/sessions, any agent/sim/driver/eval change, mobile-first responsive, backend-persisted
settings, and any new product capability. Presentation + navigation only.
