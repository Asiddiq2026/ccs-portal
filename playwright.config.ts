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
  // Generous, because the local dev server compiles each route on FIRST visit —
  // a cold page can take many seconds, which is latency, not failure. (CI runs
  // the production build, where pages are precompiled.)
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // CI runs the production build (closer to what ships); locally reuse the dev
    // server if one is already up, otherwise start it.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
