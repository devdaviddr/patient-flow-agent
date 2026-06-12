# Spec — Web UI

| | |
| --- | --- |
| **Feature** | The human surface — bed-board, approval cards, decision timeline, KPI panel, Q&A, clock controls |
| **Phase** | 6 of the development plan |
| **Version** | 0.1.0 |
| **Status** | Plan PR — awaiting review/merge |
| **Branch** | `feat/web-ui` (plan) → `feat/web-ui-impl` (code) |
| **Companions** | `Architecture.md` (§4.5), `PRD.md` (R7, R9, R10, §6), `development-Plan.md` (Phase 6) |

> SDD step 1 (Specify): *what* this feature is and *why*, plus acceptance criteria and scope. No
> implementation detail — that lives in `implementation.md`.

---

## 1. Problem

Everything works, but only from a terminal. There is no screen a person can look at to see the bed
position, approve a fix, or read what the agent decided. This feature builds that screen: the
**human surface** that turns the engine + agent into something you can *watch and drive in a browser*.

It also gives the loop driver its **browser-facing routes** — until now the `Driver` is only callable
from code. This phase exposes plan / approve / reject / records over HTTP so the UI can drive them.

## 2. How this fits the solution

- **It is component 5 of 5 — the Web UI, our code.** It renders the live world and is the surface for
  the human-in-the-loop. (`Architecture §1, §4.5`)
- **It is the R7 approval surface.** The driver enforces the gate; this is where a human actually sees
  each proposed intervention and clicks approve or reject, item-by-item. (`PRD R7`)
- **It exposes the audit trail and answers questions.** The decision timeline renders the driver's
  records (R10); the question box answers plain-language questions from the live picture (R9).
- **It renders real proposals, not placeholders.** It sits after the driver (Phase 4) and the real
  tools (Phase 2), so the board, cards, and timeline show real data. (`development-Plan §7`)
- **It leaves a slot for the evidence.** A KPI panel placeholder is wired now; Phase 7 fills it.

## 3. Users

- **The flow coordinator (in-world)** — views the projected position, approves/rejects fixes, asks
  plain-language questions.
- **The technical reviewer (real audience)** — steps a scenario, watches the loop run, reads the
  decision trace, and (after Phase 7) the KPIs.
- **The developer** — runs `npm run dev` + `opencode serve` and drives the whole loop in a browser.

## 4. User stories

- As a **coordinator**, I see a **bed-board**: both wards, every bed and its status, the ED queue, and
  each patient's predicted discharge + blocker.
- As a **coordinator**, I press **Assess** and the agent's proposed interventions appear as cards I can
  **approve or reject individually**; approving updates the board, rejecting changes nothing.
- As a **coordinator**, I **step the clock** (and load a named scenario) and watch the position change.
- As a **coordinator**, I **ask a question** ("what's tonight looking like?", "why is 4B blocked?") and
  get an answer grounded in the live picture.
- As a **reviewer**, I read a **decision timeline** of gaps → plans → approved/rejected actions, in order.
- As a **reviewer**, I see a **KPI panel** (placeholder now; real numbers after Phase 7).

## 5. Acceptance criteria

| # | Criterion | Source |
| --- | --- | --- |
| E1 | A **bed-board** renders the live `WorldState`: both wards, every bed with its status, the ED queue, and per-patient predicted discharge + blocker. Refreshes after each action/tick. | R2 surface |
| E2 | **Clock controls**: step one tick, and load/reset to a named scenario (`normal-weekday` / `flu-surge`). | PRD §6 |
| E3 | An **Assess** control runs `Driver.plan()`; the proposed interventions render as **approval cards**, each with approve/reject and the rationale. | R7 surface |
| E4 | **Approve** executes exactly that action and the board updates to reflect it; **reject** changes nothing. Item-by-item. | **R7 / S6** |
| E5 | A **decision timeline** lists gaps → plans → actions from the driver records, in order, each with its rationale. | R10 surface |
| E6 | A **question box** answers plain-language questions from the live picture via the orchestrator. | **R9** |
| E7 | A **KPI panel** placeholder is present and wired (filled in Phase 7). | R11 surface |
| E8 | **Driver HTTP routes** expose plan / proposals / approve / reject / records / ask to the browser, backed by a driver singleton sharing the sim. | (enables the UI) |
| E9 | The app runs **end-to-end in a browser**: step → assess → approve → board updates → timeline shows it; and the gate is green (typecheck/lint/build/test). | — |

## 6. Scope

### In scope
- The single-page **dashboard**: bed-board, approval cards, decision timeline, KPI placeholder,
  question box, clock controls.
- The **driver API routes** (`/api/driver/*`) + a driver singleton.
- Wiring the UI to the existing `/api/sim/*` (state, step, scenario) and the new driver routes.

### Out of scope (later phases)
- **KPI computation** and the eval harness (Phase 7) — the panel is a placeholder.
- **Reasoning quality** tuning (Phase 5) — the UI renders whatever the agent proposes.
- **Auth, multi-hospital, persistence, deployment** — never in v1.
- **Real-time push** — a simple refresh-after-action model is enough (no websockets).

## 7. Dependencies & assumptions

- Builds on the merged simulator, tools, harness, and driver (Phases 1–4) on `main`.
- Assumes `opencode serve` is running for the Assess (`plan`) and Q&A (`ask`) calls; the bed-board,
  stepping, and timeline work without it.
- The driver and sim share the Next.js process (the driver acts in-process), so the UI's driver routes
  and the harness's tool reads see the same world.
- Assess and Q&A involve a model round-trip — the UI shows a loading state; they are not instant.

## 8. Resolved decisions (detail in implementation.md)

1. **Styling** → hand-rolled **CSS** (`globals.css`), no Tailwind — zero new deps and a bespoke
   clinical-dashboard look.
2. **Layout** → one **single-page dashboard** (client component) showing board + proposals + timeline +
   KPI + Q&A together.
3. **Refresh model** → **refresh-after-action** (no websockets/polling); the loop is human-paced.
4. **Q&A** → a `/api/driver/ask` route that prompts the orchestrator with the plain question via the
   adapter (no JSON).
