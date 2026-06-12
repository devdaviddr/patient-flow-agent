# Implementation Plan — Web UI

| | |
| --- | --- |
| **Feature** | The dashboard + the driver's browser-facing routes |
| **Version** | 0.1.0 |
| **Status** | ✅ Built & verified (E1–E9) — code PR open |
| **Implements** | `spec.md` (same folder) |

> SDD step 2 (Plan): *how* the spec is built — layout, key decisions/trade-offs, and how each
> acceptance criterion (E1–E9) is met and verified. Task breakdown at the end (the code PR).

---

## 1. Architecture

A single-page **client dashboard** that talks to thin API routes. The routes wrap the existing sim and
the `Driver` (exposed via a singleton, like the sim). No new runtime deps — styling is hand-rolled CSS.

```
src/
  sim/instance.ts          # ADD resetSimulator(scenario, seed) — for "load scenario"
  driver/instance.ts       # NEW getDriver()/resetDriver() singleton (shares the sim singleton)
  app/
    globals.css            # NEW the dashboard styling (imported in layout)
    layout.tsx             # import globals.css
    page.tsx               # the dashboard (client component) — fetches + wires everything
    components/
      BedBoard.tsx         # wards · beds (status colours) · ED queue · predicted discharge/blocker
      ApprovalCards.tsx    # proposed interventions, approve/reject per item
      DecisionTimeline.tsx # gaps → plans → actions from records
      KpiPanel.tsx         # placeholder (Phase 7)
      QuestionBox.tsx      # free-text Q&A
      ClockControls.tsx    # step · load scenario
    api/
      sim/scenario/route.ts      # POST {scenario} -> reset sim + driver
      driver/plan/route.ts       # POST -> Driver.plan() (runs the agent)
      driver/proposals/route.ts  # GET  -> current proposals
      driver/approve/route.ts    # POST {id} -> Driver.approve(id)
      driver/reject/route.ts     # POST {id} -> Driver.reject(id)
      driver/records/route.ts    # GET  -> DecisionRecord[]
      driver/ask/route.ts        # POST {question} -> plain-text answer from the orchestrator
```

Data flow: `page.tsx` holds `state`, `proposals`, `records`, `answer`, and `busy` flags. Each control
calls a route, then refreshes the affected slices (refresh-after-action). The sim/driver share the
Next.js process, so the driver acts in-process and the harness tools (in `opencode serve`) read the
same world over HTTP.

## 2. Component & route design

- **Singletons** (`driver/instance.ts`): `getDriver()` lazily builds a `Driver` bound to the current
  sim; `resetDriver()` clears it. `resetSimulator(scenario)` swaps the sim singleton; the scenario
  route calls both so a fresh scenario gets a fresh world **and** a fresh decision log. (E2, E8)
- **Driver routes**: thin wrappers over `getDriver()`. `plan`/`ask` run a model round-trip (need
  `opencode serve`); `approve`/`reject`/`records`/`proposals` are instant and local. `ask` uses the
  adapter to prompt the orchestrator with the plain question (no JSON). (E3, E4, E5, E6, E8)
- **BedBoard**: renders each ward as a grid of beds; status → colour (occupied / clean / dirty /
  blocked); occupied beds show patient id, predicted discharge time, and blocker badge; the ED queue is
  a strip. (E1)
- **ApprovalCards**: one card per proposed `Intervention` — type, target, rationale, impact, and
  Approve/Reject buttons; on click → driver route → refresh board + records. (E3, E4)
- **DecisionTimeline**: the `DecisionRecord[]` rendered newest-last, grouped by kind with rationale. (E5)
- **QuestionBox**: textarea + Ask → `/api/driver/ask` → shows the answer; loading state. (E6)
- **KpiPanel**: static placeholder with the two metric labels and "computed in Phase 7". (E7)
- **ClockControls**: Step (`/api/sim/step`), Assess (`/api/driver/plan`), and a scenario selector
  (`/api/sim/scenario`). (E2, E3)

## 3. Key decisions & trade-offs

| Decision | Why | Trade-off |
| --- | --- | --- |
| **Hand-rolled CSS (globals.css), no Tailwind** | Zero new deps; a bespoke clinical-dashboard look; aligns with "keep it simple" + the pinning discipline. | More CSS to write by hand than utility classes. |
| **One single-page client dashboard** | The value is seeing board + proposals + trace together; no routing needed. | A larger `page.tsx`; mitigated by extracting components. |
| **Refresh-after-action (no websockets/polling)** | Deterministic, simple, and the loop is human-paced anyway. | The board isn't "live" between your actions — fine for this UX. |
| **Driver exposed via a singleton + routes** | The browser needs an HTTP surface; the singleton keeps one Driver + decision log per server. | Singleton resets on server restart (dev HMR) — globalThis-cached to survive reloads. |
| **Q&A reuses the adapter's session** | Simplest path to R9; no extra session plumbing. | Plan + Q&A share conversation history; acceptable for v1 (could split sessions later). |

## 4. Verification (maps to acceptance criteria)

Phase 6's gate is mainly the **live browser walkthrough** named in `development-Plan §4` — automated
DOM tests (Playwright) are deferred to keep scope tight.

| Criterion | How verified |
| --- | --- |
| E1 | Browser: the bed-board shows both wards, bed statuses, ED queue, predicted discharge/blocker; matches `GET /state`. |
| E2 | Step advances the clock and the board changes; loading a scenario resets the world. |
| E3, E4 | Assess shows cards; Approve updates the board (a blocker clears), Reject leaves it unchanged. |
| E5 | The timeline lists the gap/plan/action records in order with rationale. |
| E6 | A typed question returns a sensible answer grounded in the live picture. |
| E7 | The KPI panel renders its placeholder. |
| E8 | `curl` the driver routes (proposals/records/approve) return the expected shapes. |
| E9 | A full step → assess → approve → update → timeline walkthrough works in the browser; `typecheck`/`lint`/`build`/`test` green (the existing 32 tests stay green). |

## 5. Task breakdown (SDD step 3) — the code PR

1. `sim/instance.ts` `resetSimulator` + `api/sim/scenario` route (E2).
2. `driver/instance.ts` singleton + the six `api/driver/*` routes (E8, E3–E6).
3. `globals.css` + `layout.tsx` import.
4. Components: BedBoard, ApprovalCards, DecisionTimeline, KpiPanel, QuestionBox, ClockControls (E1, E5, E6, E7).
5. `page.tsx` dashboard wiring + refresh-after-action (E1–E6).
6. Live browser walkthrough + route smoke checks; gate green (E9).

## 6. Out of scope (restated)

KPI computation + eval (Phase 7), reasoning-quality tuning (Phase 5), auth/persistence/deployment,
real-time push, and any clinical concept (never).
