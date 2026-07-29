import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the CCS console.
 *
 * These exercise what the unit suite structurally cannot: the real browser
 * against the real app against real Postgres — session auth, role gating, and
 * the propose → sign-off → FINAL loop as a human actually performs it.
 *
 * Prereq: a seeded database (`npm run db:setup`). CI provisions one per run, so
 * the seeded drift these tests rely on is always present there.
 */
export default defineConfig({
  testDir: "./e2e",
  // The suite WRITES to a shared database (signing off mutates registers), so
  // parallel workers would race each other for the same rows. Serial is the
  // honest choice; the suite is small enough that it costs little.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // Generous, because the dev server compiles each route on FIRST visit — a cold
  // page can take many seconds, which is latency, not failure.
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // Deliberately `next dev`, in CI too — NOT the production build.
    //
    // These tests sign in through the dev-login form, and that provider is
    // hard-gated off when NODE_ENV === "production" (src/auth.ts). That gate is
    // the point: a shipped build must not be loggable-into with a test form. So
    // the suite runs against a development server rather than weakening the gate
    // to suit the tests. `npm run build` still runs in CI as its own gate,
    // covering the type-check and the production compile.
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
