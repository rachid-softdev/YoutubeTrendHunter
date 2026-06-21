import { defineConfig } from "@playwright/test";

/**
 * Playwright config for Chrome Extension E2E tests.
 *
 * Chrome extensions require a headed browser (or the new headless mode).
 * We use a single worker because extension state (background service worker)
 * is shared across tests in a worker.
 */
export default defineConfig({
  testDir: "./",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "../playwright-report" }],
    ["list"],
  ],
  use: {
    trace: "on-first-retry",
    headless: false,
    screenshot: "only-on-failure",
  },
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
});
