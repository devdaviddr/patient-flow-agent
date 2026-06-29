import { test, expect } from "@playwright/test"
import { login, COORDINATOR, VIEWER } from "./helpers"

test("an unauthenticated visit is redirected to /login", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login/)
})

test("a coordinator signs in and sees the operator controls", async ({ page }) => {
  await login(page, COORDINATOR)
  await expect(page.getByRole("heading", { name: "Active Wards" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Step 30m" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Assess", exact: true })).toBeVisible()
})

test("a viewer signs in read-only — no operator controls (#45)", async ({ page }) => {
  await login(page, VIEWER)
  await expect(page.getByText("Read-only (viewer)")).toBeVisible()
  await expect(page.getByRole("button", { name: "Step 30m" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Assess", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Run the comparison" })).toHaveCount(0)
})
