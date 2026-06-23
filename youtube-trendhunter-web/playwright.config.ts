// @ts-check
import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-browser Playwright configuration for YouTube TrendHunter.
 *
 * Browsers:
 *   chromium  — fastest, default for CI (use --project=chromium to save time)
 *   firefox   — slower; increase timeout via use.actionTimeout
 *   webkit    — slower; increase timeout via use.actionTimeout
 *   mobile-safari — iOS Safari (iPhone 13), for mobile-specific tests
 *
 * Install additional browsers:
 *   npx playwright install firefox webkit
 *
 * Run all projects:
 *   pnpm exec playwright test
 *
 * Run a specific project:
 *   pnpm exec playwright test --project=firefox
 *   pnpm exec playwright test --project=mobile-safari
 */

const PROJECT_TIMEOUT = process.env.CI ? 60_000 : 30_000;
const SLOW_PROJECT_TIMEOUT = process.env.CI ? 120_000 : 60_000;

const config = defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  outputDir: "./playwright-report",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    locale: "fr-FR",
  },
  projects: [
    // ── Desktop browsers ──────────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      timeout: PROJECT_TIMEOUT,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      timeout: SLOW_PROJECT_TIMEOUT,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      timeout: SLOW_PROJECT_TIMEOUT,
    },
    // ── Mobile browsers ───────────────────────────────────────────────
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
      timeout: SLOW_PROJECT_TIMEOUT,
    },
  ],
  webServer: {
    command:
      "node -e \"require('fs').rmSync('.next',{recursive:true,force:true})\" && pnpm --filter @youtube-trendhunter/web dev --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

export default config;
