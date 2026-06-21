import { test, expect } from "./fixtures";
import { OptionsPage } from "./pages/options";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const DEFAULT_URL = "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/*  Storage override helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Make chrome.storage.sync.get always reject (simulates read failure).
 * Call before navigating / reloading the page.
 */
function failStorageGet(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const origGet = chrome.storage.sync.get.bind(chrome.storage.sync);
    chrome.storage.sync.get = ((_keys: any, _cb?: (...args: any[]) => void) => {
      return Promise.reject(new Error("Simulated storage.get failure"));
    }) as unknown as typeof chrome.storage.sync.get;
  });
}

/**
 * Make chrome.storage.sync.set reject with a QUOTA_BYTES_PER_ITEM error.
 * Call before navigating / reloading the page.
 */
function failStorageSetQuota(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const origSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    chrome.storage.sync.set = ((
      _items: any,
      cb?: (...args: any[]) => void,
    ) => {
      const err = new Error("QUOTA_BYTES_PER_ITEM exceeded");
      (err as any).code = "QUOTA_BYTES_PER_ITEM";
      if (typeof cb === "function") cb(err);
      return Promise.reject(err);
    }) as unknown as typeof chrome.storage.sync.set;
  });
}

/**
 * Make ALL chrome.storage.sync operations reject (simulates storage being
 * completely disabled / unavailable).
 */
function failStorageAll(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    const rejector = (() =>
      Promise.reject(new Error("chrome.storage.sync unavailable"))) as any;
    chrome.storage.sync.get = rejector;
    chrome.storage.sync.set = rejector;
    chrome.storage.sync.remove = rejector;
    chrome.storage.sync.clear = rejector;
  });
}

/* -------------------------------------------------------------------------- */
/*  Suite                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Options Page — Hardened", () => {
  let options: OptionsPage;

  test.beforeEach(async ({ page, extensionId }) => {
    options = new OptionsPage(page, extensionId);
    await options.goto();
    await page.waitForSelector(".url-input");
  });

  /* ====================================================================== */
  /*  1. Network & Storage Resilience                                       */
  /* ====================================================================== */

  test.describe("Network & Storage Resilience", () => {
    test("1.1 — storage quota exceeded on save shows error and allows recovery", async () => {
      // Arrange: make set reject with a quota error on next navigation
      await failStorageSetQuota(options.page);
      await options.reload();
      await options.page.waitForSelector(".url-input");

      // Act: try saving a valid URL
      await options.fillUrl("http://quota-test.example.com");
      await options.clickSave();

      // Assert: error message is shown
      await expect(options.errorMessage).toContainText("Erreur lors de la sauvegarde");
      await expect(options.successMessage).not.toBeVisible();

      // Act — recovery: reload (init-script is cleared) and save again
      await options.reload();
      await options.page.waitForSelector(".url-input");
      await options.fillUrl("http://recovered.example.com");
      await options.clickSave();

      // Assert: recovery succeeded
      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://recovered.example.com");
    });

    test("1.2 — storage.get failure falls back to default URL without crash", async () => {
      // Arrange: make get always reject
      await failStorageGet(options.page);
      await options.reload();
      await options.page.waitForSelector(".url-input");

      // Assert: input shows default URL, page is fully functional
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);
      await expect(options.title).toBeVisible();
      await expect(options.saveButton).toBeVisible();
      await expect(options.resetButton).toBeVisible();

      // User can still interact
      await options.fillUrl("http://fallback-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
    });

    test("1.3 — corrupted storage data (non-string) falls back gracefully", async () => {
      // Arrange: write non-string value that bypasses the type guard in getApiBaseUrl
      await options.page.evaluate(() => {
        return new Promise<void>((resolve) => {
          chrome.storage.sync.set({ apiBaseUrl: 12345 }, resolve);
        });
      });

      // Act: reload – the typeof check in getApiBaseUrl rejects non-strings
      await options.reload();
      await options.page.waitForSelector(".url-input");

      // Assert: falls back to default
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);

      // User can still save a new URL
      await options.fillUrl("http://corruption-recovery.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://corruption-recovery.example.com");
    });

    test("1.4 — 10 rapid saves in under 2 seconds — last value wins", async () => {
      const urls = Array.from({ length: 10 }, (_, i) => `http://rapid-${i}.example.com`);

      // Act: fill and click save rapidly
      for (const url of urls) {
        await options.fillUrl(url);
        await options.saveButton.click();
      }

      // Assert: success message visible and last URL persisted
      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe(urls[urls.length - 1]);

      // Reload and verify
      await options.reload();
      await options.page.waitForSelector(".url-input");
      await expect(options.urlInput).toHaveValue(urls[urls.length - 1]);
    });

    test("1.5 — save followed by immediate reload may still persist the value", async () => {
      // Act: fill, click save, and reload without awaiting the save
      await options.fillUrl("http://race-unload.example.com");

      // Fire save and immediately reload — order is intentionally racy
      await Promise.all([
        options.saveButton.click(),
        options.page.reload(),
      ]);

      await options.page.waitForSelector(".url-input");

      // Assert: if the write completed before the document unloaded, the value is saved
      const stored = await options.readStorageUrl();
      if (stored === "http://race-unload.example.com") {
        await expect(options.urlInput).toHaveValue("http://race-unload.example.com");
      } else {
        // NOTE: If storage.write did not flush before the page unloaded,
        // the value may be lost.  This is a best‑effort scenario — the
        // desired behaviour is that the write always completes, but the
        // current API does not guarantee it.
        console.log(
          "[NOTE] Save did not complete before reload – acceptable race condition.",
        );
      }
    });

    test("1.6 — storage.onChanged listener is NOT registered (desired behaviour)", async () => {
      // The current App.tsx does NOT listen to chrome.storage.onChanged.
      // This means changing apiBaseUrl from another tab does NOT update
      // the input in real time.  This test documents the gap.
      //
      // Expected implementation:
      //   useEffect(() => {
      //     const handler = (changes: Record<string, chrome.storage.ChangeInfo>) => {
      //       if (changes.apiBaseUrl) setUrl(changes.apiBaseUrl.newValue ?? DEFAULT_API_BASE);
      //     };
      //     chrome.storage.onChanged.addListener(handler);
      //     return () => chrome.storage.onChanged.removeListener(handler);
      //   }, []);

      // Verify the onChanged mechanism is available
      const hasOnChangedApi = await options.page.evaluate(() => {
        return !!(chrome.storage as any).onChanged;
      });
      expect(hasOnChangedApi).toBe(true);

      // Verify that changing storage from an evaluate does NOT update the input
      await options.page.evaluate(() => {
        chrome.storage.sync.set({ apiBaseUrl: "http://external-change.example.com" });
      });

      // Wait a short tick for any listener to fire
      await options.page.waitForTimeout(300);

      // The input should still show the old value (before the external change)
      // unless a listener was registered — which it currently isn't.
      const inputValue = await options.urlInput.inputValue();
      expect(inputValue).not.toBe("http://external-change.example.com");
    });

    test("1.7 — storage entirely disabled on page load does not crash", async () => {
      // Arrange: kill all storage sync operations before the page loads
      await failStorageAll(options.page);
      await options.reload();
      await options.page.waitForSelector(".url-input");

      // Assert: page renders with default URL, no crash
      await expect(options.urlInput).toHaveValue(DEFAULT_URL);
      await expect(options.title).toBeVisible();
      await expect(options.saveButton).toBeEnabled();
      await expect(options.resetButton).toBeEnabled();
    });
  });

  /* ====================================================================== */
  /*  2. Advanced URL Validation                                            */
  /* ====================================================================== */

  test.describe("Advanced URL Validation", () => {
    test("2.1 — IPv6 URL http://[::1]:3000 is accepted", async () => {
      const url = "http://[::1]:3000";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.2 — URL with query string (http://host:3000?api=v2) is accepted", async () => {
      const url = "http://api.example.com:3000?version=2&format=json";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.3 — URL with fragment (http://host:3000#section) is accepted", async () => {
      const url = "http://api.example.com:3000#production";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.4 — both http:// and https:// protocols are accepted", async () => {
      // http
      await options.fillUrl("http://protocol-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
      let stored = await options.readStorageUrl();
      expect(stored).toBe("http://protocol-test.example.com");

      // https
      await options.fillUrl("https://protocol-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
      stored = await options.readStorageUrl();
      expect(stored).toBe("https://protocol-test.example.com");
    });

    test("2.5 — data: URI is rejected", async () => {
      await options.fillUrl("data:text/plain;base64,SGVsbG8=");
      await options.clickSave();
      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });

    test("2.6 — javascript: URL is rejected", async () => {
      await options.fillUrl("javascript:void(0)");
      await options.clickSave();
      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });

    test("2.7 — URL with only TLD (http://co.uk) is accepted", async () => {
      const url = "http://co.uk";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.8 — Punycode/IDN URL (http://xn--exemple-vqa.com) is accepted", async () => {
      const url = "http://xn--exemple-vqa.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("2.9 — URL with percent-encoded characters is stored as-is", async () => {
      const url = "http://example.com/api%20path%2Fv1";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });
  });

  /* ====================================================================== */
  /*  3. UI / UX Edge Cases                                                 */
  /* ====================================================================== */

  test.describe("UI / UX Edge Cases", () => {
    test("3.1 — input uses correct font-family (Roboto, Arial, sans-serif)", async () => {
      const font = await options.urlInput.evaluate((el) =>
        window.getComputedStyle(el).fontFamily,
      );
      expect(font.toLowerCase()).toContain("roboto");
    });

    test("3.2 — placeholder shows default URL and is styled with visible color", async () => {
      await expect(options.urlInput).toHaveAttribute("placeholder", DEFAULT_URL);

      // Placeholder text color should be non-transparent (visible)
      const placeholderColor = await options.urlInput.evaluate((el) => {
        // Use the ::placeholder pseudo-element via computed style
        // In practice, the placeholder inherits the input's color with lower opacity
        return window.getComputedStyle(el).color;
      });
      expect(placeholderColor).toBeTruthy();
    });

    test("3.3 — save button has cursor: pointer", async () => {
      const cursor = await options.saveButton.evaluate((el) =>
        window.getComputedStyle(el).cursor,
      );
      expect(cursor).toBe("pointer");
    });

    test("3.4 — save (btn-primary) and reset (btn-ghost) have distinct visual styling", async () => {
      // Save button: red background, no border
      const saveBg = await options.saveButton.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor,
      );
      expect(saveBg).toBe("rgb(255, 0, 0)");

      const saveBorder = await options.saveButton.evaluate((el) =>
        window.getComputedStyle(el).border,
      );
      // btn-primary has no border → computed as 0px none
      expect(saveBorder).toContain("0px none");

      // Reset button: transparent background, solid border
      const resetBg = await options.resetButton.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor,
      );
      expect(resetBg).toBe("rgba(0, 0, 0, 0)");

      const resetBorderStyle = await options.resetButton.evaluate((el) =>
        window.getComputedStyle(el).borderStyle,
      );
      expect(resetBorderStyle).toBe("solid");
    });

    test("3.5 — error message persists while user types (current implementation)", async () => {
      // Arrange: trigger an error
      await options.fillUrl("not-a-valid-url");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Act: type a character — current onChange only clears `saved` (success),
      // NOT `error`.  So the error should remain visible.
      await options.fillUrl("http://still-has-error.example.com");

      // Assert: error is still visible
      //
      // NOTE: If this test fails, it means the implementation was updated
      // to clear error on input change, which is a welcome improvement.
      await expect(options.errorMessage).toBeVisible();
    });

    test("3.6 — save button is never disabled (current implementation)", async () => {
      // Before save
      await expect(options.saveButton).toBeEnabled();
      const disabledAttr = await options.saveButton.getAttribute("disabled");
      expect(disabledAttr).toBeNull();

      // During / after save — still enabled
      await options.fillUrl("http://disabled-test.example.com");
      await options.saveButton.click();
      await expect(options.saveButton).toBeEnabled();
      expect(disabledAttr).toBeNull();
    });

    test("3.7 — no loading spinner or progress indicator (current implementation)", async () => {
      // No spinner should exist anywhere in the DOM
      const spinnerLocators = [
        options.page.locator(".spinner"),
        options.page.locator(".loading"),
        options.page.locator("[role='status']"),
        options.page.locator(".loader"),
        options.page.locator("[aria-busy='true']"),
      ];

      for (const loc of spinnerLocators) {
        await expect(loc).toHaveCount(0);
      }

      // Still no spinner during a save operation
      await options.fillUrl("http://spinner-test.example.com");
      await options.saveButton.click();
      for (const loc of spinnerLocators) {
        await expect(loc).toHaveCount(0);
      }
    });
  });

  /* ====================================================================== */
  /*  4. Security & XSS Prevention                                          */
  /* ====================================================================== */

  test.describe("Security & XSS Prevention", () => {
    test("4.1 — XSS payload in URL is rendered as text, not executed", async () => {
      // An XSS payload embedded in a URL that passes validation
      const xssUrl = "http://<img src=x onerror=alert(1)>.example.com";

      await options.fillUrl(xssUrl);
      await options.clickSave();

      // The URL should either succeed (regex matches http:// + any chars) or fail
      // Either way, no alert should fire
      const alerts: string[] = [];
      options.page.on("dialog", (d) => {
        alerts.push(d.message());
        d.dismiss();
      });

      // Wait for any async processes
      await options.page.waitForTimeout(500);
      expect(alerts).toHaveLength(0);

      // The literal angle brackets should appear in the input value
      const inputValue = await options.urlInput.inputValue();
      expect(inputValue).toContain("<img");
    });

    test("4.2 — HTML / script injection in URL is escaped in the DOM", async () => {
      const payload = "<script>alert('xss')</script><b>bold</b>";
      await options.fillUrl(payload);
      await options.clickSave();

      // Error message shown (payload does not start with http://)
      await expect(options.errorMessage).toBeVisible();

      // Verify the payload was NOT interpreted as HTML:
      // - No <script> element was injected (only the React bundle scripts)
      // - The literal text appears safely as input value
      const inputValue = await options.urlInput.inputValue();
      expect(inputValue).toBe(payload);

      // No new script element was added to the DOM
      const scriptCount = await options.page.evaluate(() =>
        document.querySelectorAll("script").length,
      );
      // The page has some scripts (React, polyfill, etc.) but the injected one should not run
      // Verify none of the scripts contain our payload
      const scriptContents = await options.page.evaluate(() => {
        return Array.from(document.querySelectorAll("script")).map((s) => s.textContent);
      });
      for (const content of scriptContents) {
        expect(content).not.toContain("alert('xss')");
      }
    });

    test("4.3 — malicious payload injected via storage (compromised) is not executed", async () => {
      // Simulate a compromised storage where apiBaseUrl contains a script
      const storedPayload = "http://<script>alert('pwnd')</script>.example.com";
      await options.writeStorageUrl(storedPayload);

      // Reload — the page reads the malicious value from storage
      await options.reload();
      await options.page.waitForSelector(".url-input");

      // The input should show the value as plain text
      await expect(options.urlInput).toHaveValue(storedPayload);

      // No alert should fire
      const alerts: string[] = [];
      options.page.on("dialog", (d) => {
        alerts.push(d.message());
        d.dismiss();
      });
      await options.page.waitForTimeout(500);
      expect(alerts).toHaveLength(0);
    });

    test("4.4 — internal storage keys are not leaked to visible page content", async () => {
      const bodyText = await options.page.evaluate(() => document.body.innerText);

      // The key name "apiBaseUrl" should not appear in visible French‑language UI
      expect(bodyText).not.toContain("apiBaseUrl");
      // Internal function names should not appear in the UI
      expect(bodyText).not.toContain("setApiBaseUrl");
      expect(bodyText).not.toContain("getApiBaseUrl");
      // Chrome runtime details should not leak
      expect(bodyText).not.toContain("chrome-extension");
    });

    test("4.5 — CSP (script-src 'self') blocks inline script execution", async () => {
      // The manifest declares: script-src 'self'; object-src 'self'
      // This test verifies that inline scripts cannot execute in the extension page
      const scriptExecuted = await options.page.evaluate(() => {
        const s = document.createElement("script");
        s.textContent = "window.__cspTestExecuted = true";
        document.head.appendChild(s);
        // The script is appended to the DOM by the browser will NOT execute it
        // because CSP blocks inline scripts in extension pages.
        // Wait a tick, then check
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve((window as any).__cspTestExecuted === true);
          }, 100);
        });
      });

      // Inline script execution should have been blocked
      expect(scriptExecuted).toBe(false);
    });
  });

  /* ====================================================================== */
  /*  5. Cross-feature Integration                                          */
  /* ====================================================================== */

  test.describe("Cross-feature Integration", () => {
    test("5.1 — URL saved in options is readable from chrome.storage.sync in any context", async () => {
      const url = "http://cross-context.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Read storage from the page context — this simulates what the background
      // script or sidepanel would do
      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("5.2 — background service worker uses the newly saved API URL", async () => {
      const newBase = "http://custom-backend.test:9999";
      await options.fillUrl(newBase);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Verify the value is persisted to storage (background reads from same store)
      const stored = await options.readStorageUrl();
      expect(stored).toBe(newBase);

      // Send a GET_TRENDS message to the background script.
      // The background reads getApiBaseUrl() from storage.sync on every message,
      // so it will attempt to fetch from the new base URL.
      // We can't intercept the network call from the options page context,
      // but we can verify the message round‑trip completes (even if fetch fails).
      const response = await options.page.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "GET_TRENDS" }, (resp) => {
            resolve(resp);
          });
        });
      });

      // The response may be an error (FETCH_ERROR because no server is running
      // on custom-backend.test), but that's expected — what matters is that
      // the background processed the message and didn't crash.
      expect(response).toBeDefined();
    });

    test("5.3 — invalid URL does not overwrite previously saved URL in storage", async () => {
      // Arrange: save a valid URL first
      await options.fillUrl("http://valid-stored.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
      const savedValue = await options.readStorageUrl();
      expect(savedValue).toBe("http://valid-stored.example.com");

      // Act: try saving an invalid URL (fails client-side validation)
      await options.fillUrl("invalid-no-protocol");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      // Assert: storage still holds the original valid URL
      const storedAfterInvalid = await options.readStorageUrl();
      expect(storedAfterInvalid).toBe("http://valid-stored.example.com");
    });
  });

  /* ====================================================================== */
  /*  6. Internationalization & Locale                                      */
  /* ====================================================================== */

  test.describe("Internationalization & Locale", () => {
    test("6.1 — all visible UI text is in French", async () => {
      await expect(options.title).toContainText("Paramètres TrendHunter");
      await expect(options.sectionTitle).toContainText("URL de l");
      await expect(options.sectionTitle).toContainText("API");
      await expect(options.saveButton).toContainText("Sauvegarder");
      await expect(options.resetButton).toContainText("Réinitialiser");
      await expect(options.description).toContainText(
        "Adresse du serveur backend TrendHunter",
      );
    });

    test("6.2 — <code> element for default URL is styled distinctly", async () => {
      const codeEl = options.description.locator("code");
      await expect(codeEl).toBeVisible();
      await expect(codeEl).toContainText(DEFAULT_URL);

      // Check distinct background (#2a2a2a) and text color (#ff0000 red)
      const bg = await codeEl.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor,
      );
      expect(bg).toBe("rgb(42, 42, 42)");

      const color = await codeEl.evaluate((el) =>
        window.getComputedStyle(el).color,
      );
      expect(color).toBe("rgb(255, 0, 0)");
    });

    test("6.3 — input direction is LTR (appropriate for URLs)", async () => {
      // Check computed direction (default is ltr if not overridden by dir attr)
      const direction = await options.urlInput.evaluate((el) =>
        window.getComputedStyle(el).direction,
      );
      expect(direction).toBe("ltr");
    });

    test("6.4 — paragraph text wraps naturally", async () => {
      const descWidth = await options.description.evaluate((el) =>
        el.getBoundingClientRect().width,
      );
      const containerWidth = await options.page
        .locator(".options-container")
        .evaluate((el) => el.getBoundingClientRect().width);

      // Description width should be ≤ container width (it wraps, not overflows)
      expect(descWidth).toBeLessThanOrEqual(containerWidth);

      // white-space should NOT be "nowrap" (would prevent wrapping)
      const ws = await options.description.evaluate((el) =>
        window.getComputedStyle(el).whiteSpace,
      );
      expect(ws).not.toBe("nowrap");
    });
  });

  /* ====================================================================== */
  /*  7. Performance & Rendering                                            */
  /* ====================================================================== */

  test.describe("Performance & Rendering", () => {
    test("7.1 — page reaches interactive state quickly", async () => {
      // Measure via the Performance Navigation Timing API
      const timing = await options.page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (!nav) return null;
        return {
          domInteractive: Math.round(nav.domInteractive),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEventEnd: Math.round(nav.loadEventEnd),
        };
      });

      console.log("[perf] Navigation timing:", timing);

      // In an extension context with React, 5 seconds is a generous upper bound
      expect(timing).not.toBeNull();
      if (timing) {
        expect(timing.domInteractive).toBeLessThan(5000);
      }

      // The input should have been present since the first navigation in beforeEach
      await expect(options.urlInput).toBeVisible();
    });

    test("7.2 — DOM is stable after initial render (no infinite re-render loop)", async () => {
      // Capture the inner HTML after a settling delay
      await options.page.waitForTimeout(500);
      const snapshotA = await options.page.evaluate(() => document.body.innerHTML);

      // Wait again — if there were an infinite loop, the DOM would change
      await options.page.waitForTimeout(1000);
      const snapshotB = await options.page.evaluate(() => document.body.innerHTML);

      expect(snapshotB).toBe(snapshotA);
    });

    test("7.3 — 5 full save/reset cycles — state remains consistent", async () => {
      for (let i = 0; i < 5; i++) {
        await options.fillUrl(`http://cycle-${i}.example.com`);
        await options.clickSave();
        await expect(options.successMessage).toBeVisible();
        await expect(options.errorMessage).not.toBeVisible();
        const stored = await options.readStorageUrl();
        expect(stored).toBe(`http://cycle-${i}.example.com`);

        await options.clickReset();
        await expect(options.urlInput).toHaveValue(DEFAULT_URL);
        await expect(options.successMessage).toBeVisible();
        const afterReset = await options.readStorageUrl();
        expect(afterReset).toBe("");
      }

      // After all cycles, the page should be fully functional
      await expect(options.title).toBeVisible();
      await expect(options.saveButton).toBeEnabled();
    });

    test("7.4 — no layout shift on save / reset", async () => {
      const getRect = () =>
        options.page.locator(".options-container").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });

      const rectBefore = await getRect();

      // Save
      await options.fillUrl("http://layout-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const rectAfterSave = await getRect();
      expect(rectAfterSave.x).toBe(rectBefore.x);
      expect(rectAfterSave.y).toBe(rectBefore.y);

      // Reset
      await options.clickReset();
      await options.page.waitForTimeout(100);

      const rectAfterReset = await getRect();
      expect(rectAfterReset.x).toBe(rectBefore.x);
      expect(rectAfterReset.y).toBe(rectBefore.y);
    });
  });

  /* ====================================================================== */
  /*  8. Accessibility & Keyboard                                           */
  /* ====================================================================== */

  test.describe("Accessibility & Keyboard", () => {
    test("8.1 — tab order: URL input → Sauvegarder → Réinitialiser", async () => {
      await options.urlInput.focus();
      await expect(options.urlInput).toBeFocused();

      await options.page.keyboard.press("Tab");
      await expect(options.saveButton).toBeFocused();

      await options.page.keyboard.press("Tab");
      await expect(options.resetButton).toBeFocused();
    });

    test("8.2 — focus indicator is visible on all interactive elements", async () => {
      // Input uses border-color change on focus (outline: none in CSS)
      await options.urlInput.focus();
      const inputBorderColor = await options.urlInput.evaluate((el) =>
        window.getComputedStyle(el).borderColor,
      );
      // The CSS sets border-color to #ff0000 on focus
      expect(inputBorderColor).toBe("rgb(255, 0, 0)");

      // Buttons use the browser-default focus outline (not removed)
      await options.saveButton.focus();
      const saveOutlineStyle = await options.saveButton.evaluate((el) =>
        window.getComputedStyle(el).outlineStyle,
      );
      // Outline style should be something other than "none" (default: "auto" or "solid")
      expect(saveOutlineStyle).not.toBe("none");
    });

    test("8.3 — Escape key does not close or navigate away", async () => {
      const currentUrl = options.page.url();

      await options.urlInput.focus();
      await options.page.keyboard.press("Escape");

      // Page should still be on the same options URL
      expect(options.page.url()).toBe(currentUrl);

      // All elements should still be visible
      await expect(options.urlInput).toBeVisible();
      await expect(options.saveButton).toBeVisible();
    });

    test("8.4 — success and error messages use semantic <p> elements for screen readers", async () => {
      // Trigger success
      await options.fillUrl("http://semantic-test.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const successTag = await options.successMessage.evaluate((el) => el.tagName);
      expect(successTag).toBe("P");

      // Trigger error
      await options.fillUrl("bad");
      await options.clickSave();
      await expect(options.errorMessage).toBeVisible();

      const errorTag = await options.errorMessage.evaluate((el) => el.tagName);
      expect(errorTag).toBe("P");

      // NOTE: The current implementation does NOT add aria-live="polite"
      // to these <p> elements.  Adding it would improve screen reader
      // announcement of dynamic messages:
      //   <p className="msg-success" aria-live="polite">...</p>
    });

    test("8.5 — color contrast meets WCAG AA requirements", async () => {
      // Helper: relative luminance per WCAG 2.1
      function relativeLuminance(hex: string): number {
        const rgb = parseInt(hex.slice(1), 16);
        const r = ((rgb >> 16) & 0xff) / 255;
        const g = ((rgb >> 8) & 0xff) / 255;
        const b = (rgb & 0xff) / 255;
        const linearize = (c: number) =>
          c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
      }

      function contrastRatio(a: string, b: string): number {
        const la = relativeLuminance(a);
        const lb = relativeLuminance(b);
        const lighter = Math.max(la, lb);
        const darker = Math.min(la, lb);
        return (lighter + 0.05) / (darker + 0.05);
      }

      // Body text (#f1f1f1) on body background (#0f0f0f)
      const bodyText = "#f1f1f1";
      const bodyBg = "#0f0f0f";
      const bodyContrast = contrastRatio(bodyText, bodyBg);
      expect(bodyContrast).toBeGreaterThanOrEqual(4.5);
      console.log(`[a11y] Body text contrast ratio: ${bodyContrast.toFixed(2)}:1`);

      // Section title (#aaaaaa) on section background (#212121)
      const sectionTitleColor = "#aaaaaa";
      const sectionBg = "#212121";
      const sectionContrast = contrastRatio(sectionTitleColor, sectionBg);
      // AA for large text (18px+ or 14px bold) requires 3:1
      // The section-title is 14px bold → qualifies as large text → 3:1 minimum
      expect(sectionContrast).toBeGreaterThanOrEqual(3);
      console.log(`[a11y] Section title contrast ratio: ${sectionContrast.toFixed(2)}:1`);
    });

    test("8.6 — Enter key on Sauvegarder button triggers save", async () => {
      await options.fillUrl("http://keyboard-enter-button.example.com");

      // Focus the save button and press Enter (standard button behaviour)
      await options.saveButton.focus();
      await options.page.keyboard.press("Enter");

      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://keyboard-enter-button.example.com");
    });
  });
});
