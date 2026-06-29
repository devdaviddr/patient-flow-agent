import { expect, type Page } from "@playwright/test"

// Demo accounts (synthetic, committed — they guard nothing real). Mirrors
// src/auth/demo-credentials.ts; kept literal here so e2e has no app-source import.
export const COORDINATOR = { email: "coordinator@example-hospital.test", password: "demo-coordinator-2026" }
export const VIEWER = { email: "viewer@example-hospital.test", password: "demo-viewer-2026" }

// Sign in via the login form and wait for the dashboard.
export async function login(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto("/login")
  await page.locator('input[type="email"]').fill(who.email)
  await page.locator('input[type="password"]').fill(who.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/$/)
}
