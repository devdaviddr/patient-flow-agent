// Runtime AI config (#56): defaults, partial-update persistence, the S13 prompt
// guard, and reset. Runs against a fresh temp DB.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTempAuthDb, type TempAuthDb } from "./helpers/temp-auth-db"

let temp: TempAuthDb
let cfg: typeof import("@/driver/agent-config")

beforeAll(async () => {
  temp = setupTempAuthDb()
  cfg = await import("@/driver/agent-config")
})
afterAll(() => temp.cleanup())
beforeEach(() => cfg.resetAgentConfig())

describe("agent config (#56)", () => {
  it("returns the built-in defaults when unset", () => {
    const c = cfg.getAgentConfig()
    expect(c.model).toBe(cfg.DEFAULT_MODEL)
    expect(c.systemPrompt).toBeNull()
    expect(c.planInstruction).toBe(cfg.DEFAULT_PLAN_INSTRUCTION)
    expect(c.promptTimeoutMs).toBe(cfg.DEFAULT_PROMPT_TIMEOUT_MS)
  })

  it("persists a partial update + merges, surviving a fresh read ('restart')", () => {
    cfg.setAgentConfig({ model: "anthropic/claude-sonnet-4-5", promptTimeoutMs: 30_000 })
    const c = cfg.getAgentConfig()
    expect(c.model).toBe("anthropic/claude-sonnet-4-5")
    expect(c.promptTimeoutMs).toBe(30_000)
    expect(c.planInstruction).toBe(cfg.DEFAULT_PLAN_INSTRUCTION) // untouched fields preserved
  })

  it("rejects a custom prompt that carries clinical vocabulary (S13) and does not persist it", () => {
    expect(() =>
      cfg.setAgentConfig({ planInstruction: "diagnose the case and assign a triage score" }),
    ).toThrow(cfg.AgentConfigError)
    expect(cfg.getAgentConfig().planInstruction).toBe(cfg.DEFAULT_PLAN_INSTRUCTION)
  })

  it("rejects a too-small timeout", () => {
    expect(() => cfg.setAgentConfig({ promptTimeoutMs: 10 })).toThrow(cfg.AgentConfigError)
  })

  it("reset restores defaults", () => {
    cfg.setAgentConfig({ model: "ollama/llama3.1" })
    cfg.resetAgentConfig()
    expect(cfg.getAgentConfig().model).toBe(cfg.DEFAULT_MODEL)
  })

  it("parseModel splits provider/model, defaulting the provider", () => {
    expect(cfg.parseModel("anthropic/claude-sonnet-4-5")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5",
    })
    expect(cfg.parseModel("bare")).toEqual({ providerID: "opencode", modelID: "bare" })
  })
})
