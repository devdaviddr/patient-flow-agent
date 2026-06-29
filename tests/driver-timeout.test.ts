// withTimeout (#48) — bounds OpenCode round-trips so a hung agent session can't pin
// an assessment "running" forever. Pure + offline (no SDK import).

import { describe, expect, it } from "vitest"
import { withTimeout } from "@/driver/timeout"

describe("withTimeout (#48)", () => {
  it("rejects when the promise never settles", async () => {
    await expect(withTimeout(new Promise<never>(() => {}), 20, "prompt")).rejects.toThrow(/timed out/)
  })

  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "prompt")).resolves.toBe("ok")
  })

  it("propagates the underlying rejection unchanged", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "prompt")).rejects.toThrow(
      "boom",
    )
  })
})
