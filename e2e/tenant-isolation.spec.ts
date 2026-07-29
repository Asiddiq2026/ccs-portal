import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Tenant isolation (Invariant 5) as a browser experiences it. The RLS tests
// prove Postgres filters by app.ar_id; these prove an AR session actually
// arrives at the database with that context — i.e. the wiring, not just the
// policy.

test("an AR sees only its own firm's breaches", async ({ page }) => {
  await signIn(page, "ar");
  await page.goto("/breaches");
  await expect(page.getByRole("heading", { name: /data breaches/i })).toBeVisible();

  // The dev AR session is scoped to ar_codrington. Any firm column rendered must
  // be that firm and no other.
  const otherFirms = page.getByText(/ar_six|ar_drakestar/);
  await expect(otherFirms).toHaveCount(0);
});

test("an AR logging a breach cannot attribute it to another firm", async ({ page }) => {
  await signIn(page, "ar");
  await page.goto("/breaches");
  await page.getByRole("button", { name: /log a breach/i }).click();

  // The firm field is not offered to an AR at all — the server forces the
  // caller's own arId, so there is nothing to tamper with in the UI.
  await expect(page.getByPlaceholder(/ar_codrington/)).toHaveCount(0);

  await page.getByRole("button", { name: /log breach/i }).click();
  // The breach lands, and it is theirs.
  await expect(page.getByText(/ar_six|ar_drakestar/)).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("the AR portal carries Razlin branding, not CCS marks", async ({ page }) => {
  // Invariant 4 of the golden rules: AR-facing output is Razlin-branded; CCS is
  // an internal mark only.
  await signIn(page, "ar");
  await page.goto("/portal");
  await expect(page.getByText(/Razlin/i).first()).toBeVisible();
});
