// Live model list (#75): listModels flattens OpenCode's config.providers() into
// provider/model choices, and degrades to [] when the harness is unreachable. The SDK
// client is mocked so the test is fast + offline.

import { afterEach, describe, expect, it, vi } from "vitest"

const providers = vi.fn()
vi.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: () => ({ config: { providers } }),
}))

import { listModels } from "@/driver/adapter"

afterEach(() => vi.clearAllMocks())

describe("listModels (#75)", () => {
  it("flattens OpenCode's providers into provider/model choices", async () => {
    providers.mockResolvedValue({
      data: {
        providers: [
          {
            id: "opencode",
            name: "OpenCode Zen",
            models: { "big-pickle": { id: "big-pickle", name: "Big Pickle" } },
          },
          {
            id: "openrouter",
            name: "OpenRouter",
            models: { "anthropic/claude-3.5": { id: "anthropic/claude-3.5", name: "Claude 3.5" } },
          },
        ],
      },
    })
    const list = await listModels()
    expect(list).toContainEqual({
      id: "opencode/big-pickle",
      providerID: "opencode",
      modelID: "big-pickle",
      name: "Big Pickle",
      provider: "OpenCode Zen",
    })
    expect(list.find((m) => m.providerID === "openrouter")?.id).toBe("openrouter/anthropic/claude-3.5")
  })

  it("returns [] when the harness is unreachable (graceful)", async () => {
    providers.mockRejectedValue(new Error("ECONNREFUSED"))
    expect(await listModels()).toEqual([])
  })
})
