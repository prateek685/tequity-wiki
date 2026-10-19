import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (docs/PORTAL_PLAN.md §12) on desktop and a 390px phone, using the test login.
 * Runs against `pnpm dev` (web :4100 → API :4101), started automatically if it isn't running.
 * Needs Postgres and Redis (`docker compose up -d`) and seed data (pnpm db:migrate && pnpm db:seed).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4100", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --dir ../.. dev",
    url: "http://localhost:4100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false },
    },
  ],
});
