# Implementation — Select the model from OpenCode's configured providers (+ OpenRouter)

| | |
| --- | --- |
| **Spec** | `spec/agent-models/spec.md` |
| **Issue** | [#75](https://github.com/devdaviddr/ai-patient-flow-orchestrator/issues/75) · P2 |
| **Status** | 📝 SDD step 2 (Design) — code after the plan PR is approved |
| **Surface** | `adapter.ts` (+1 fn) · new `GET /api/agent/models` route + policy entry · AI-config `PUT` validation · Settings panel picker · compose `opencode` env + `.env.example`. No schema/migration. |

## 1. Approach

OpenCode's `client.config.providers()` already returns exactly what we need. Add
`listModels()` to the adapter that calls it and flattens to `provider/model` choices; a
new operator route serves them; the Settings panel renders a grouped `<select>` from
them (free-text fallback); the AI-config `PUT` best-effort-validates the chosen model
against the list. OpenRouter (and any env-keyed provider) appears automatically once its
key reaches the harness container — so the only "config" needed is env wiring.

## 2. The change

### 2.1 `src/driver/adapter.ts` — `listModels()`

```ts
export interface ModelChoice {
  id: string          // "provider/model", what agent-config stores
  providerID: string
  modelID: string
  name: string        // model display name
  provider: string    // provider display name
}

// All models OpenCode currently has configured, flattened. Empty array if the harness
// is unreachable (the caller degrades gracefully — never throws to the UI).
export async function listModels(): Promise<ModelChoice[]> {
  try {
    const res = await withTimeout(getClient().config.providers(), 10_000, "config.providers")
    const providers = res.data?.providers ?? []
    return providers.flatMap((p) =>
      Object.values(p.models).map((m) => ({
        id: `${p.id}/${m.id}`,
        providerID: p.id,
        modelID: m.id,
        name: m.name,
        provider: p.name,
      })),
    )
  } catch {
    return []
  }
}
```

Keeps the SDK confined to `adapter.ts`. Bounded by the existing `withTimeout`.

### 2.2 New route `src/app/api/agent/models/route.ts`

```ts
export const GET = withPolicy("operator", async () => {
  const { listModels } = await import("@/driver/adapter")
  return NextResponse.json(await listModels())  // [] when unreachable
})
```

Classify in `policy.ts`: `"/api/agent/models": "operator"`. Route count 27 → 28 (update
the enumeration sanity test).

### 2.3 Validation in the AI-config `PUT` (`src/app/api/agent/config/route.ts`)

Before `setAgentConfig(patch)`, when `patch.model` is present:

```ts
const available = await listModels()           // [] if unreachable
if (patch.model && available.length > 0 && !available.some((m) => m.id === patch.model)) {
  return NextResponse.json({ error: `model "${patch.model}" is not offered by OpenCode` }, { status: 400 })
}
```

So: verifiable → reject unknown; unreachable (`[]`) → allow (can't verify). The S13
prompt validation inside `setAgentConfig` is unchanged.

### 2.4 Settings panel (`src/app/(app)/settings/page.tsx`)

- On mount (operator), fetch `/api/agent/models` alongside `/api/agent/config`.
- If the list is non-empty, render a `<select>` grouped by provider (`<optgroup>`),
  value = `cfg.model`; include the current value even if not in the list (so a saved
  custom model still shows). On change → `setCfg({ ...cfg, model })`.
- If the list is **empty** (harness down), keep the current free-text `<input>` +
  `<datalist>` of presets — the graceful fallback (M6).

### 2.5 Providers via env (M4) — `docker-compose.yml` `opencode` service + `.env.example`

```yaml
  opencode:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}      # already present → anthropic/* appear
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}    # NEW → openrouter/* appear
      - OLLAMA_URL=http://ollama:11434                # already present (--profile local)
      # …
```

`.env.example`: document `OPENROUTER_API_KEY` (and that `ANTHROPIC_API_KEY` also feeds
the harness) — "set to make that provider's models selectable in Settings". No
`opencode.json` provider block: OpenCode auto-discovers env-keyed providers
(`source: "env"`), and adding one would only duplicate that. Zen stays the zero-config
default.

## 3. Tests

- **`tests/adapter` is SDK-touching**, so test `listModels` by mocking the SDK client:
  a new `tests/agent-models.test.ts` with `vi.mock("@opencode-ai/sdk", …)` returning two
  fake providers → assert the flattened `provider/model` choices + names. Also assert it
  returns `[]` when the client throws (graceful).
- **Route + validation** via the existing mocked-auth pattern: with `listModels` stubbed
  to a known list, `PUT /api/agent/config { model: "x/unknown" }` → `400`; a known model →
  `200`; with `listModels` → `[]`, an unknown model → allowed (`200`). Mock
  `@/driver/adapter`'s `listModels` for these.
- Update the route-count sanity assertion (27 → 28).
- The safety scan covers `settings/page.tsx` (already in `SRC_AUTHORED`); new picker copy
  is logistics-only.

## 4. Verification

- **Unit:** `npm test` green incl. the new tests; full suite stays green.
- **Gates:** `typecheck` · `lint` · `build` clean.
- **Live (Docker):** `GET /api/agent/models` (as coordinator) lists Zen's 5 free models;
  set `OPENROUTER_API_KEY` in `.env`, rebuild the `opencode` service, and confirm
  `openrouter/*` models appear; saving an unknown model returns `400`.
- **Invariants:** SDK only in `adapter.ts`; S12/S13 untouched.

## 5. Risks & mitigations

- **`config.providers()` slow/unreachable** → `withTimeout` + `try/catch → []` + the
  free-text fallback; Settings never blocks.
- **Large model catalogues** (OpenRouter lists hundreds) → group by provider; acceptable
  for a demo. (A future filter/typeahead is a follow-up.)
- **`OPENCODE_SERVER_PASSWORD` set** → the adapter client would need to send it; out of
  scope here (empty in dev), noted for the deploy work.
- **Saved model later becomes unavailable** (key removed) → the next assessment fails and
  surfaces via #48; the picker shows the current value so the user can re-pick.

## 6. Rejected alternatives

1. **Keep the hardcoded datalist.** Rejected — it's the whole problem (drift + foot-gun).
2. **Define providers in `opencode.json`.** Rejected — env-discovery already lists
   env-keyed providers; a config block duplicates it and risks divergence.
3. **Validate model availability in `agent-config.ts`.** Rejected — it's a DB module;
   pulling the SDK in there breaks isolation. Validate in the route.
4. **Hard-fail the save when OpenCode is unreachable.** Rejected — can't verify ≠ invalid;
   allow + rely on the runtime failure surfacing (#48).

## 7. Rollout

- Plan PR (`feat/agent-models`): these two docs. Merge first.
- Code PR (`feat/agent-models-impl`): adapter + route + validation + Settings + compose/
  env + tests + `releases/0.6.x.md`. Closes #75.
