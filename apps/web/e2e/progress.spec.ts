import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn } from "./support";

/**
 * Progress, Journal and the Friday scorecard (docs/design/final-mockup.html `progress()` / `journal()`).
 * Runs after m1-day.spec.ts, so neha has Day 1 done (baseline, notes). Needs `learning.unlockAll` on to
 * open the Day 5 scorecard; that part is skipped otherwise.
 */

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

test("an engineer sees Progress and Journal from the menu", async ({ page }) => {
  await signIn(page, "neha");
  await page.goto("/app");
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  const menu = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  if (desktop) await expect(menu.getByRole("link", { name: "Assessment" })).toBeVisible();

  await menu.getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/app\/progress$/);
  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();
  for (const tile of ["Days", "Assessments", "Gate 1", "Writing"])
    await expect(page.getByText(tile, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pillars · scorecards" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Day 1 → now" })).toBeVisible();
  await expect(page.getByText("11. Written follow-up")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await menu.getByRole("link", { name: "Journal" }).click();
  await expect(page).toHaveURL(/\/app\/journal$/);
  await expect(page.getByText("Only you can read this.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "What went well" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("the Friday scorecard asks for proof per pillar", async ({ page }) => {
  await signIn(page, "neha");
  await page.goto("/app/day/5/week-in-review");
  const heading = page.getByRole("heading", { level: 1, name: "Your week in review" });
  const open = await heading
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!open, "Day 5 isn't open (learning.unlockAll is off).");
  await expect(page.getByText("Other pillars carry forward their last score.")).toBeVisible();
  for (const group of await page.getByRole("radiogroup").all())
    await group.getByRole("radio", { name: "3 of 5" }).click();
  await page.getByRole("button", { name: /^Next: Check yourself/ }).click();
  await expect(page.getByText("Write one or two lines of proof.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/app\/day\/5\/week-in-review$/);
  expect(await seriousViolations(page)).toEqual([]);
});
