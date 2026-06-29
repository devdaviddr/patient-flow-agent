# Case study — Patient Flow Orchestrator

> A one-page write-up of what the agent does, how we measured whether it helps, the
> numbers, and why the design is safe to pilot. Synthetic data throughout — no real
> patient data, ever, and no clinical output.

---

## The problem

When a hospital runs short of clean, empty beds, patients wait in the emergency
department for one to free up — **access block**. Most of the delay isn't clinical;
it's **logistics**: a discharge that's medically ready but stuck waiting on a pharmacy
script, transport, an allied-health sign-off, or a placement destination. A bed-flow
coordinator spends the day spotting those stuck discharges and chasing the blocker.

## What it does

An AI agent runs a **perceive → reason → plan → act** loop over a *simulated* hospital
(one ED + two inpatient wards). Each tick it:

1. **Perceives** the live bed position and **forecasts** discharges + incoming demand
   (transparent, rule-based — every forecast carries a plain-English reason).
2. **Detects** where a ward will run short over the horizon and **explains why**.
3. **Diagnoses** each not-ready discharge's specific blocker and **proposes a ranked
   list of fixes**, each tied to the gap it addresses.
4. **Stops for a human.** A coordinator approves or rejects each proposal item-by-item;
   only an approved action changes anything.

## Does it help?

We measure two **flow KPIs** over a full seeded day, **with** the agent's approved
actions and **without** any agent action:

- **Access-block hours** — total patient-time waiting for a bed (lower is better).
- **End-of-day headroom** — clean, empty beds left at day's end (higher is better).

Because the simulator is **seedable**, the same scenario replays an identical day, so
the comparison is fair and reproducible (`npm run eval`).

| Scenario | Access-block hours (without → with) | End-of-day headroom (without → with) |
| --- | --- | --- |
| Normal weekday | **14.5 → 9.0**  (−38%) | **1 → 2** |
| Flu surge | **84.5 → 44.5**  (−47%) | **1 → 2** |

The agent helps on **both** metrics in **both** scenarios (success criterion **S11**).
The headline table uses the **deterministic policy** (the reproducible baseline); a
**real-agent** eval mode drives the actual LLM over N trials and confirms it acts in
the same direction (`npm run eval -- --mode agent`).

> ROI framing: on the flu-surge day the agent removes **~40 bed-hours** of access
> block — roughly the difference between several patients boarding in the ED overnight
> and not.

## Why it's safe to pilot

- **The human is the only one who can change state.** The approval gate is
  *structural*, not behavioural: the agent's credential is scoped to **read-only**, so
  the only path to a bed change is a coordinator's approval — proven by test, not trust.
- **Every change is attributed and audited.** Each approval records *who* decided;
  the decision timeline survives a restart.
- **No clinical output, ever.** The agent reasons about beds and logistics only;
  a code-enforced test blocks clinical vocabulary anywhere the system authors or emits.
- **Shadow-mode ready.** The agent proposes; the coordinator decides. That's exactly a
  safe week-one pilot: run it on one ward, measure access-block hours, change nothing
  without a human.

## How it's built

Next.js (App Router) + TypeScript (strict). The agent runs in the **OpenCode** harness
(default model: OpenCode Zen free tier `opencode/big-pickle`, swappable to hosted
Claude or local Ollama at runtime). An in-process, **seedable** simulator is the
environment; our loop driver owns the clock and the approval gate. Real self-hosted
auth (Better Auth + SQLite) with a `viewer ⊂ coordinator ⊂ superadmin` hierarchy and
an attributed, persisted audit trail. 250+ fast, deterministic tests; Playwright e2e + CI.

## Demo

A ~2-minute walkthrough — sign in → step the clock → run an assessment → approve an
intervention → watch the bed-board change → open the KPI panel.

> 📹 _Demo recording: to be added._ Run it yourself: `make dev` (or `docker compose up`),
> then sign in with the seeded coordinator account on the login screen.
