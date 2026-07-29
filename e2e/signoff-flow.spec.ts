import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// The platform's thesis, driven as two different humans:
//   COMPLIANCE proposes -> the draft appears in the queue -> SMF signs off ->
//   the register moves, and only then.
//
// This is the loop that was broken in production code while 245 unit tests
// passed: the in-memory store could not model insert-vs-update, so nothing
// caught that materialisation duplicated rows. Worth covering for real.

test("a CPD update flows propose -> queue -> SMF sign-off -> register", async ({ page }) => {
  // --- 1. As COMPLIANCE, find a person whose register is out of step ---------
  await signIn(page, "compliance");
  await page.goto("/cpd");
  await expect(page.getByRole("heading", { name: /CPD & Certification/i })).toBeVisible();

  const proposeButtons = page.getByRole("button", { name: /propose update/i });
  const drifted = await proposeButtons.count();
  test.skip(
    drifted === 0,
    "No CPD drift present — reseed with `npm run db:setup` to exercise this flow.",
  );

  // Identify the firm we are acting on. Other tests may have queued their own
  // CPD drafts, so every assertion below is scoped to THIS firm rather than to
  // "any CPD draft" — otherwise the test depends on ambient queue state.
  const row = page.locator("tr", { has: proposeButtons.first() }).first();
  const arId = ((await row.innerText()).match(/ar_\w+/) ?? [])[0];
  expect(arId, "expected the CPD row to name its firm").toBeTruthy();

  await proposeButtons.first().click();
  await expect(page.getByText(/in the sign-off queue awaiting an SMF/i)).toBeVisible();

  // --- 2. COMPLIANCE can see it queued, but cannot sign it off --------------
  await page.goto("/signoff");
  const ourCard = () =>
    page.locator("li").filter({ hasText: /CPD update for/i }).filter({ hasText: arId! });
  await expect(ourCard().first()).toBeVisible();
  await expect(page.getByRole("button", { name: /sign off/i })).toHaveCount(0);

  // --- 3. As SMF, sign it off ----------------------------------------------
  await signIn(page, "smf");
  await page.goto("/signoff");
  await expect(ourCard().first()).toBeVisible();
  await ourCard().first().getByRole("button", { name: /sign off/i }).click();

  // OUR draft leaves the PENDING queue (others may legitimately remain).
  await expect.poll(async () => ourCard().count(), { timeout: 20_000 }).toBe(0);

  // --- 4. The register now matches the evidence ----------------------------
  await page.goto("/cpd");
  const updatedRow = page.locator("tr", { hasText: arId! }).first();
  await expect(updatedRow).toBeVisible();
  // Drift is resolved for that firm: the register was moved by the sign-off.
  await expect(updatedRow.getByText(/stale/i)).toHaveCount(0);
  await expect(updatedRow.getByRole("button", { name: /propose update/i })).toHaveCount(0);
});

test("proposing does not move the register on its own", async ({ page }) => {
  // A risk assessment is proposed, and the AR's band must NOT change until an
  // SMF signs it off — the invariant that makes the queue meaningful.
  await signIn(page, "compliance");
  await page.goto("/risk");
  await expect(page.getByRole("heading", { name: /AR Risk Scoring/i })).toBeVisible();

  const firstRow = page.locator("tbody tr").first();
  const bandBefore = (await firstRow.innerText()).replace(/\s+/g, " ").trim();

  // Open the assessment form for that firm and score every factor 3 (=> RED).
  await firstRow.getByRole("button", { name: /assess/i }).click();
  const threes = page.getByRole("button", { name: /^3 high$/i });
  const count = await threes.count();
  for (let i = 0; i < count; i++) await threes.nth(i).click();
  await expect(page.getByText(/RED/).first()).toBeVisible();

  await page.getByRole("button", { name: /propose for sign-off/i }).click();
  await expect(page.getByText(/in the sign-off queue awaiting an SMF/i)).toBeVisible();

  // The register row is unchanged — the proposal is only a proposal.
  await page.goto("/risk");
  const bandAfter = (await page.locator("tbody tr").first().innerText())
    .replace(/\s+/g, " ")
    .trim();
  expect(bandAfter).toBe(bandBefore);
});
