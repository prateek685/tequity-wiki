import { expect, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * Phase 3 in the course player (docs/PORTAL_PLAN.md §2–§3): the final review opens full screen like the
 * gates, a live-call day takes the substitute path and shows its mock card, and the readiness case drafted
 * on Day 63 starts Day 64 and, once saved, is shared and opens the final review.
 *
 * Set-up, as the owner and for Aarav only (Platform team): his learning rows are cleared, Days 1–61 are done,
 * and his live calls, readiness case and final review are deleted, so the spec can be repeated.
 */

test.describe.configure({ mode: "serial" });

const ENGINEER = "aarav";
const OVERALL = "I can run client calls on my own. I still need feedback on my next disagreement.";

async function prepare() {
  await withDb(async (db) => {
    const found = await db.query<{ user_id: string; enrollment_id: string }>(
      "SELECT u.id AS user_id, e.id AS enrollment_id FROM users u JOIN enrollments e ON e.user_id = u.id WHERE u.email = $1",
      [email(ENGINEER)],
    );
    const row = found.rows[0];
    if (!row) throw new Error("Aarav is missing: run pnpm db:seed.");
    const userId = row.user_id;
    await db.query(
      "DELETE FROM quiz_items WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = $1)",
      [userId],
    );
    for (const table of [
      "quiz_attempts",
      "rubric_scores",
      "step_entries",
      "day_progress",
      "live_calls",
      "readiness_cases",
      "final_reviews",
    ])
      await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    for (let day = 1; day <= 61; day += 1)
      await db.query(
        "INSERT INTO day_progress (enrollment_id, user_id, day, round, completed_at) VALUES ($1, $2, $3, 1, now())",
        [row.enrollment_id, userId, day],
      );
  });
}

test("the final review opens full screen and waits for the readiness case", async ({ page }) => {
  await prepare();
  await signIn(page, ENGINEER);
  await page.goto("/app/final-review");
  await expect(page.getByRole("heading", { level: 1, name: "Final review" })).toBeVisible();
  await expect(page.getByText("Opens once Day 64 is done and your readiness case is shared.")).toBeVisible();
  // The course player, not the app shell: no app sidebar.
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("a live day takes the substitute path and shows its mock", async ({ page }) => {
  await signIn(page, ENGINEER);
  await page.goto("/app/day/62/lead-solo");
  await expect(page.getByText("Your role today:")).toBeVisible();
  await page.getByRole("radio", { name: /No live call: I did the substitute mock/ }).click();
  await expect(page.getByText("Dana, Dr. Mercer and Kevin")).toBeVisible();
  await expect(page.getByText("Brightpath Health and Lakeside Health · Level 3")).toBeVisible();
  await expect(page.getByText("What you know before the call")).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("the readiness case drafted on Day 63 starts Day 64 and opens the final review", async ({ page }) => {
  await signIn(page, ENGINEER);
  await page.goto("/app/day/63/draft-readiness");
  await page
    .getByLabel("Overall: why I'm ready to work directly with a client, and what support I still need")
    .fill(OVERALL);
  await page
    .getByLabel("Understand: 2 pieces of evidence, and where to find them")
    .fill("Feature-to-metric map (journal, Week 11).");
  await page.getByRole("button", { name: /^Next/ }).click();

  await page.goto("/app/day/64/final-readiness");
  await expect(
    page.getByLabel("Overall: why I'm ready to work directly with a client, and what support I still need"),
  ).toHaveValue(OVERALL);
  await expect(page.getByText("Saving shares it")).toBeVisible();
  await page.getByRole("button", { name: /^Next/ }).click();

  await page.goto("/app/final-review");
  await expect(page.getByText("Book it with your manager.")).toBeVisible();
  await expect(page.getByText("Opens once Day 64 is done and your readiness case is shared.")).toHaveCount(0);
});
