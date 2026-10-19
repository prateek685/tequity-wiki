import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { CSRF_HEADER } from "@portal/contracts";
import pg from "pg";

// Database access for test set-up uses the API's local settings (owner connection, local only).
const API_ENV = fileURLToPath(new URL("../../api/.env", import.meta.url));
if (existsSync(API_ENV)) process.loadEnvFile(API_ENV);
if (!/@(127\.0\.0\.1|localhost):/.test(process.env.DIRECT_URL ?? "")) {
  throw new Error("E2E tests refuse to run: DIRECT_URL is not a local database.");
}

const ORIGIN = "http://localhost:4100";

// Seeded test accounts use the reserved test domain (TEST_EMAIL_DOMAIN).
const domain = "test.local";

/** Seeded users (apps/api/scripts/seed.ts) are `<key>@<domain>`. */
export const email = (key: string) => `${key}@${domain}`;

/** The API allows 20 sign-ins per minute per IP; the whole suite signs in more often than that. */
const SIGN_IN_WINDOW_MS = 60_000;

export async function signIn(page: Page, key: string): Promise<void> {
  // The test sign-in is an API route only (there is no page for it); the cookie lands in the page's context.
  const attempt = () =>
    page.request.post("/api/auth/dev-login", {
      data: { email: email(key) },
      headers: { [CSRF_HEADER]: "1", origin: ORIGIN },
    });
  let response = await attempt();
  if (response.status() === 429) {
    // Rate limited: wait for the window to pass, then sign in again (the test gets the extra time).
    test.info().setTimeout(test.info().timeout + SIGN_IN_WINDOW_MS + 5_000);
    await page.waitForTimeout(SIGN_IN_WINDOW_MS);
    response = await attempt();
  }
  expect(response.ok()).toBe(true);
  await page.goto("/");
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Run SQL as the owner for test set-up and clean-up. */
export async function withDb<T>(work: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

/** Pick an option in one of our Radix selects, found by its label inside `scope`. */
export async function choose(page: Page, scope: ReturnType<Page["locator"]>, label: string, option: string) {
  await scope.getByLabel(label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
