import { defineConfig } from "drizzle-kit"

// Migrations for the auth store only. AUTH_DB_PATH points at a file on a mounted
// volume in deployment; defaults to a repo-local file for local dev.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/auth/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.AUTH_DB_PATH ?? "./auth.db",
  },
})
