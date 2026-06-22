import { test, expect } from "./fixtures";
import { OptionsPage } from "./pages/options";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const DEFAULT_URL = "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Send a runtime message from the extension page and await the response.
 */
function sendMessage<T = any>(
  page: import("@playwright/test").Page,
  msg: Record<string, unknown>,
): Promise<T> {
  return page.evaluate((m) => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(m, resolve);
    });
  }, msg);
}

/**
 * Wraps chrome.storage.sync.set with a delay so that concurrent operations
 * (e.g. double-click save, save-then-reset) can be meaningfully tested.
 *
 * Call **before** navigating to the options page so the override takes effect
 * from the very first page load.
 */
function delayStorageSet(
  page: import("@playwright/test").Page,
  delayMs: number,
): Promise<void> {
  return page.addInitScript((delay: number) => {
    const origSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    chrome.storage.sync.set = ((
      items: any,
      callback?: (...args: any[]) => void,
    ) => {
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

/* -------------------------------------------------------------------------- */
/*  Suite                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Options Page — Advanced Edge Cases", () => {
  let options: OptionsPage;

  test.beforeEach(async ({ page, extensionId }) => {
    options = new OptionsPage(page, extensionId);
    await options.goto();
    await page.waitForSelector(".url-input");
  });

  /* ====================================================================== */
  /*  1. Input Behavior Edge Cases                                          */
  /* ====================================================================== */

  test.describe("Input Behavior", () => {
    test("1.1 — input value updates in real-time as user types", async () => {
      // Act: type one character at a time
      await options.urlInput.clear();
      await expect(options.urlInput).toHaveValue("");

      await options.urlInput.type("h", { delay: 10 });
      await expect(options.urlInput).toHaveValue("h");

      await options.urlInput.type("t", { delay: 10 });
      await expect(options.urlInput).toHaveValue("ht");

      await options.urlInput.type("t", { delay: 10 });
      await expect(options.urlInput).toHaveValue("htt");

      await options.urlInput.type("p", { delay: 10 });
      await expect(options.urlInput).toHaveValue("http");
    });

    test("1.2 — input with ONLY whitespace is trimmed to '' on save", async () => {
      // Arrange: fill input with spaces
      await options.urlInput.fill("   ");

      // Act: save
      await options.clickSave();

      // Assert: no validation error (trimmed = "" is falsy → skips validation)
      await expect(options.errorMessage).not.toBeVisible();

      // A successful removal (setApiBaseUrl("")) also triggers the success message
      await expect(options.successMessage).toBeVisible();

      // Storage should be cleared (apiBaseUrl removed)
      const stored = await options.readStorageUrl();
      expect(stored).toBe("");

      // Input value stays as "   " (React state is the raw input, not trimmed)
      await expect(options.urlInput).toHaveValue("   ");
    });

    test("1.3 — keyboard shortcuts: Copy, Paste, Cut, Select All", async () => {
      // Arrange: type a URL into the input
      const testUrl = "http://clipboard-test.example.com";
      await options.urlInput.fill(testUrl);
      await expect(options.urlInput).toHaveValue(testUrl);

      // Act: Ctrl+A (Select All), Ctrl+C (Copy)
      await options.urlInput.press("Control+a");
      await options.urlInput.press("Control+c");

      // Clear the input, then Ctrl+V (Paste) — the value should come back
      await options.urlInput.fill("");
      await expect(options.urlInput).toHaveValue("");
      await options.urlInput.press("Control+v");
      await expect(options.urlInput).toHaveValue(testUrl);

      // Ctrl+X (Cut) — clears input and copies to clipboard
      await options.urlInput.press("Control+a");
      await options.urlInput.press("Control+x");
      await expect(options.urlInput).toHaveValue("");

      // Paste back what was cut
      await options.urlInput.press("Control+v");
      await expect(options.urlInput).toHaveValue(testUrl);
    });

    test("1.4 — input retains its value after a validation error", async () => {
      const invalidUrl = "not-a-valid-url";

      // Arrange: fill with invalid value
      await options.urlInput.fill(invalidUrl);

      // Act: click save (triggers validation error)
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Assert: input value is still the invalid string (not cleared)
      await expect(options.urlInput).toHaveValue(invalidUrl);
    });

    test("1.5 — input retains its value after a successful save", async () => {
      const validUrl = "http://retain-after-save.example.com";

      // Arrange: fill with valid URL
      await options.urlInput.fill(validUrl);

      // Act: click save (should succeed)
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Assert: input value is still the saved URL (not cleared)
      await expect(options.urlInput).toHaveValue(validUrl);
    });

    test("1.6 — placeholder is visible when input value is empty", async () => {
      // Arrange: ensure input is empty and has the placeholder attribute
      await options.urlInput.fill("");

      // Assert: input value is empty, placeholder attribute is present
      await expect(options.urlInput).toHaveValue("");
      await expect(options.urlInput).toHaveAttribute(
        "placeholder",
        DEFAULT_URL,
      );

      // The browser renders placeholder text only when the input is empty.
      // We verify there's no visible text inside the input (value is "").
      const inputValue = await options.urlInput.inputValue();
      expect(inputValue).toBe("");
    });

    test("1.7 — rapid paste of 100+ characters captures all text", async () => {
      // Build a 150-character string
      const longUrl =
        "http://" + "abc.def.ghi.jkl.mno.pqr.stu.vwx.yz.".repeat(5).slice(0, 140);

      // Act: fill the input (Playwright's fill simulates a single paste)
      await options.urlInput.fill(longUrl);

      // Assert: all characters are captured
      const actualValue = await options.urlInput.inputValue();
      expect(actualValue).toBe(longUrl);
      expect(actualValue.length).toBeGreaterThan(100);
    });
  });

  /* ====================================================================== */
  /*  2. Button Behavior Edge Cases                                         */
  /* ====================================================================== */

  test.describe("Button Behavior", () => {
    test("2.1 — rapid double-click on save does not cause errors", async () => {
      await options.fillUrl("http://double-click-test.example.com");

      // Act: fire two save clicks in rapid succession
      await Promise.all([
        options.saveButton.click(),
        options.saveButton.click(),
      ]);

      // Assert: no error, success visible, storage has the value
      await expect(options.errorMessage).not.toBeVisible();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://double-click-test.example.com");
    });

    test("2.2 — click reset while save is in progress (reset takes priority)", async ({
      page,
    }) => {
      // Install a 400 ms delay on storage.set so the save operation is still
      // pending when we click reset.
      await delayStorageSet(page, 400);

      // Re-navigate so the delay script runs on the fresh page load
      await options.goto();
      await page.waitForSelector(".url-input");

      await options.fillUrl("http://slow-save.example.com");

      // Act: fire save (will be slow due to delayed storage), then immediately reset
      options.saveButton.click(); // intentionally no await
      await page.waitForTimeout(50); // small gap to ensure save handler started
      await options.clickReset();

      // Wait for both delayed storage operations to finish (400ms delay each)
      await page.waitForTimeout(1000);

      // Assert: the input shows the default URL (reset took priority)
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);

      // Assert: no error message
      await expect(options.errorMessage).not.toBeVisible();

      // Success message should be visible (reset also shows it)
      await expect(options.successMessage).toBeVisible();

      // Storage should be cleared (reset removes the key)
      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("2.3 — both Sauvegarder and Réinitialiser buttons are visible simultaneously", async () => {
      await expect(options.saveButton).toBeVisible();
      await expect(options.resetButton).toBeVisible();

      // Both should be enabled
      await expect(options.saveButton).toBeEnabled();
      await expect(options.resetButton).toBeEnabled();
    });

    test("2.4 — Shift+Tab navigates backwards: input ← Réinitialiser ← Sauvegarder", async () => {
      // Focus the input first
      await options.urlInput.focus();
      await expect(options.urlInput).toBeFocused();

      // Shift+Tab moves focus to the previous focusable element.
      // In the DOM order: input → Sauvegarder → Réinitialiser.
      // So Shift+Tab from input: input loses focus. The previous element
      // before input would be the last focusable in the DOM flow.
      // Since input is first, Shift+Tab moves focus to the last focusable
      // element, which is the Réinitialiser button.
      await options.page.keyboard.press("Shift+Tab");
      await expect(options.resetButton).toBeFocused();

      // Another Shift+Tab → Sauvegarder
      await options.page.keyboard.press("Shift+Tab");
      await expect(options.saveButton).toBeFocused();
    });

    test("2.5 — reset button has cursor: pointer", async () => {
      const cursor = await options.resetButton.evaluate((el) =>
        window.getComputedStyle(el).cursor,
      );
      expect(cursor).toBe("pointer");
    });
  });

  /* ====================================================================== */
  /*  3. Error Message Behavior                                             */
  /* ====================================================================== */

  test.describe("Error Message Behavior", () => {
    test("3.1 — error persists until next save attempt", async () => {
      // Arrange: trigger a validation error
      await options.fillUrl("invalid-url");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();
      await expect(options.successMessage).not.toBeVisible();

      // Act: type in the input (error should NOT clear — current behavior)
      await options.urlInput.fill("still-invalid-url");
      await expect(options.errorMessage).toBeVisible();

      // Act: click save again (still invalid → error should persist)
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Act: clear input and click save (empty → validation skipped, no error)
      // But wait: handleSave checks `trimmed` which is "" → falsy → skips validation
      // Calls setApiBaseUrl("") → removes key → no error
      await options.urlInput.fill("");
      await options.clickSave();
      await expect(options.errorMessage).not.toBeVisible();
    });

    test("3.2 — error message is styled with red color (#dc2626)", async () => {
      // Arrange: trigger a validation error
      await options.fillUrl("bad");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Assert: color is rgb(220, 38, 38) = #dc2626
      const color = await options.errorMessage.evaluate((el) =>
        window.getComputedStyle(el).color,
      );
      expect(color).toBe("rgb(220, 38, 38)");
    });

    test("3.3 — error disappears when a valid save succeeds", async () => {
      // Arrange: trigger a validation error
      await options.fillUrl("not-valid");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Act: input a valid URL and save
      await options.fillUrl("http://valid-after-error.example.com");
      await options.clickSave();

      // Assert: error gone, success shown
      await expect(options.errorMessage).not.toBeVisible();
      await expect(options.successMessage).toBeVisible();
    });

    test("3.4 — multiple validation errors in sequence each show correctly", async () => {
      // First invalid URL
      await options.fillUrl("first-invalid");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();
      await expect(options.errorMessage).toContainText("URL invalide");

      // Second invalid URL (different string, same error message)
      await options.fillUrl("ftp://also-bad");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();
      await expect(options.errorMessage).toContainText("URL invalide");

      // Third invalid URL
      await options.fillUrl("http://");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();
      await expect(options.errorMessage).toContainText("URL invalide");
    });
  });

  /* ====================================================================== */
  /*  4. Success Message Behavior                                           */
  /* ====================================================================== */

  test.describe("Success Message Behavior", () => {
    test("4.1 — success message is styled with green color (#22c55e)", async () => {
      // Arrange: save a valid URL
      await options.fillUrl("http://success-color-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Assert: color is rgb(34, 197, 94) = #22c55e
      const color = await options.successMessage.evaluate((el) =>
        window.getComputedStyle(el).color,
      );
      expect(color).toBe("rgb(34, 197, 94)");
    });

    test("4.2 — success and error messages use different CSS classes", async () => {
      // Verify the CSS classes are distinct
      await expect(options.successMessage).not.toHaveClass(/msg-error/);
      await expect(options.errorMessage).not.toHaveClass(/msg-success/);

      // After a save, success class is present
      await options.fillUrl("http://class-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toHaveClass(/msg-success/);

      // After an error, error class is present
      await options.fillUrl("bad");
      await options.clickSave();
      await expect(options.errorMessage).toHaveClass(/msg-error/);
    });
  });

  /* ====================================================================== */
  /*  5. Cross-feature Impact                                               */
  /* ====================================================================== */

  test.describe("Cross-feature Impact", () => {
    test("5.1 — after saving URL in options, background uses it for GET_TRENDS", async ({
      page,
      context,
    }) => {
      // Arrange: save a custom API URL
      const customUrl = "https://custom-backend.test:9876";
      await options.fillUrl(customUrl);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Set up auth token so GET_TRENDS actually fetches
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          chrome.storage.session.set(
            { apiToken: "th_advanced_test", selectedNiche: "tech-ia" },
            resolve,
          );
        });
      });

      // Intercept the background's fetch call
      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: [],
            plan: "FREE",
            nextCursor: null,
          }),
        });
      });

      // Act: send GET_TRENDS from the options page
      await sendMessage(page, { type: "GET_TRENDS" });

      // Assert: the fetch was made to the custom URL
      expect(capturedUrl).toContain("custom-backend.test");
      expect(capturedUrl).toContain(":9876");
      expect(capturedUrl).toContain("/api/extension/trends");
    });

    test("5.2 — after reset, background uses the default URL for GET_TRENDS", async ({
      page,
      context,
    }) => {
      // Arrange: first save a custom URL, then reset it
      await options.fillUrl("https://will-be-reset.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      await options.clickReset();
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);

      // Set up auth token
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          chrome.storage.session.set(
            { apiToken: "th_reset_test", selectedNiche: "tech-ia" },
            resolve,
          );
        });
      });

      // Intercept the background's fetch call
      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: [],
            plan: "FREE",
            nextCursor: null,
          }),
        });
      });

      // Act: send GET_TRENDS
      await sendMessage(page, { type: "GET_TRENDS" });

      // Assert: fetch went to the default URL (localhost:3000)
      expect(capturedUrl).toContain(DEFAULT_URL);
      expect(capturedUrl).toContain("/api/extension/trends");
    });

    test("5.3 — multiple saves with different URLs — last one persists", async () => {
      const urls = [
        "http://first-save.example.com",
        "http://second-save.example.com",
        "http://third-save.example.com",
      ];

      // Save three URLs in sequence
      for (const url of urls) {
        await options.fillUrl(url);
        await options.clickSave();
        await expect(options.successMessage).toBeVisible();
      }

      // Assert: storage holds the last URL
      const stored = await options.readStorageUrl();
      expect(stored).toBe(urls[urls.length - 1]);

      // Assert: input still shows the last URL
      await expect(options.urlInput).toHaveValue(urls[urls.length - 1]);
    });
  });

  /* ====================================================================== */
  /*  6. Peripherals / Document Structure                                   */
  /* ====================================================================== */

  test.describe("Peripherals & Document", () => {
    test("6.1 — page title is 'TrendHunter — Paramètres'", async () => {
      const title = await options.page.title();
      expect(title).toBe("TrendHunter — Paramètres");
    });

    test("6.2 — input is not programmatically associated with a label (accessibility gap)", async () => {
      // The current implementation has no <label> element for the URL input.
      // This test documents the gap and serves as a regression check.

      // There should be no element with `for` attribute matching the input's id
      const inputId = await options.urlInput.getAttribute("id");
      if (inputId) {
        const label = options.page.locator(`label[for="${inputId}"]`);
        await expect(label).toHaveCount(0);
      } else {
        // Input has no id → cannot be associated with a <label>
        expect(inputId).toBeNull();
      }

      // No aria-label or aria-labelledby attribute
      const ariaLabel = await options.urlInput.getAttribute("aria-label");
      expect(ariaLabel).toBeNull();

      const ariaLabelledBy = await options.urlInput.getAttribute(
        "aria-labelledby",
      );
      expect(ariaLabelledBy).toBeNull();

      // RECOMMENDATION:
      // Add either:
      //   <label for="api-url-input">URL de l'API</label>
      //   <input id="api-url-input" ... />
      // or:
      //   <input aria-label="URL de l'API" ... />
    });

    test("6.3 — section heading hierarchy follows h1 → h2 → p", async () => {
      // The page should have exactly one h1, one h2, and a descriptive paragraph
      const h1 = options.page.locator("h1");
      const h2 = options.page.locator("h2");
      const descP = options.page.locator(".section-desc");

      await expect(h1).toHaveCount(1);
      await expect(h2).toHaveCount(1);
      await expect(descP).toHaveCount(1);

      // h1 comes before h2, h2 comes before .section-desc
      const h1Handle = await h1.elementHandle();
      const h2Handle = await h2.elementHandle();
      const descHandle = await descP.elementHandle();

      expect(h1Handle).not.toBeNull();
      expect(h2Handle).not.toBeNull();
      expect(descHandle).not.toBeNull();

      if (h1Handle && h2Handle && descHandle) {
        // Use bounding boxes to verify ordering (top-to-bottom)
        const h1Box = await h1Handle.boundingBox();
        const h2Box = await h2Handle.boundingBox();
        const descBox = await descHandle.boundingBox();

        expect(h1Box).not.toBeNull();
        expect(h2Box).not.toBeNull();
        expect(descBox).not.toBeNull();

        if (h1Box && h2Box && descBox) {
          expect(h1Box.y).toBeLessThan(h2Box.y);
          expect(h2Box.y).toBeLessThan(descBox.y);
        }
      }
    });

    test("6.4 — description paragraph explains the purpose of the API URL", async () => {
      await expect(options.description).toBeVisible();
      await expect(options.description).toContainText(
        "Adresse du serveur backend TrendHunter",
      );
      await expect(options.description).toContainText(
        "développement local",
      );

      // The code element inside the description highlights the default URL
      const codeEl = options.description.locator("code");
      await expect(codeEl).toBeVisible();
      await expect(codeEl).toContainText(DEFAULT_URL);
    });
  });
});
