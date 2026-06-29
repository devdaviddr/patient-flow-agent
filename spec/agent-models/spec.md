# Spec — Select the model from OpenCode's configured providers (+ OpenRouter)

| | |
| --- | --- |
| **Feature** | Replace the hardcoded model preset list with the providers/models OpenCode *actually has configured*, queried live. Wire the provider credentials (Zen, Anthropic, **OpenRouter**, Ollama) so configuring a key makes that provider's models selectable. |
| **Issue** | [#75](https://github.com/devdaviddr/patient-flow-agent/issues/75) · P2 · milestone *Agent Credibility & Correctness* |
| **Target release** | `0.6.x` (agent reasoning/config) |
| **Status** | 📝 SDD step 1 (Specify) |
| **Branch** | `feat/agent-models` (plan) → `feat/agent-models-impl` (code) |
| **Companions** | `spec/agent-grounding/`, `releases/0.x` (AI config #56) |

> SDD step 1: *what* and *why* + acceptance criteria. Builds directly on the runtime
> AI config (#56), which already lets a coordinator set the model — but from a
> free-text input backed by a **hardcoded** preset list.

---

## 1. Problem

The AI-config Settings panel (#56) sets the model via a free-text input with a
**hardcoded** datalist (`opencode/big-pickle`, `anthropic/...`, `ollama/...`). Two
issues: a user can type a model OpenCode can't actually serve (wrong/absent provider
key → the next assessment fails), and the preset list drifts from reality.

## 2. Exploration — how OpenCode exposes models (verified live)

OpenCode's SDK exposes **`client.config.providers()`** (`GET /config/providers`),
which returns the providers it has configured and, per provider, its model catalogue:

```
{ providers: Provider[], default: { [providerID]: modelID } }
Provider = { id, name, source: "env"|"config"|"custom"|"api", env: string[], models: {…} }
```

Probed against the running harness today:

```
default: { opencode: "big-pickle" }
- opencode (OpenCode Zen)  source=custom  env=[OPENCODE_API_KEY]
    models: mimo-v2.5-free, nemotron-3-ultra-free, deepseek-v4-flash-free,
            north-mini-code-free, big-pickle
```

Key findings:
- **Zen already works with no key** — it's a `custom` provider with a public apiKey, so
  the 5 free models are always available. "Make Zen work" is already true; we just need
  to *surface* its models instead of hardcoding one.
- **Other providers appear when their env key is set.** A provider is listed (with its
  model catalogue) when OpenCode has credentials for it: `ANTHROPIC_API_KEY` →
  `anthropic`, `OPENROUTER_API_KEY` → `openrouter`, a reachable Ollama → `ollama`. They
  are absent today only because those env vars aren't passed to the harness container.
- So **"configure providers via config" = pass the right env vars to the OpenCode
  container**; `config.providers()` then reflects exactly what's usable. No guessing.

## 3. How this fits the solution

- **Single source of truth.** The picker reflects what OpenCode can serve, so a saved
  model is always one the harness has — no "selected anthropic but no key" foot-gun
  (the standing #56 caveat).
- **SDK stays isolated.** Listing goes through `adapter.ts`, the one SDK module.
- **Providers are opt-in by credential.** Zen is the zero-config default; Anthropic and
  **OpenRouter** light up the moment their key is provided to the harness — no code
  change, just env. This is the swappable-provider story made real.
- **Graceful when OpenCode is down.** The panel falls back to free-text so Settings
  never breaks.

## 4. Users

- **The coordinator** — picks from a real list of models OpenCode can serve, grouped by
  provider; can't pick one that will fail.
- **The operator/host** — adds `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`) to the
  harness env and those providers' models immediately appear, no rebuild of app code.
- **The reviewer** — sees the provider-swappable design demonstrated concretely (Zen
  free tier out of the box; Claude / OpenRouter / local Ollama by adding a key).

## 5. User stories

- As a **coordinator**, the model picker lists the models OpenCode actually has
  (Zen's free models always; Anthropic/OpenRouter/Ollama when configured); selecting one
  and saving applies it on the next assessment (as #56).
- As a **coordinator**, if I somehow submit a model OpenCode can't serve, it's rejected
  with a clear message (when the list is verifiable).
- As the **host**, I set `OPENROUTER_API_KEY` once and OpenRouter's models become
  selectable — without touching the app.
- As **anyone**, if the harness is unreachable, Settings still works (free-text fallback).

## 6. Acceptance criteria

| # | Criterion |
| --- | --- |
| **M1** | **Live list.** A new operator-only endpoint returns the providers + models from OpenCode's `config.providers()`, flattened to `provider/model` choices with display names, grouped by provider. Reached only via `adapter.ts` (SDK isolation). |
| **M2** | **Picker reflects reality.** The Settings AI-config model field is populated from M1 — Zen's free models always present; Anthropic/OpenRouter/Ollama present iff configured. |
| **M3** | **Validation.** On save, if the list is fetchable and the chosen model isn't in it, the request is rejected (`400`) with a clear message; if OpenCode is unreachable, the save is allowed (can't verify) — the existing behaviour. S13 prompt validation is unchanged. |
| **M4** | **OpenRouter wired.** `OPENROUTER_API_KEY` is passed to the OpenCode harness container (compose) and documented (`.env.example`); setting it makes `openrouter/*` models appear in the picker with **no app change**. Anthropic (`ANTHROPIC_API_KEY`) likewise. |
| **M5** | **Zero-config default holds.** With no extra keys, Zen's models (incl. `opencode/big-pickle`) are listed and the default still works; first paint needs no blocking OpenCode round-trip. |
| **M6** | **Graceful degradation.** If `config.providers()` fails/times out, the panel falls back to the free-text input (+ a couple of presets) and Settings doesn't break. |
| **M7** | **No regressions.** R7 gate, S12, S13, and the suite stay green; SDK confined to `adapter.ts`. |

## 7. Scope

### In scope
- `adapter.ts`: `listModels()` over `config.providers()` → flattened choices.
- New operator route `GET /api/agent/models`; validation in the AI-config `PUT`.
- Settings: live grouped `<select>` with free-text fallback.
- Compose: pass `OPENROUTER_API_KEY` (+ keep `ANTHROPIC_API_KEY`) to the `opencode`
  service; `.env.example` documents both for the harness.

### Out of scope → later
- Per-subagent model selection; editing the `.opencode/*.md` system prompts.
- OAuth/login flows for providers (we use env-key auth, OpenCode's `source: "env"`).
- Caching the model list server-side (a short client fetch is fine for a demo).

### Out of scope (never, here)
- Any change to the agent reasoning, the sim, the gate, or the eval.

## 8. Dependencies & assumptions

- Builds on #56 (the `agent_config` store + the AI-config panel + `/api/agent/config`).
- Assumes `OPENCODE_URL` reachable from the app (it is in compose). If
  `OPENCODE_SERVER_PASSWORD` is later set, the adapter client must send it — noted.
- Provider auth is by env var (OpenCode's `source: "env"`), consistent with how the
  harness already takes `ANTHROPIC_API_KEY`.
- Synthetic/demo throughout; no secrets committed (keys are env-only).

## 9. Resolved decisions (detail in `implementation.md`)

1. **Source of truth = `config.providers()`**, not a hand-list — it reflects exactly
   what OpenCode can serve, including Zen's public free tier.
2. **Validate in the route, not the DB module** — model-availability needs the SDK;
   keep `agent-config.ts` (DB) free of the SDK. Best-effort: verify when reachable,
   allow when not.
3. **Providers via env, surfaced via config** — Zen needs nothing; Anthropic/OpenRouter
   light up by adding their key to the harness container. No `opencode.json` provider
   block needed (env discovery), only env wiring + docs.
4. **Free-text fallback** so Settings degrades gracefully if the harness is down.
