# Patient Flow Orchestrator — Architecture

| | |
| --- | --- |
| **Version** | 1.2.0 |
| **Status** | Draft |
| **Owner** | David |
| **Date** | 2026-06-13 |
| **Companions** | `PRD.md` (what & why), `OpenCode-Harness.md` (the agent runtime) |

> This is the **whole-solution architecture**: every component, how they connect, the data that flows
> between them, and the cross-cutting rules (safety, reproducibility, observability, portability) that
> shape the design. The PRD says what to build; this says how the pieces fit together.

---

## 1. At a glance

The Patient Flow Orchestrator is an **agent that runs a perceive → reason → plan → act loop over a simulated hospital.** A control loop in our app advances a simulated clock and, each tick, asks an AI agent (running inside the OpenCode harness) to assess the bed position, explain where capacity will fall short, and propose ranked fixes. A human approves each fix before it runs. Everything is synthetic, seedable, and carries zero clinical risk.

Five things make up the system:

1. **Simulator** — the synthetic hospital (state + events). *The environment.*
2. **Tools bridge** — typed functions the agent calls to read state and act. *The only hospital-aware code.*
3. **OpenCode harness** — the agent runtime (orchestrator + two subagents + permission gate).
4. **Loop driver** — our control loop; owns the clock, re-prompts each tick, enforces approval.
5. **Web UI** — bed-board, approval cards, KPI panel.

## 2. Principles that shape the design

- **The environment and the loop are ours; the reasoning is the harness's.** We never re-implement an agent loop; we never let the harness own the clock. (See `OpenCode-Harness.md`.)
- **Only the tools know it's a hospital.** The agent calls neutral functions (`world_state`, `expedite_script`). All domain — and therefore all regulation-relevant — logic lives in the simulator and tools. This is how the *no-clinical-output* rule is enforced in code, not in a prompt.
- **The model is a tool, not the brain of the forecast.** Discharge/demand forecasts are a transparent heuristic exposed as tools, so predictions are always inspectable.
- **Nothing changes state without a human.** Every state-changing action passes an approval gate enforced in our driver.
- **Determinism lives in the environment, not the model.** The simulator is seeded; the model is not. Reproducibility (and fair evaluation) comes from replaying the same event stream.
- **The reasoning provider is swappable.** Hosted Claude or a local model, with no change to tools, simulator, or UI.

## 3. System context (level 1)

```mermaid
flowchart TB
    COORD["Flow coordinator<br/>(in-world user)"]
    REVIEWER["Technical reviewer<br/>(real audience)"]

    subgraph SYS["Patient Flow Orchestrator"]
        APPUI["Web UI"]
        CORE["Agentic core<br/>(loop + harness + simulator + tools)"]
        APPUI --- CORE
    end

    PROV["Model provider<br/>hosted Claude · or local Ollama"]

    COORD -->|"views position, approves actions, asks questions"| APPUI
    REVIEWER -->|"runs scenarios, reads KPIs & decision trace"| APPUI
    CORE -->|"reasoning requests"| PROV

    classDef person fill:#2e2a4d,stroke:#9b8cff,color:#ece8ff;
    classDef sys fill:#1e3a5f,stroke:#4a90d9,color:#e8f0fe;
    classDef ext fill:#3d3416,stroke:#d4a72c,color:#fdf3d6;
    class COORD,REVIEWER person;
    class APPUI,CORE sys;
    class PROV ext;
    style SYS fill:transparent,stroke:#4a90d9,color:#4a90d9;
```

The only external runtime dependency is the **model provider**. There is deliberately **no hospital system and no database of real patients** — out of scope, and part of why the project is safe to publish. Authentication is **self-hosted, not a third-party SaaS**: a Better Auth provider over a local **SQLite store** (accounts + server-side sessions + invite keys) holds **synthetic staff identities only** (fake `.test` emails, no PII), kept structurally **disjoint from the seeded simulator** so determinism (S12) is untouched. The role hierarchy is **viewer ⊂ coordinator ⊂ superadmin**; onboarding is **invite-gated** (single-use keys stored hashed, never plaintext) and `superadmin` user administration runs through the Better Auth **admin plugin**, which is **independently re-gated** at the route layer so the plugin is never the sole authority. The **last superadmin cannot be deleted or demoted** — a DB-level trigger enforces it on every path. Ingress is a Cloudflare Tunnel (see §9), so the edge — not the app — is the only externally addressed surface.

## 4. Component architecture (level 2)

```mermaid
flowchart TB
    subgraph APP["Our code — Next.js app (environment harness)"]
        UI["Web UI<br/>bed-board · approval cards · KPI panel"]
        DRV["Loop driver<br/>owns the clock · re-prompts per tick · enforces approval"]
        EVAL["Eval harness<br/>with/without-agent runs → FlowKPIs"]
    end

    subgraph OC["OpenCode serve — agent harness (configured, not coded)"]
        ORCH["Orchestrator · primary agent<br/>capable model"]
        subgraph SUBS["Subagents · cheaper/local · read-only"]
            DIS["Discharge specialist"]
            DEM["Demand specialist"]
        end
        GATE["Permission gate<br/>action tools = 'ask'"]
        ORCH -->|"delegate"| DIS
        ORCH -->|"delegate"| DEM
        ORCH --- GATE
    end

    PROV["Model providers (swappable)<br/>hosted Claude · local Ollama"]

    subgraph TOOLS["Tools bridge — only hospital-aware code"]
        READ["Read tools<br/>world_state · forecast_discharges · forecast_demand"]
        ACT["Action tools<br/>expedite_script · request_transport"]
    end

    SIM["Simulator — the environment<br/>world state · seedable clock · emits SimEvents"]

    UI --> DRV
    DRV -->|"session.prompt (SDK)"| ORCH
    EVAL -->|"drives tick()"| DRV
    PROV -.->|"reasoning"| ORCH
    ORCH -->|"tool calls"| READ
    DIS -->|"read"| READ
    DEM -->|"read"| READ
    GATE -->|"on approval"| ACT
    READ -->|"GET /state, POST /forecast/*"| SIM
    ACT -->|"POST /actions/* → emits event"| SIM
    SIM -->|"new state → next tick"| DRV
    GATE -.->|"approval request"| UI
    SIM -->|"event stream"| EVAL

    classDef appNode  fill:#1e3a5f,stroke:#4a90d9,color:#e8f0fe;
    classDef ocNode   fill:#1f3d2b,stroke:#4caf72,color:#e6f4ea;
    classDef toolNode fill:#3d3416,stroke:#d4a72c,color:#fdf3d6;
    classDef simNode  fill:#3d1f1f,stroke:#d96a6a,color:#fde8e8;
    classDef modelNode fill:#2e2a4d,stroke:#9b8cff,color:#ece8ff;
    class UI,DRV,EVAL appNode;
    class ORCH,DIS,DEM,GATE ocNode;
    class READ,ACT toolNode;
    class SIM simNode;
    class PROV modelNode;
    style APP fill:transparent,stroke:#4a90d9,color:#4a90d9;
    style OC fill:transparent,stroke:#4caf72,color:#4caf72;
    style SUBS fill:transparent,stroke:#6fce92,color:#6fce92;
    style TOOLS fill:transparent,stroke:#d4a72c,color:#d4a72c;
```

### 4.1 Simulator (the environment)

The only domain-aware *stateful* component. Holds the `WorldState`, advances a **seedable clock**, and emits typed `SimEvent`s — the only thing that mutates state. Exposes a small HTTP surface:

| Endpoint | Purpose |
| --- | --- |
| `GET /state` | current `WorldState` |
| `POST /forecast/discharges` | heuristic discharge forecast (with rationale) |
| `POST /forecast/demand` | heuristic demand forecast (with rationale) |
| `POST /actions/{type}` | apply an approved action → emits a `SimEvent` |

Because it's seeded, the same seed + scenario replays an identical event stream — the basis of reproducibility and fair evaluation.

### 4.2 Tools bridge

Typed TypeScript tools (`tool()` + Zod) registered with the harness. **Read tools** are side-effect-free; **action tools** POST to the simulator and are gated. The tools translate between the agent's neutral vocabulary and the simulator's HTTP API, and they are the boundary that keeps clinical logic out of the agent.

### 4.3 OpenCode harness

The agent runtime — one **primary** orchestrator plus two **read-only subagents** (discharge, demand) and the permission gate. Fully detailed in `OpenCode-Harness.md`; summarised in §4 above.

### 4.4 Loop driver

The outer control loop in the Next.js backend. Each tick it: sends one `session.prompt`, surfaces any proposed action to the UI, runs the approved action tool(s), then advances the clock. It is where the **real approval gate** lives (the harness `ask` is defence-in-depth — see `OpenCode-Harness.md` §7).

### 4.5 Web UI

Renders the **bed-board** (live position), the **approval cards** (the R7 surface), the **decision timeline** (audit trace), and the **KPI panel** (R11 evidence). Also hosts the free-text question box (R9).

### 4.6 Eval harness

Drives `tick()` headlessly across a seeded scenario, once **with** the agent's approved actions and once **without** any agent action, and computes the two `FlowKPIs` for each run.

## 5. Data model & contracts

The typed contracts every component honours (TypeScript/Zod-style; illustrative):

```ts
type ISOTime = string;
type BedStatus   = 'occupied' | 'empty_clean' | 'empty_dirty' | 'blocked';
type BlockerType = 'pharmacy_script' | 'transport' | 'allied_health' | 'placement' | 'none';

interface Ward    { id: string; name: string; bedCount: number; }
interface Bed     { id: string; wardId: string; status: BedStatus; patientId?: string; }
interface Patient {
  id: string; wardId: string; bedId: string; admittedAt: ISOTime;
  predictedDischarge?: { at: ISOTime; confidence: number; ready: boolean };
  blocker: BlockerType;
}
interface WorldState { at: ISOTime; wards: Ward[]; beds: Bed[]; patients: Patient[]; edQueue: string[] }

// The only thing that mutates WorldState
type SimEvent =
  | { kind: 'admission';        at: ISOTime; wardId: string; patientId: string }
  | { kind: 'discharge';        at: ISOTime; patientId: string }
  | { kind: 'blocker_resolved'; at: ISOTime; patientId: string; blocker: BlockerType }
  | { kind: 'bed_cleaned';      at: ISOTime; bedId: string }
  | { kind: 'ed_arrival';       at: ISOTime; patientId: string };

// Forecast tools — transparent heuristic; rationale is part of the contract
interface DischargeForecast {
  wardId: string; horizonHrs: number;
  predicted: { patientId: string; at: ISOTime; ready: boolean; blocker: BlockerType; rationale: string }[];
}
interface DemandForecast { wardId: string; horizonHrs: number; expectedAdmissions: number; rationale: string }

// Reasoning outputs
interface CapacityGap { wardId: string; atTime: ISOTime; projectedDeficit: number; factors: string[] }

type InterventionType   = 'expedite_script' | 'request_transport';  // v1; others deferred (PRD §10)
type InterventionStatus = 'proposed' | 'approved' | 'rejected' | 'executed';
interface Intervention {
  id: string; type: InterventionType;
  targetPatientId?: string; targetBedId?: string;
  addressesGap: string; impactScore: number; rationale: string;
  status: InterventionStatus;
}

// Audit + evaluation
interface DecisionActor { id: string; name: string; role: 'viewer' | 'coordinator' | 'superadmin' }  // denormalized snapshot
interface DecisionRecord {
  at: ISOTime; type: 'gap'|'plan'|'action'; stateRef: string; rationale: string; payload: unknown;
  actor?: DecisionActor;  // who approved/rejected — supplied by the driver/web-session layer, not the harness
}
interface FlowKPIs  { accessBlockHours: number; endOfDayHeadroom: number }
interface EvalResult { scenario: string; seed: number; withAgent: FlowKPIs; withoutAgent: FlowKPIs }
```

**Where each contract lives:** `WorldState`, `SimEvent`, forecasts → the **simulator** (over HTTP). `CapacityGap`, `Intervention` → reasoning **outputs** from the orchestrator. `DecisionRecord` → the **harness session history**, exported for the audit view; its optional `actor` is a denormalized snapshot of the signed-in approver, supplied by the **driver/web-session layer** (the approve/reject routes read the validated session and pass it to the driver) — *not* by the harness. `FlowKPIs`/`EvalResult` → the **eval harness**.

## 6. Control flow — one planning tick

```mermaid
sequenceDiagram
    autonumber
    participant DRV as Loop driver
    participant ORCH as Orchestrator
    participant SUB as Subagents
    participant TOOL as Tools
    participant SIM as Simulator
    participant UI as UI / Human

    DRV->>ORCH: session.prompt ("re-assess & propose")
    ORCH->>TOOL: world_state()
    TOOL->>SIM: GET /state
    SIM-->>ORCH: WorldState
    ORCH->>TOOL: forecast_discharges / forecast_demand
    TOOL->>SIM: POST /forecast/*
    SIM-->>ORCH: forecasts (+ rationale)
    ORCH->>SUB: delegate blocker diagnosis & demand detail
    SUB->>TOOL: read-only tool calls
    SUB-->>ORCH: blockers + incoming load
    ORCH-->>DRV: CapacityGaps + ranked Interventions (proposed)
    DRV->>UI: show approval card(s)
    UI-->>DRV: approve / reject (item-by-item)
    alt approved
        DRV->>TOOL: run action tool
        TOOL->>SIM: POST /actions/* → emits SimEvent
        SIM-->>DRV: new state
    else rejected
        DRV-->>DRV: state unchanged
    end
    DRV->>DRV: record DecisionRecord · advance clock
    Note over DRV,ORCH: re-prompt on next tick (or immediately after an approved action)
```

The closed loop is the return path: an approved action mutates the simulator, the driver advances the clock, and re-prompting on the new state is what makes the system *agentic over time* (PRD R8).

## 7. The safety boundary

The single most important architectural line: **the reasoning layer never sees clinical concepts.**

```mermaid
flowchart LR
    subgraph CLEAN["Reasoning — clinically blind"]
        A["Orchestrator + subagents"]
    end
    subgraph BORDER["Tools — neutral vocabulary only"]
        B["world_state · forecast_* · expedite_script · request_transport"]
    end
    subgraph DOMAIN["Simulator — all domain logic"]
        C["beds · blockers · events · heuristics"]
    end
    A -->|"calls neutral functions"| B
    B -->|"HTTP"| C
    NOTE["No acuity · no triage · no diagnosis · no treatment<br/>anywhere in A or B (asserted by an invariant test)"]
    A -.-> NOTE

    classDef clean fill:#1f3d2b,stroke:#4caf72,color:#e6f4ea;
    classDef border fill:#3d3416,stroke:#d4a72c,color:#fdf3d6;
    classDef domain fill:#3d1f1f,stroke:#d96a6a,color:#fde8e8;
    classDef note fill:transparent,stroke:#9b8cff,color:#ece8ff;
    class A clean;
    class B border;
    class C domain;
    class NOTE note;
```

Because all domain logic sits behind the tools, an automated invariant test can assert that no system output (plan, answer, record) contains acuity, triage, diagnostic, or treatment content (PRD S13). Safety is a property of the architecture, not of prompt wording.

## 8. Cross-cutting concerns

| Concern | How the architecture delivers it |
| --- | --- |
| **Reproducibility** | The *simulator* is seeded; same seed + scenario → identical `SimEvent` stream. The model is not seeded, so the eval runs N trials and reports the distribution. |
| **Observability** | The harness session history is the decision trace; export it as `DecisionRecord`s and render a gaps → plans → approved-actions timeline. |
| **Provider portability** | Reasoning sits behind OpenCode's provider abstraction; switch hosted Claude ↔ local Ollama with no change to tools, simulator, or UI. |
| **Safety** | The tools boundary (§7) + invariant test. |
| **Latency** | One model round-trip per tick; subagents on cheaper/local models; coarse tick granularity for the demo (target a few seconds/cycle). |
| **Human control** | Approval gate enforced in the driver; action tools also marked `ask` as defence-in-depth. |

## 9. Deployment view

```mermaid
flowchart TB
    EDGE["Cloudflare edge<br/>TLS · WAF/DDoS · public HTTPS (BETTER_AUTH_URL)"]
    CFD["cloudflared (tunnel)<br/>dials outbound — no published origin port"]

    subgraph LOCAL["Self-hosted stack (how it ships)"]
        N1["Next.js server<br/>(UI + loop driver + eval + simulator + auth)"]
        O1["opencode serve<br/>(headless)"]
        M1["Anthropic API key  ·  or  ·  local Ollama"]
        DB1[("SQLite auth store<br/>accounts + sessions<br/>(mounted volume — persists restarts)")]
        N1 <-->|"SDK / HTTP"| O1
        O1 -->|"reasoning"| M1
        N1 -->|"better-sqlite3"| DB1
    end

    subgraph CLOUD["Azure Container Apps (noted for later — non-goal)"]
        N2["App container"]
        O2["OpenCode container"]
        N2 <--> O2
    end

    EDGE -->|"tunnel"| CFD
    CFD -->|"CF-Connecting-IP forwarded"| N1
    LOCAL -.->|"containerise later"| CLOUD

    classDef l fill:#1e3a5f,stroke:#4a90d9,color:#e8f0fe;
    classDef c fill:#2e2a4d,stroke:#9b8cff,color:#ece8ff;
    classDef e fill:#3d3416,stroke:#d4a72c,color:#fdf3d6;
    class N1,O1,M1,DB1 l;
    class N2,O2 c;
    class EDGE,CFD e;
    style LOCAL fill:transparent,stroke:#4a90d9,color:#4a90d9;
    style CLOUD fill:transparent,stroke:#9b8cff,color:#9b8cff;
```

The stack ships **self-hosted**: `opencode serve` plus the Next.js server, with the simulator in-process. Ingress is a **Cloudflare Tunnel** — `cloudflared` dials outbound to the edge, so the **app port is never published** and the origin is not directly routable; TLS terminates at the edge (keeping the `Secure` session cookie valid) and the real client IP arrives as `CF-Connecting-IP`, which the sign-in rate limiter keys on. Accounts and server-side sessions live in a **SQLite file on a mounted volume**, so they **survive a container restart** without re-seeding. Containerising on Azure Container Apps is noted for later but is explicitly a non-goal. "Rollback" is trivial — reset means reseed the simulator (the auth store persists independently).

## 10. Technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| Agent runtime | **OpenCode** (`opencode serve`) | Native primary/subagent model, permission gate, provider-swap, session audit — platform over bespoke framework. |
| Control loop / backend | **Next.js** + `@opencode-ai/sdk` | Drives one `session.prompt` per tick; keeps the clock and environment ours. |
| Frontend | **Next.js (App Router)** | Bed-board, approval cards, decision timeline, KPI panel. |
| Environment | **In-process `Simulator`** | Typed `SimEvent`s on a seedable clock; the only stateful domain component. |
| Forecast | **Transparent heuristic** as a tool | Inspectable rationale; keeps the agentic layer the showcase (no trained model in v1). |
| Tools | **TS `tool()` + Zod** in `.opencode/tools/` | Type-safe args; native to the permission system. |
| Models | **Anthropic API** or **local Ollama** via OpenCode | Satisfies provider portability. |
| Eval | **Headless sim runs** → `FlowKPIs` | Evidence, deterministic on a fixed seed. |

## 11. Key risks (architecture-relevant)

- **SDK permission bypass** — `ask`/`deny` may be ignored for SDK-driven sessions, so the real gate is in the driver (see `OpenCode-Harness.md` §7).
- **Agent non-determinism** — handled by seeding the environment, not the model, and reporting distributions.
- **API drift** — pin OpenCode; isolate SDK calls behind one adapter module.
- **Per-tick latency** — cheaper/local subagent models; coarse tick granularity.
- **Scope creep into clinical logic** — prevented by the tools boundary + invariant test.

---

## Changelog

| Version | Date | Note |
| --- | --- | --- |
| 1.0.0 | 2026-06-11 | Initial whole-solution architecture: principles, system-context (L1) and component (L2) diagrams, component breakdown, data contracts, control-flow sequence, safety-boundary diagram, cross-cutting concerns, deployment view, stack, risks. |
| 1.1.0 | 2026-06-13 | Auth (0.4.0): §3 — self-hosted auth provider (Better Auth) + SQLite store of synthetic identities, disjoint from the seeded sim; §5 — added `DecisionActor` and `DecisionRecord.actor` (denormalized snapshot, supplied by the driver/web-session layer); §9 — Cloudflare Tunnel ingress (un-published origin port, edge TLS, `CF-Connecting-IP`) and the SQLite persistence volume. |
| 1.2.0 | 2026-06-13 | Onboarding + admin (0.5.0): §3 — invite-key store (hashed, single-use), the `viewer ⊂ coordinator ⊂ superadmin` hierarchy, the admin plugin behind an independent route-layer gate, and the DB-level last-superadmin trigger; §5 — `DecisionActor.role` widened to include `superadmin`. |
