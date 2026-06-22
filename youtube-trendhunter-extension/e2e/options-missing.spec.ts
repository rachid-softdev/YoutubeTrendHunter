import { test, expect } from "./fixtures";
import { OptionsPage } from "./pages/options";

/* ========================================================================== */
/*  OPTIONS PAGE — MISSING COVERAGE                                           */
/* ========================================================================== */
/*                                                                             */
/*  This file tests edge cases NOT covered by existing options spec files:     */
/*    - options.spec.ts           (30+ tests — rendering, save, reset, edges)  */
/*    - options-hardened.spec.ts  (35+ tests — resilience, validation, XSS)    */
/*    - options-advanced.spec.ts  (20+ tests — input, buttons, messages)       */
/*                                                                             */
/*  Focus areas:                                                               */
/*    1. Whitespace trimming edge cases (tabs, newlines, mixed)                */
/*    2. URL with internal spaces preserved                                    */
/*    3. Concurrent double-save exact timing                                   */
/*    4. Save → change input → save persistence                                */
/* ========================================================================== */

/* ── Constants ──────────────────────────────────────────────────────────── */

const DEFAULT_URL = "http://localhost:3000";

/* ── Storage override for concurrent save tests ──────────────────────────── */

/**
 * Wrap chrome.storage.sync.set with an artificial delay so concurrent
 * operations can be meaningfully tested.
 */
function delayStorageSet(page: import("@playwright/test").Page, delayMs: number): Promise<void> {
  return page.addInitScript((delay: number) => {
    const origSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    chrome.storage.sync.set = ((items: any, callback?: (...args: any[]) => void) => {
      setTimeout(() => {
        try {
          origSet(items, (...args: any[]) => {
            if (callback) callback(...args);
          });
        } catch (e) {
          if (callback) callback(e);
        }
      }, delay);
    }) as unknown as typeof chrome.storage.sync.set;
  }, delayMs);
}

/* ========================================================================== */
/*  Suite                                                                     */
/* ========================================================================== */

test.describe("Options Page — Missing Coverage", () => {
  let options: OptionsPage;

  test.beforeEach(async ({ page, extensionId }) => {
    options = new OptionsPage(page, extensionId);
    await options.goto();
    await page.waitForSelector(".url-input");
  });

  /* ====================================================================== */
  /*  1. Whitespace Trimming Edge Cases                                      */
  /*  handleSave calls url.trim() before validation and saving.              */
  /*  Test various whitespace characters are correctly trimmed.              */
  /* ====================================================================== */

  test.describe("Whitespace Trimming Edge Cases", () => {
    test("1.1 — URL with leading tabs and trailing spaces is saved trimmed", async () => {
      const input = "\t\t\thttp://example.com   ";
      const expected = "http://example.com";

      await options.fillUrl(input);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(expected);

      // Input shows the trimmed value... actually React state holds the raw input
      // The code does `url.trim()` only for validation/storage, not for display.
      // So input shows raw value but storage has trimmed.
    });

    test("1.2 — URL with leading newlines and trailing tabs is saved trimmed", async () => {
      const input = "\n\nhttp://localhost:8080\t\t";
      const expected = "http://localhost:8080";

      await options.fillUrl(input);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(expected);
    });

    test("1.3 — URL with mixed whitespace (spaces, tabs, newlines) on both sides is trimmed", async () => {
      const input = " \t\n http://api.example.com \t\n ";
      const expected = "http://api.example.com";

      await options.fillUrl(input);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(expected);
    });

    test("1.4 — whitespace-only input with tabs is treated as empty", async () => {
      // "\t\t" → trimmed to "" → falsy → skips validation → setApiBaseUrl("") → success
      await options.fillUrl("\t\t");
      await options.clickSave();

      await expect(options.errorMessage).not.toBeVisible();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("1.5 — whitespace-only input with newlines is treated as empty", async () => {
      await options.fillUrl("\n\n\n");
      await options.clickSave();

      await expect(options.errorMessage).not.toBeVisible();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("1.6 — whitespace-only input with mixed chars treated as empty", async () => {
      await options.fillUrl(" \t\n  \t ");
      await options.clickSave();

      await expect(options.errorMessage).not.toBeVisible();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("1.7 — URL with trailing newline is saved trimmed (no newline in storage)", async () => {
      const input = "http://example.com\n";
      const expected = "http://example.com";

      await options.fillUrl(input);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(expected);
    });
  });

  /* ====================================================================== */
  /*  2. URL with Internal Whitespace                                        */
  /*  handleSave trims only leading/trailing whitespace, NOT internal.        */
  /*  A URL like "http://example.com/path with spaces" passes validation      */
  /*  because the regex /^https?:\/\/.+/ matches spaces after the protocol.   */
  /*  This test documents the current behavior.                              */
  /* ====================================================================== */

  test.describe("URL With Internal Whitespace", () => {
    test("2.1 — URL with internal spaces passes validation and is saved as-is", async () => {
      // The regex /^https?:\/\/.+/ matches any chars including spaces
      const url = "http://example.com/path with spaces";
      await options.fillUrl(url);
      await options.clickSave();

      // Currently passes validation because `.+` matches spaces too
      // This may be a validation gap — an intentional test of current behavior
      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.2 — URL with internal tabs passes validation and is saved as-is", async () => {
      const url = "http://example.com/\tpath";
      await options.fillUrl(url);
      await options.clickSave();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });
  });

  /* ====================================================================== */
  /*  3. Concurrent Save Behavior                                            */
  /*  When handleSave is called while a previous save is still in progress,   */
  /*  the second save overwrites the first. Verify no race conditions.        */
  /* ====================================================================== */

  test.describe("Concurrent Save Behavior", () => {
    test("3.1 — two saves fired in quick succession both complete without error", async ({
      page,
    }) => {
      // Install a delay on storage.set so both save handlers run before
      // either storage write completes.
      await delayStorageSet(page, 300);
      await options.goto();
      await page.waitForSelector(".url-input");

      await options.fillUrl("http://first-save.example.com");
      const firstClick = options.saveButton.click();

      await options.fillUrl("http://second-save.example.com");
      const secondClick = options.saveButton.click();

      // Wait for both delayed storage operations to complete
      await Promise.all([firstClick, secondClick]);
      await page.waitForTimeout(500);

      // At least one of the saves completed — no error should be visible
      await expect(options.errorMessage).not.toBeVisible();

      // The last write should have won (second-save URL)
      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://second-save.example.com");
    });

    test("3.2 — save + reset in close succession work correctly", async () => {
      // Save a URL, then immediately reset
      await options.fillUrl("http://will-be-reset.example.com");
      await options.saveButton.click();
      await options.resetButton.click();

      await page.waitForTimeout(500);

      // After reset, input shows default
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);

      // Storage should be cleared
      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });
  });

  /* ====================================================================== */
  /*  4. Input Persistence After Save                                        */
  /*  Verify the input retains its value after successful save.              */
  /* ====================================================================== */

  test.describe("Input Persistence After Save", () => {
    test("4.1 — input retains saved value after clicking save", async () => {
      const url = "http://persist-after-save.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Input should still show the URL (not cleared)
      await expect(options.urlInput).toHaveValue(url);
    });

    test("4.2 — input retains saved value after pressing Enter", async () => {
      const url = "http://persist-after-enter.example.com";
      await options.fillUrl(url);
      await options.pressEnter();
      await expect(options.successMessage).toBeVisible();

      await expect(options.urlInput).toHaveValue(url);
    });

    test("4.3 — after save and reload, saved URL is pre-filled", async () => {
      const url = "http://reload-prefill.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      await options.reload();
      await options.page.waitForSelector(".url-input");

      await expect(options.urlInput).toHaveValue(url);
    });

    test("4.4 — after save, changing input value then saving again overwrites", async () => {
      await options.fillUrl("http://first-version.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      await options.fillUrl("http://second-version.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://second-version.example.com");

      // Reload and confirm
      await options.reload();
      await options.page.waitForSelector(".url-input");
      await expect(options.urlInput).toHaveValue("http://second-version.example.com");
    });
  });
});
