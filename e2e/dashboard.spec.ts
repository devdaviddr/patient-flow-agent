import { test, expect } from "@playwright/test"
import { login, COORDINATOR } from "./helpers"

test.beforeEach(async ({ page }) => {
  await login(page, COORDINATOR)
})

test("stepping the clock advances the simulated time", async ({ page }) => {
  const clock = page.getByText(/\d{2}-\d{2}-\d{4}/).first()
  await expect(clock).toBeVisible()
  const before = await clock.textContent()
  await page.getByRole("button", { name: "Step 30m" }).click()
  await expect(clock).not.toHaveText(before ?? "")
})

test("running the comparison shows both KPI metrics (deterministic oracle)", async ({ page }) => {
  await page.getByRole("button", { name: "Run the comparison" }).click()
  await expect(page.getByText(/Time patients waited for a bed/i).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(/Spare ready beds at day's end/i).first()).toBeVisible()
})
