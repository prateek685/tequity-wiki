import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { email, expectNoHorizontalScroll, signIn, withDb } from "./support";

/**
 * Manager v1 (docs/design/final-mockup.html `team()` / `flags()`): Team, an engineer page, a
 * check-in and Red flags. Priya manages the Platform team (apps/api/scripts/seed.ts: Aarav, Meera, Rohan).
 */

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
}

async function userId(key: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email(key)]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Seeded user ${key} is missing: run pnpm db:seed.`);
    return id;
  });
}

test("a manager sees the Team page and an engineer's page", async ({ page }) => {
  await signIn(page, "priya");
  await page.goto("/manager");
  await expect(
    page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Priya$/ }),
  ).toBeVisible();
  for (const tile of ["Engineers", "Needs you", "Red flags", "Average pace"])
    // The sidebar (hidden on phones) also has a "Red flags" item: check the visible tile.
    await expect(
      page.locator("span").getByText(tile, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Engineers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Meera Kapoor" }).click();
  await expect(page).toHaveURL(/\/manager\/engineers\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Meera Kapoor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "13-week tracker" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check-ins" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unlock history" })).toBeVisible();
  // No private content: the journal and daily answers never appear here.
  await expect(page.getByText("Only you can read this.", { exact: false })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("a manager records a check-in", async ({ page }) => {
  const meera = await userId("meera");
  await signIn(page, "priya");
  await page.goto(`/manager/engineers/${meera}/checkins/10`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Check-in after Day 10 · Meera Kapoor" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Score trend" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save check-in" });
  const notReached = page.getByText("This check-in opens once", { exact: false });
  if (await notReached.isVisible()) {
    // Meera hasn't finished Day 10 yet: the form can't be saved.
    await expect(save).toBeDisabled();
  } else {
    await expect(page.getByRole("heading", { name: "2. The engineer's notes" })).toBeVisible();
    await page.getByRole("radio", { name: /^Amber/ }).click();
    await page.getByLabel("One-line note (for the tracker)").fill("Own is behind; pairing agreed.");
    await save.click();
    await expect(page.getByText("Check-in saved.", { exact: false })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("an engineer writes notes for a check-in", async ({ page }) => {
  await signIn(page, "meera");
  await page.goto("/app/checkin/10");
  await expect(
    page.getByRole("heading", { level: 1, name: "Notes for your check-in after Day 10" }),
  ).toBeVisible();
  const save = page.getByRole("button", { name: "Save notes" });
  const closed = page.getByText("opens once you have finished", { exact: false });
  const locked = page.getByText("your notes are locked", { exact: false });
  if ((await closed.isVisible()) || (await locked.isVisible())) {
    // Not reached yet, or already recorded: the notes can't be saved.
    await expect(save).toHaveCount(0);
  } else {
    await page.getByLabel("Where am I stuck?").fill("Dates on Epic access.");
    await save.click();
    await expect(page.getByText("Saved. Your manager can read it.")).toBeVisible();
  }
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test("a manager opens Red flags", async ({ page }) => {
  await signIn(page, "priya");
  await page.goto("/manager");
  const desktop = (page.viewportSize()?.width ?? 0) >= 768;
  const menu = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await menu.getByRole("link", { name: desktop ? /^Red flags/ : /^Flags/ }).click();
  await expect(page).toHaveURL(/\/manager\/red-flags$/);
  await expect(page.getByRole("heading", { level: 1, name: "Red flags" })).toBeVisible();
  await expect(page.getByText("Checked every hour. Pause days are excluded.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Open/ })).toHaveAttribute("aria-current", "page");
  // Either the open flags (PDF signal + action, an Acknowledge button each) or the empty state.
  const empty = page.getByText("No red flags. Checked every hour; pause days are excluded.");
  const acknowledge = page.getByRole("button", { name: /^Acknowledge/ });
  await expect(empty.or(acknowledge.first())).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("link", { name: "Acknowledged", exact: true }).click();
  await expect(page).toHaveURL(/status=acknowledged/);
  await expect(page.getByRole("link", { name: "Acknowledged", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText("No acknowledged red flags yet.").or(page.getByText(/^Acknowledged by /).first()),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("an admin sees Settings", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI scoring" })).toBeVisible();
  await expect(page.getByLabel("Assessment pass mark (multiple choice only)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  expect(await seriousViolations(page)).toEqual([]);
});
