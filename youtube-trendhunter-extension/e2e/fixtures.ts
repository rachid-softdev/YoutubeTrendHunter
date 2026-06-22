import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to built extension output.
 * Must run `pnpm build` before running E2E tests.
 */
const EXTENSION_PATH = path.resolve(__dirname, "..", ".output", "chrome-mv3");

if (!fs.existsSync(EXTENSION_PATH)) {
  throw new Error(
    [
      `Extension not built at: ${EXTENSION_PATH}`,
      'Run "pnpm build" in the extension directory first.',
    ].join("\n"),
  );
}

/**
 * Extended test fixture that:
 * 1. Launches Chromium with the extension loaded
 * 2. Extracts the extension ID from the background service worker URL
 * 3. Provides a page on the extension's sidepanel for chrome API access
 *
 * Usage:
 * ```ts
 * import { test, expect } from "./fixtures";
 *
 * test("my test", async ({ page, context, extensionId }) => {
 *   // page is already set to the sidepanel page
 *   // chrome.runtime and chrome.storage are accessible via page.evaluate
 * });
 * ```
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  page: Page;
}>({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "th-ext-"),
    );

    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--disable-gpu",
        // Push window far off-screen so the user doesn't see browser popups
        "--window-position=-32000,-32000",
      ],
    });

    await use(ctx);

    await ctx.close();
    // Best-effort cleanup
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Windows may hold file locks
    }
  },

  extensionId: async ({ context }, use) => {
    let background: { url(): string };

    // MV3 uses service workers; MV2 uses background pages
    if (EXTENSION_PATH.endsWith("-mv3")) {
      [background] = context.serviceWorkers();
      if (!background)
        background = await context.waitForEvent("serviceworker");
    } else {
      [background] = context.backgroundPages();
      if (!background)
        background = await context.waitForEvent("backgroundpage");
    }

    // Extract extension ID from the background URL:
    // chrome-extension://<extensionId>/background.js
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },

  page: async ({ context, extensionId }, use) => {
    const p: Page = await context.newPage();

    // Navigate to the sidepanel page so that `chrome.runtime` APIs
    // are available in the page context.
    await p.goto(
      `chrome-extension://${extensionId}/sidepanel.html`,
      { waitUntil: "domcontentloaded" },
    );

    // Wait for the React root to mount (even if the UI shows "auth" screen)
    await p.waitForSelector("#root", { timeout: 10_000 });

    await use(p);
  },
});

export { expect } from "@playwright/test";
