# Success Criteria — S1–S13

Each PRD success criterion, with where it is proven. "Test" = an automated assertion in `tests/`;
"Live" = verified by running the stack (recorded in the relevant phase PR).

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| **S1** | A seeded day produces events in order; the live picture matches them. | ✅ Test | `tests/simulator.test.ts` — event ordering + admission shows up as an occupied bed. |
| **S2** | Each forecast comes with a human-readable reason. | ✅ Test | `tests/forecast.test.ts` — every prediction has a non-empty `rationale`. |
| **S3** | When discharges fall short of admissions, the agent reports a gap *with an explanation*. | ✅ Live | Phase 4/6 — `Driver.plan()` returns `CapacityGap`s with `factors`; live Assess showed 2 gaps with factors (PR #6, #8). |
| **S4** | Each not-ready discharge gets a specific blocker and reason. | ✅ Test/Live | `forecast_discharges` returns `blocker` + `rationale` per patient (`tests/forecast.test.ts`); the discharge subagent diagnoses across all four types. |
| **S5** | The plan is a ranked list, each item tied to the gap it fixes. | ✅ Live | `ProposedPlan.interventions` carry `impactScore` (ranked) + `addressesGap`; live Assess returned 4 ranked interventions (PR #10 / #6). |
| **S6** | Reject → nothing changes. Approve → exactly one event. | ✅ Test | `tests/driver.test.ts` — approve clears exactly one blocker; reject leaves state byte-identical. |
| **S7** | After a change, the new position differs in a way traceable to that change. | ✅ Test | `tests/driver.test.ts` — re-plan after approve reflects the change; `advanceClock` moves time. |
| **S8** | Plain-language questions get answers consistent with the live picture. | ✅ Live | `/api/driver/ask` + the question box (R9); verified live in Phase 6 (PR #8). |
| **S9** | Every gap, plan and action has a saved decision record. | ✅ Test | `tests/driver.test.ts` — records contain `gap`, `plan`, `action` with rationale + stateRef. |
| **S10** | The evaluation outputs both metrics for with/without runs in a KPI panel. | ✅ Test/Live | `tests/eval.test.ts` + `GET /api/eval/run` rendered by the KPI panel (PR #10). |
| **S11** | **The agent helps** — in both scenarios, fewer access-block hours *and* more headroom. | ✅ Test | `tests/eval.test.ts` asserts the inequality for both scenarios. See [results](../README.md#results--does-the-agent-help). |
| **S12** | The same seed run twice produces identical results. | ✅ Test | `tests/determinism.test.ts` (sim) + `tests/eval.test.ts` (eval determinism). |
| **S13** | No system output ever contains clinical content (asserted by a test). | ✅ Test | `tests/safety.test.ts` — denylist scan over tools, prompts, and sampled outputs, with a control. |

## How to reproduce

```bash
make test     # S1, S2, S4, S6, S7, S9, S10, S11, S12, S13 (35 assertions)
make eval     # S11 headline numbers
make dev      # S3, S5, S8 (live: Step → Assess → Approve → Ask)
```

## Notes

- **S3, S5, S8** depend on a live model round-trip (the orchestrator), so they're verified by running
  the stack rather than by a deterministic unit test — the agent's output isn't seeded (by design;
  determinism lives in the simulator, per `Architecture.md §8`).
- The eval's default "agent" is a **deterministic oracle policy** taking the same actionable
  interventions the agent proposes, which makes S11 reproducible and CI-safe; the live loop (S3/S5)
  shows the real agent proposes exactly these. See `spec/eval/`.
