import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * Gate 1 (docs/PORTAL_PLAN.md §2–§3, docs/design/final-mockup.html `gate()`): the engineer sends the recap
 * on the Gate page, the manager records the result on the gate form, the engineer sees it and Day 21.
 * Sara Khan has Days 1–20 done (`pnpm db:seed:demo`); Priya manages her. Each run starts from Sara's
 * gate not recorded (her gate results and recaps are deleted), so it can be repeated.
 */

test.describe.configure({ mode: "serial" });

const ENGINEER = "sara";
const MANAGER = "priya";
const RECAP =
  "Bottom line: the pilot stays on April 27. Decisions: SMS wording goes to Lakeside compliance today. Next steps: I send the Epic access request by Wednesday noon; Dana confirms the training dates by Friday.";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

test("the engineer sends the Gate 1 recap", async ({ page }) => {
  await withDb(async (db) => {
    const found = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email(ENGINEER)]);
    const id = found.rows[0]?.id;
    if (!id) throw new Error("Sara is missing: run pnpm db:seed:demo.");
    await db.query("DELETE FROM gate_results WHERE user_id = $1 AND gate = 1", [id]);
    await db.query("DELETE FROM gate_recaps WHERE user_id = $1 AND gate = 1", [id]);
  });

  await signIn(page, ENGINEER);
  await page.goto("/app/gate/1");
  await expect(page.getByRole("heading", { level: 1, name: "Gate 1" })).toBeVisible();
  await expect(page.getByText("Book it with your manager.")).toBeVisible();
  await expect(page.getByText("Average ≥ 2.5, no criterion at 1, recap within 2 hours.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Your question bank" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByLabel("Recap of the call").fill(RECAP);
  await page.getByRole("button", { name: "Submit recap" }).click();
  await expect(
    page.getByText("Waiting for your manager to record the result.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/^Sent \d/).first()).toBeVisible();
  // The confirmation survives the status change (to_book → recap_sent) that follows the save.
  await expect(page.getByText("Recap sent. Your manager can read it now.")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("the manager records Gate 1 as a pass", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.goto("/manager");
  const menu = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await menu.getByRole("link", { name: /^Gates/ }).click();
  await expect(page).toHaveURL(/\/manager\/gates$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gates" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  // Gate 1's row (Sara's Gate 2 row is listed too once gate2.spec.ts has run).
  await page.getByRole("link", { name: /^Sara Khan\W+Gate 1$/ }).click();
  await expect(page).toHaveURL(/\/manager\/engineers\/[0-9a-f-]+\/gates\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Record Gate 1" })).toBeVisible();
  await expect(page.getByText("Score at least one criterion")).toBeVisible();

  const scores: [string, string][] = [
    ["1. Opening and agenda", "4"],
    ["2. Answer-first structure", "3"],
    ["3. Questions asked", "3"],
    ["4. Playback", "4"],
    ["8. Risks and bad news", "3"],
  ];
  for (const [criterion, score] of scores)
    await page
      .getByRole("radiogroup", { name: criterion })
      .getByRole("radio", { name: `${score} of 5` })
      .click();
  await page
    .getByRole("radiogroup", { name: "9. Disagreement" })
    .getByRole("radio", { name: "Didn't come up" })
    .click();

  await expect(page.getByText("5 of 11")).toBeVisible();
  await expect(page.getByText("3.40")).toBeVisible();
  await expect(page.getByText("Meets the pass bar")).toBeVisible();
  await expect(page.getByLabel("Recap received within 2 hours")).toBeChecked();
  await page
    .getByLabel("One-line note (for the tracker)")
    .fill("Green: calm on the surprise, clear next steps.");
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Save gate result" }).click();
  await expect(page).toHaveURL(/\/manager\/gates\?recorded=/);
  await expect(page.getByText("Result saved for Sara Khan.", { exact: false })).toBeVisible();
});

test("the engineer sees the result and Day 21 open", async ({ page }) => {
  await signIn(page, ENGINEER);
  await page.goto("/app/gate/1");
  await expect(page.getByText("You passed Gate 1.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your result" })).toBeVisible();
  await expect(page.getByText("“Green: calm on the surprise, clear next steps.”")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Day 21" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});
