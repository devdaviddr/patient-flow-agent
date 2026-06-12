// One Driver per dev server (shares the sim singleton). Cached on globalThis so it
// survives Next.js hot-reloads. resetDriver() is called when a new scenario loads,
// so the fresh world also gets a fresh decision log.

import { Driver } from "./driver"

const g = globalThis as unknown as { __driver?: Driver }

export function getDriver(): Driver {
  if (!g.__driver) g.__driver = new Driver()
  return g.__driver
}

export function resetDriver(): void {
  g.__driver = undefined
}
