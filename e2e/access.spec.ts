import { test, expect } from "@playwright/test";
import { ensurePendingDraft, signIn } from "./helpers";

// Access control as a browser experiences it. The unit suite proves the guards
// return the right status; these prove the guards are actually WIRED to the
// pages a person can reach.

test.describe("unauthenticated access fails closed", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/signoff", "/cpd", "/risk", "/ars", "/infra"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      // The middleware gate sends anonymous traffic to the Auth.js sign-in page.
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    });
  }
});

test.describe("an AR cannot reach principal-firm screens", () => {
  test("risk scoring is refused", async ({ page }) => {
    await signIn(page, "ar");
    await page.goto("/risk");
    await expect(page.getByText(/operators only/i)).toBeVisible();
    // The register itself must not leak through the refusal.
    await expect(page.getByText(/AR Risk Scoring/i)).toHaveCount(0);
  });

  test("the AR register is refused", async ({ page }) => {
    await signIn(page, "ar");
    await page.goto("/ars");
    await expect(page.getByText(/operators only/i)).toBeVisible();
  });

  test("backend diagnostics are refused", async ({ page }) => {
    await signIn(page, "ar");
    await page.goto("/infra");
    await expect(page.getByText(/operators only/i)).toBeVisible();
  });
});

test.describe("sign-off authority is SMF-only", () => {
  test("COMPLIANCE never gets a sign-off control", async ({ page }) => {
    await signIn(page, "compliance");
    // Put a real draft in the queue so this is not vacuously true on an empty one.
    await ensurePendingDraft(page);
    await page.goto("/signoff");
    await expect(page.getByRole("heading", { name: /sign-off queue/i })).toBeVisible();
    await expect(page.getByText(/sign-off is smf-only/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign off/i })).toHaveCount(0);
  });

  test("SMF gets a sign-off control on a queued draft", async ({ page }) => {
    // Draft as the operator who is allowed to propose...
    await signIn(page, "compliance");
    const drafted = await ensurePendingDraft(page);
    test.skip(!drafted, "No CPD drift available to draft — reseed with `npm run db:setup`.");

    // ...then switch to the only role that may adopt it.
    await signIn(page, "smf");
    await page.goto("/signoff");
    await expect(page.getByRole("heading", { name: /sign-off queue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign off/i }).first()).toBeVisible();
  });
});
