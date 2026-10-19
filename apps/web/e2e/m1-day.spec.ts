import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * Day 1 in the course player (docs/LESSON_FORMAT.md, docs/design/course-player.html): an engineer walks
 * the lessons with Next (read, pillars, mock call with the prompt copy, reflect, baseline), then takes
 * the daily quiz; Day 1 is done. Needs `pnpm content:import` on top of the seed.
 */

const ENGINEER = "neha"; // seeded with a start date in the past, so Day 1 is open

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

/** Clear the engineer's learning activity so the journey starts from a fresh Day 1. */
async function resetProgress(key: string) {
  await withDb(async (db) => {
    const user = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email(key)]);
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error(`Seeded user ${key} is missing.`);
    await db.query(
      "DELETE FROM quiz_items WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = $1)",
      [userId],
    );
    for (const table of ["quiz_attempts", "rubric_scores", "step_entries", "day_progress"])
      await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  });
}

test("an engineer completes Day 1 in the course player", async ({ page }) => {
  // The whole journey (five lessons, five questions, axe on several screens) in one test.
  test.setTimeout(120_000);
  await resetProgress(ENGINEER);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, ENGINEER);
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "What clients judge you on" })).toBeVisible(); // Home lists lessons
  await page.getByRole("link", { name: /^(Start|Continue) Day 1/ }).click();

  // /app/day/1 opens the first lesson, full screen (no app sidebar).
  await expect(page).toHaveURL(/\/app\/day\/1\/meet-carebook$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Meet CareBook/ })).toBeVisible();
  // Only the outline and the lesson scroll; the page itself never grows past the screen.
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBe(0);
  await expect(page.getByText("Day 1 · Lesson 1 of 6 · 8 min")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toHaveCount(0);
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  if (desktop) {
    const outline = page.getByRole("navigation", { name: "Course outline" });
    await expect(outline.getByText("Your first call with Dana")).toBeVisible();
    await expect(outline.getByText("Check yourself")).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Outline" }).click();
    const drawer = page.getByRole("dialog", { name: "Course outline" });
    await expect(drawer.getByText("What clients judge you on")).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();
  }
  await expect(page.getByText("Lakeside Health, 12 primary-care clinics in Ohio")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  // Lesson 2: the pillars and the 14 behaviours.
  await page.getByRole("button", { name: /^Next: What clients judge you on/ }).click();
  await expect(page).toHaveURL(/\/app\/day\/1\/clients-judge$/);
  await expect(page.getByText("Decode an unclear requirement")).toBeVisible();
  await expect(page.getByText("Sounds like", { exact: false }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  // Lesson 3: the mock call. The prompt reaches the clipboard but is never shown on the page.
  await page.getByRole("button", { name: /^Next: Your first call with Dana/ }).click();
  await expect(page).toHaveURL(/\/app\/day\/1\/first-call$/);
  await expect(page.getByText("What you know before the call")).toBeVisible();
  await expect(page.getByText("Dana Brooks").first()).toBeVisible();
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("Dana");
  await expect(page.getByText(prompt.slice(0, 40), { exact: false })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  // Lesson 4: reflect.
  await page.getByRole("button", { name: /^Next: How did the call go\?/ }).click();
  await expect(page).toHaveURL(/\/app\/day\/1\/call-review$/);
  await page.getByRole("checkbox").first().check();
  await page.getByLabel("What went well").fill("Opened with a clear agenda.");
  await page.getByLabel("One thing to fix next time").fill("Play back the client's words before answering.");
  // "Score the call": at least one criterion is needed (n/a doesn't count); anchors open on demand.
  await page.getByRole("button", { name: /^Next: Your starting point/ }).click();
  await expect(page.getByText("Score the call on at least one criterion.")).toBeVisible();
  await page.getByRole("button", { name: "What the scores mean: 1. Opening and agenda" }).click();
  await expect(page.getByText("2 and 4 sit between.").first()).toBeVisible();
  await page
    .getByRole("radiogroup", { name: "1. Opening and agenda" })
    .getByRole("radio", { name: "3 of 5" })
    .click();
  await page
    .getByRole("radiogroup", { name: "2. Answer-first structure" })
    .getByRole("radio", { name: "Didn't come up" })
    .click();

  // Lesson 5: the baseline. Next needs all 14 ratings and the three goals.
  await page.getByRole("button", { name: /^Next: Your starting point/ }).click();
  await expect(page).toHaveURL(/\/app\/day\/1\/starting-point$/);
  const ratings = page.getByRole("radiogroup");
  await expect(ratings).toHaveCount(14);
  await page.getByRole("button", { name: /^Next: Check yourself/ }).click();
  await expect(page.getByText("Rate every behaviour from 1 to 5.")).toBeVisible();
  let index = 0;
  for (const group of await ratings.all()) {
    await group.getByRole("radio", { name: `${(index % 5) + 1} of 5` }).click();
    index += 1;
  }
  const averages = page.getByRole("list", { name: "Your averages" });
  await expect(averages.getByText(/^2\.5\s*\/\s*5$/)).toBeVisible(); // U1–U4 rated 1, 2, 3, 4
  await page.getByLabel("Goal 1 for the 90 days").fill("Answer first on every status question.");
  await page.getByLabel("Goal 2", { exact: true }).fill("Raise risks the same day.");
  await page.getByLabel("Goal 3", { exact: true }).fill("Send a recap after every call.");
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: /^Next: Check yourself/ }).click();

  // The daily quiz comes last, inside the player.
  await expect(page).toHaveURL(/\/app\/day\/1\/quiz$/);
  await page.getByRole("button", { name: "Start the quiz" }).click();
  for (let number = 1; number <= 5; number += 1) {
    await expect(page.getByText(new RegExp(`^${number} of 5 ·`))).toBeVisible();
    const options = page.getByRole("radio");
    if ((await options.count()) > 0) {
      await options.first().click();
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(page.getByText(/^(Correct|Not quite)\.$/)).toBeVisible();
      await expect(page.getByText("Correct answer")).toBeVisible();
    } else {
      await page.getByLabel("Your answer").fill("Lead with the answer, then the reason, then the next step.");
      await page.getByRole("button", { name: "Submit answer" }).click();
      await expect(page.getByText("Saved. Your AI feedback appears below.")).toBeVisible();
      await expect(page.getByText("Model answer")).toBeVisible();
      // The score arrives in the background (the worker may not run during e2e).
      await expect(
        page
          .getByText("Being scored…")
          .or(page.getByRole("region", { name: "AI feedback" }))
          .or(page.getByText("We couldn't score this answer.", { exact: false })),
      ).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
    if (number < 5) await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "Finish quiz" }).click();
  await expect(page.getByText("Day 1 is done.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Finish Day 1/ })).toBeVisible();

  // Home: the Day-1 baseline per pillar and the latest feedback.
  await page.goto("/app");
  await expect(page.getByText("You'll compare against this on Day 65.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Day 1 · Daily quiz/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto("/app/plan");
  const dayOne = page.getByRole("listitem").filter({ hasText: /^Day 1(?!\d)/ });
  await expect(dayOne.getByText("Done", { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
