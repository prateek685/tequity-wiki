import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * The Week 1 assessment in the course player (docs/design/course-player.html, "Week 1 assessment"):
 * Before you start → 10 questions one at a time → the result. Needs `pnpm content:import`
 * (assessment-05.yaml) on top of the seed.
 */

const ENGINEER = "neha"; // seeded with a start date in the past

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

/** Days 1–5 done and no assessment attempts yet, so the Week 1 assessment is ready. */
async function prepare(key: string) {
  await withDb(async (db) => {
    const found = await db.query<{ user_id: string; enrollment_id: string }>(
      `SELECT u.id AS user_id, e.id AS enrollment_id
         FROM users u JOIN enrollments e ON e.user_id = u.id
        WHERE u.email = $1`,
      [email(key)],
    );
    const row = found.rows[0];
    if (!row) throw new Error(`Seeded engineer ${key} is missing.`);
    await db.query(
      `DELETE FROM quiz_items WHERE attempt_id IN
         (SELECT id FROM quiz_attempts WHERE user_id = $1 AND kind = 'assessment')`,
      [row.user_id],
    );
    await db.query("DELETE FROM quiz_attempts WHERE user_id = $1 AND kind = 'assessment'", [row.user_id]);
    for (let day = 1; day <= 5; day += 1)
      await db.query(
        `INSERT INTO day_progress (enrollment_id, user_id, day, completed_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (enrollment_id, day, round) DO UPDATE SET completed_at = COALESCE(day_progress.completed_at, now())`,
        [row.enrollment_id, row.user_id, day],
      );
  });
}

test("an engineer takes the Week 1 assessment", async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(ENGINEER);
  await signIn(page, ENGINEER);
  await page.goto("/app/assessment/5");

  // Before you start: the rules, then Start.
  await expect(page.getByRole("heading", { level: 1, name: "Week 1 assessment" })).toBeVisible();
  await expect(page.getByText("Week 1 · Assessment · about 15 min")).toBeVisible();
  await expect(page.getByText("To pass")).toBeVisible();
  await expect(page.getByText("Who sees it")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Start the assessment" }).click();

  // Ten questions, one at a time.
  for (let number = 1; number <= 10; number += 1) {
    await expect(page.getByText(`Week 1 · Assessment · question ${number} of 10`)).toBeVisible();
    const options = page.getByRole("radio");
    if ((await options.count()) > 0) {
      await options.first().click();
      await page.getByRole("button", { name: "Submit answer" }).click();
      await expect(page.getByText(/^(Correct|Not quite)\.$/)).toBeVisible();
    } else {
      await page
        .getByLabel("Your answer")
        .fill("Short answer: on track. One risk, one ask, and the next step.");
      await page.getByRole("button", { name: "Submit answer" }).click();
      await expect(page.getByText(/^Saved\./)).toBeVisible();
    }
    if (number === 1) {
      await expectNoHorizontalScroll(page);
      expect(await seriousViolations(page)).toEqual([]);
    }
    await page.getByRole("button", { name: number < 10 ? "Next question" : "See your result" }).click();
  }

  // The result: score, pass mark, every answer.
  await expect(page.getByText("Week 1 · Assessment · result")).toBeVisible();
  await expect(page.getByText(/^\d+% on multiple choice$/)).toBeVisible();
  const answers = page.getByRole("region", { name: "Your answers" });
  // One row per question (the AI feedback adds nested lists inside written rows).
  await expect(answers.locator("ol").first().locator(":scope > li")).toHaveCount(10);
  const passed = await page
    .getByRole("heading", { level: 1, name: "You passed the Week 1 assessment" })
    .isVisible();
  if (passed) {
    await expect(page.getByText("That's Week 1.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Day 6" })).toBeVisible();
  } else {
    await expect(page.getByText(/You need \d+% to continue\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retake the assessment" })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});
