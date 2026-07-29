import type { Page } from "@playwright/test";

export type Role = "ar" | "compliance" | "smf";

/**
 * Sign in through the dev-login form (AUTH_DEV_LOGIN=true). Signing in again
 * replaces the session, which is how these tests switch role mid-flow — the
 * propose → sign-off loop deliberately requires two different people.
 */
export async function signIn(page: Page, role: Role): Promise<void> {
  await page.goto("/api/auth/signin");
  await page.getByRole("textbox").first().fill(role);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Auth.js redirects back to the app; wait for the form to be gone rather than
  // for a specific URL, since the callback target varies.
  await page.waitForLoadState("networkidle");
}

/** The seeded AR roster (CLAUDE.md rule 7 — fixed at these three). */
const AR_IDS = ["ar_six", "ar_codrington", "ar_drakestar"] as const;

/**
 * Guarantee at least one PENDING draft exists, so queue tests do not depend on
 * ambient database state. Proposes a CPD update for the first firm that is
 * actually out of step (a firm already in step returns 409, which is fine).
 *
 * Requires an operator session. `page.request` shares the browser's cookies, so
 * this is the same authenticated caller as the UI.
 */
export async function ensurePendingDraft(page: Page): Promise<boolean> {
  for (const arId of AR_IDS) {
    const res = await page.request.post("/api/cpd/propose", {
      data: { arId, person: "Approved Person" },
    });
    if (res.status() === 201) return true;
  }
  return false;
}
