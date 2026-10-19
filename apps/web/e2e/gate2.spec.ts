import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * Gate 2 (docs/PORTAL_PLAN.md §2–§3, after Day 40): the engineer sends the recap plus one more written
 * piece, the manager records the result (healthcare terms, Phase 3 live-call plan), the engineer sees it.
 *
 * Set-up, as the owner and for Sara Khan only (Platform team, managed by Priya): Gate 1 passed (kept if
 * gate.spec.ts already recorded it, else inserted), Days 21–40 done in round 1, and her Gate 2 rows deleted
 * (result, recap, gate rubric scores for day 40), so the spec can be repeated.
 */

test.describe.configure({ mode: "serial" });

const ENGINEER = "sara";
const MANAGER = "priya";
const RECAP =
  "Bottom line: Lakeside's go-live moves one week to May 4. Decisions: the HL7 ADT feed stays in scope; the patient portal SSO goes to phase 2. Next steps: I send the revised plan by Thursday; Dana confirms the EHR test window by Friday.";
const BAD_NEWS =
  "Subject: Go-live moves to May 4\n\nDana, the bottom line: we need one more week. The ADT feed from Epic drops discharge events under load, and we won't go live with missing patient data. We've found the cause and the fix is in testing. New date: May 4. I'll confirm on Thursday.";
const PLAN = "Shadow: Days 43, 45 · Co-lead: 48, 53, 55 · Lead: 58, 60";
const NOTE = "Green: clear bad news, used PHI and HL7 terms correctly.";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

/** Sara at "Gate 2 to book": Gate 1 passed, Days 21–40 done, no Gate 2 rows. */
async function prepare() {
  await withDb(async (db) => {
    const found = await db.query<{ user_id: string; enrollment_id: string; manager_id: string }>(
      `SELECT u.id AS user_id, e.id AS enrollment_id, m.id AS manager_id
         FROM users u JOIN enrollments e ON e.user_id = u.id, users m
        WHERE u.email = $1 AND m.email = $2`,
      [email(ENGINEER), email(MANAGER)],
    );
    const row = found.rows[0];
    if (!row) throw new Error("Sara or Priya is missing: run pnpm db:seed:demo.");
    const { user_id: userId, enrollment_id: enrollmentId, manager_id: managerId } = row;

    await db.query("DELETE FROM rubric_scores WHERE user_id = $1 AND source = 'gate' AND day = 40", [userId]);
    await db.query("DELETE FROM gate_results WHERE user_id = $1 AND gate = 2", [userId]);
    await db.query("DELETE FROM gate_recaps WHERE user_id = $1 AND gate = 2", [userId]);

    // Gate 1 passed (no criteria scored is allowed by the table's checks).
    await db.query(
      `INSERT INTO gate_results
         (enrollment_id, user_id, gate, round, held_at, scored, recap_on_time, outcome, rag, note, manager_id)
       VALUES ($1, $2, 1, 1, now(), 0, true, 'pass', 'green', 'Passed (e2e set-up).', $3)
       ON CONFLICT (enrollment_id, gate, round) DO UPDATE
         SET outcome = 'pass', focus_items = ARRAY[]::TEXT[], repeat_weeks = ARRAY[]::INTEGER[]`,
      [enrollmentId, userId, managerId],
    );

    for (let day = 21; day <= 40; day += 1)
      await db.query(
        `INSERT INTO day_progress (enrollment_id, user_id, day, round, completed_at) VALUES ($1, $2, $3, 1, now())
         ON CONFLICT (enrollment_id, day, round) DO UPDATE SET completed_at = COALESCE(day_progress.completed_at, now())`,
        [enrollmentId, userId, day],
      );
  });
}

test("the engineer sends the Gate 2 follow-up", async ({ page }) => {
  await prepare();

  await signIn(page, ENGINEER);
  await page.goto("/app/gate/2");
  await expect(page.getByRole("heading", { level: 1, name: "Gate 2" })).toBeVisible();
  await expect(
    page.getByText("You run it live with the AI client for 25 minutes", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("one live healthcare scenario", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Average ≥ 3.0, no criterion below 2, basic healthcare terms used correctly."),
  ).toBeVisible();
  await expect(page.getByText("Book it with your manager.")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  const form = page.getByRole("main");
  await page.getByLabel("Recap of the call").fill(RECAP);
  const submit = page.getByRole("button", { name: "Submit follow-up" });
  await expect(submit).toBeDisabled(); // the second piece is still missing
  await form.getByRole("combobox", { name: "Second piece" }).click();
  await page.getByRole("option", { name: "Bad-news email", exact: true }).click();
  await form.getByRole("textbox", { name: "Bad-news email" }).fill(BAD_NEWS);
  await submit.click();

  await expect(
    page.getByText("Waiting for your manager to record the result.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/^Sent \d/).first()).toBeVisible();
  // The confirmation survives the status change (to_book → recap_sent) that follows the save.
  await expect(page.getByText("Follow-up sent. Your manager can read it now.")).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("the manager records Gate 2 as a pass", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.goto("/manager");
  const menu = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await menu.getByRole("link", { name: /^Gates/ }).click();
  await expect(page).toHaveURL(/\/manager\/gates$/);
  await page.getByRole("link", { name: /^Sara Khan\W+Gate 2$/ }).click();
  await expect(page).toHaveURL(/\/manager\/engineers\/[0-9a-f-]+\/gates\/2$/);
  await expect(page.getByRole("heading", { level: 1, name: "Record Gate 2" })).toBeVisible();
  await expect(page.getByText("Written follow-up: Recap + bad-news email", { exact: false })).toBeVisible();

  const scores: [string, string][] = [
    ["1. Opening and agenda", "4"],
    ["2. Answer-first structure", "3"],
    ["3. Questions asked", "3"],
    ["5. Business link", "3"],
    ["8. Risks and bad news", "4"],
    ["9. Disagreement", "3"],
    ["11. Written follow-up", "4"],
  ];
  for (const [criterion, score] of scores)
    await page
      .getByRole("radiogroup", { name: criterion })
      .getByRole("radio", { name: `${score} of 5` })
      .click();
  await expect(page.getByText("7 of 11")).toBeVisible();
  await expect(page.getByText("3.43")).toBeVisible();

  // Healthcare terms are part of the Gate 2 bar.
  await expect(page.getByText("Below the pass bar")).toBeVisible();
  await page.getByLabel("Basic healthcare terms used correctly").check();
  await expect(page.getByText("Meets the pass bar")).toBeVisible();

  // The engineer's second piece sits under the recap.
  await page.getByRole("button", { name: /^The recap/ }).click();
  await expect(page.getByText(RECAP)).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Bad-news email" })).toBeVisible();
  await expect(
    page.getByText("Dana, the bottom line: we need one more week.", { exact: false }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Outcome" }).click();
  await page.getByRole("option", { name: "Pass", exact: true }).click();
  await page.getByRole("radio", { name: "Green" }).click();
  await page.getByLabel("One-line note (for the tracker)").fill(NOTE);

  // The live-call plan is required for a pass.
  await page.getByRole("button", { name: "Save gate result" }).click();
  await expect(
    page.getByText("Add the Phase 3 live-call plan: which calls to shadow, co-lead and lead."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/gates\/2$/);
  await page.getByLabel("Phase 3 live-call plan").fill(PLAN);
  await expect(
    page.getByText("Add the Phase 3 live-call plan: which calls to shadow, co-lead and lead."),
  ).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Save gate result" }).click();
  await expect(page).toHaveURL(/\/manager\/gates\?recorded=/);
  await expect(page.getByText("Result saved for Sara Khan.", { exact: false })).toBeVisible();
});

test("the engineer sees the Gate 2 result and Phase 3 open", async ({ page }) => {
  await signIn(page, ENGINEER);
  await page.goto("/app/gate/2");
  await expect(page.getByText("You passed Gate 2.")).toBeVisible();
  await expect(page.getByText("Day 41 is open. Phase 3 starts there", { exact: false })).toBeVisible();
  const result = page.getByRole("region", { name: "Your result" });
  await expect(result.getByText("Used correctly")).toBeVisible();
  await expect(result.getByText("Recap + bad-news email")).toBeVisible();
  await expect(result.getByText("Your Phase 3 live calls")).toBeVisible();
  await expect(result.getByText(PLAN)).toBeVisible();
  await expect(page.getByText(`“${NOTE}”`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start Day 41" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});
