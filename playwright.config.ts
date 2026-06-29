import { defineConfig, devices } from "@playwright/test"

// E2E against a running stack (`docker compose up` or `make dev`). The app must be
// reachable at E2E_BASE_URL. These cover the model-free golden path — auth, role
// gating, clock, and the deterministic KPI eval. The agent-driven approve flow needs
// a live model and is out of scope here (tracked in #31).
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
