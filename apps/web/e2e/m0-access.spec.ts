import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { choose, email, expectNoHorizontalScroll, signIn, withDb } from "./support";

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp/);
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
});

test("an engineer lands on the wiki home, opens the course, and is refused elsewhere", async ({ page }) => {
  await signIn(page, "aarav");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Aarav" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administration" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: /^(Start|Resume): Client-Ready 90 days plan$/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  // And back: the course sidebar (or the phone's top bar) links to the wiki home.
  await page
    .getByRole("link", { name: /Tequity\.wiki/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening), Aarav$/ }),
  ).toBeVisible();
  await expect(page.getByText("Finish by")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/forbidden$/);

  // The real protection: the API refuses other roles' data with this session.
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
  expect((await page.request.get("/api/manager/engineers")).status()).toBe(403);
});

test("a manager sees only engineers on their own team", async ({ page }) => {
  await signIn(page, "priya");
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("link", { name: "Open course: Client-Ready 90 days plan" }).click();
  await expect(page).toHaveURL(/\/manager$/);
  const table = page.getByRole("table");
  for (const name of ["Aarav Sharma", "Meera Kapoor", "Rohan Patel"])
    await expect(table.getByText(name)).toBeVisible();
  await expect(page.getByText("Neha Thomas")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden$/);
  expect((await page.request.get("/api/admin/users")).status()).toBe(403);
});

test("a new sign-in starts as an engineer; an admin can then set their team and start date", async ({
  page,
  browser,
}) => {
  const newKey = `new${Date.now().toString(36)}`;
  try {
    // First sign-in: an active engineer straight away, enrolled from today.
    await signIn(page, newKey);
    await expect(page).toHaveURL(/\/home$/);

    const adminContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const admin = await adminContext.newPage();
    await signIn(admin, "admin");
    await admin.goto("/admin/users");
    const row = admin.getByRole("row").filter({ hasText: email(newKey) });
    await expect(row).toBeVisible();
    await choose(admin, row, "Team", "Platform");
    await row.getByLabel("Start date").fill("2026-11-16");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("Saved.")).toBeVisible();
    await expectNoHorizontalScroll(admin);
    await adminContext.close();

    // The change reaches the engineer on their next page load, without signing in again.
    await page.goto("/");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/app");
    await expect(page.getByText("14 Feb 2027")).toBeVisible(); // 16 Nov 2026 + 90 days
  } finally {
    // Always remove the test user, even when an assertion above fails.
    await withDb((db) => db.query("DELETE FROM users WHERE email = $1", [email(newKey)]));
  }
});

test("an admin cannot change their own role (another admin must do it)", async ({ page }) => {
  await signIn(page, "admin");
  await page.goto("/admin/users");
  const row = page.getByRole("row").filter({ hasText: email("admin") });
  await choose(page, row, "Role", "Manager");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("You can't change your own role or access. Ask another admin.")).toBeVisible();
});

test("key screens have no serious accessibility violations", async ({ page }) => {
  const serious = (violations: { impact?: string | null }[]) =>
    violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");

  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  expect(serious((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);

  await signIn(page, "admin");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  expect(serious((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
  await page.goto("/admin/users");
  expect(serious((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
  await page.goto("/admin/teams");
  await expect(page.getByRole("heading", { name: "Teams", exact: true })).toBeVisible();
  expect(serious((await new AxeBuilder({ page }).analyze()).violations)).toEqual([]);
});

test("a role change while signed in takes effect on the next page load", async ({ page }) => {
  await signIn(page, "rohan");
  await expect(page).toHaveURL(/\/home$/);
  try {
    // An admin turns Rohan into a manager (done directly in the database to isolate the session behaviour).
    await withDb(async (db) => {
      await db.query("DELETE FROM team_members WHERE user_id = (SELECT id FROM users WHERE email = $1)", [
        email("rohan"),
      ]);
      await db.query("UPDATE users SET role = 'manager' WHERE email = $1", [email("rohan")]);
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/home$/);
    await page.getByRole("link", { name: "Open course: Client-Ready 90 days plan" }).click();
    await expect(page).toHaveURL(/\/manager$/);
    await expect(page.getByRole("heading", { name: "Engineers" })).toBeVisible();
    expect((await page.request.get("/api/me/enrollment")).status()).toBe(403);
  } finally {
    await withDb(async (db) => {
      await db.query("UPDATE users SET role = 'engineer' WHERE email = $1", [email("rohan")]);
      await db.query(
        "INSERT INTO team_members (user_id, team_id) SELECT u.id, t.id FROM users u, teams t WHERE u.email = $1 AND t.name = 'Platform' ON CONFLICT DO NOTHING",
        [email("rohan")],
      );
    });
  }
});

test("a disabled account cannot sign in, and is signed out at once", async ({ page }) => {
  await signIn(page, "meera");
  await expect(page).toHaveURL(/\/home$/);
  try {
    await withDb((db) => db.query("UPDATE users SET status = 'disabled' WHERE email = $1", [email("meera")]));
    // Already signed in: the session ends immediately.
    expect((await page.request.get("/api/me")).status()).toBe(401);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);

    await signIn(page, "meera");
    await expect(page).toHaveURL(/\/sign-in\?error=AccessDenied/);
    await expect(page.getByText("This account can't sign in.", { exact: false })).toBeVisible();
  } finally {
    await withDb((db) => db.query("UPDATE users SET status = 'active' WHERE email = $1", [email("meera")]));
  }
});

test("the strict security policy doesn't block anything the app uses", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text()))
      blocked.push(message.text());
  });
  await signIn(page, "admin");
  await page.goto("/admin/users");
  await page
    .getByRole("row")
    .filter({ hasText: email("aarav") })
    .getByLabel("Role")
    .click(); // Radix dropdown
  await expect(page.getByRole("option", { name: "Manager" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/admin/teams");
  await expect(page.getByRole("heading", { name: "Teams", exact: true })).toBeVisible();
  expect(blocked).toEqual([]);
});

test("an admin sees the course settings and the administration links on the wiki home", async ({ page }) => {
  await signIn(page, "admin");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Courses", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Course settings" })).toBeVisible();
  await page.getByRole("link", { name: /^Users and roles/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  // People pages sit at the wiki level: two tabs, and no course sidebar.
  const tabs = page.getByRole("navigation", { name: "Administration" });
  await expect(tabs.getByRole("link", { name: "Users and roles" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await tabs.getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/admin\/teams$/);
  await expect(tabs.getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
  await page.goto("/home");
  await page.getByRole("link", { name: /^Teams/ }).click();
  await expect(page).toHaveURL(/\/admin\/teams$/);
  await page.goto("/home");
  await page.getByRole("link", { name: "Course settings" }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  // The course's settings keep the course frame (sidebar menu).
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: /^Settings/ }),
  ).toBeVisible();
});

test("the sign-in page stays light even when dark mode is saved", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("portal-theme", "dark");
  });
  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

  // Inside the app the saved choice applies again.
  await signIn(page, "aarav");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
