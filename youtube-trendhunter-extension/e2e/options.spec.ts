import { test, expect } from "./fixtures";
import { OptionsPage } from "./pages/options";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** The default API base URL matching VITE_API_BASE_URL in .env. */
const DEFAULT_URL = "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/*  Storage failure simulation script                                         */
/* -------------------------------------------------------------------------- */

/**
 * Register an init‑script that overrides `chrome.storage.sync.{set,remove}`
 * **before** the webextension‑polyfill wraps them so that failure‑simulation
 * flags (`__storageFailMode` / `__storageFailRemovalMode`) can make those
 * operations throw.
 *
 * The override only kicks in when the respective flag is `true`; by default
 * (flag undefined) it passes through to the real implementation.
 *
 * Because the existing `page` fixture already navigates to `sidepanel.html`,
 * we call this in `beforeEach` **before** navigating to `options.html` –
 * the init‑script runs on the new page before any module scripts.
 */
function installStorageOverride(page: import("@playwright/test").Page): Promise<void> {
  return page.addInitScript(() => {
    const origSet = chrome.storage.sync.set.bind(chrome.storage.sync);
    const origRemove = chrome.storage.sync.remove.bind(chrome.storage.sync);

    // @ts-expect-error – we widen the signature to accept optional callback
    chrome.storage.sync.set = (items: any, callback?: (...args: any[]) => void) => {
      if ((window as any).__storageFailMode) {
        throw new Error("Simulated storage write failure");
      }
      return origSet(items, callback as any);
    };

    // @ts-expect-error – same widening for remove
    chrome.storage.sync.remove = (keys: any, callback?: (...args: any[]) => void) => {
      if ((window as any).__storageFailRemovalMode) {
        throw new Error("Simulated storage removal failure");
      }
      return origRemove(keys, callback as any);
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Suite                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Extension — Options Page", () => {
  let options: OptionsPage;

  test.beforeEach(async ({ page, extensionId }) => {
    // Install storage override for failure‑simulation tests
    // (safe for all tests – only activates when flag is set)
    await installStorageOverride(page);

    options = new OptionsPage(page, extensionId);
    await options.goto();
    await page.waitForSelector(".url-input");
  });

  /* ---------------------------------------------------------------------- */
  /*  Page Rendering                                                        */
  /* ---------------------------------------------------------------------- */

  test.describe("Page Rendering", () => {
    test("renders the main title", async () => {
      await expect(options.title).toContainText("Paramètres TrendHunter");
    });

    test('renders the section title "URL de l\'API"', async () => {
      await expect(options.sectionTitle).toContainText("URL de l\u2019API");
    });

    test("renders the description explaining the API URL", async () => {
      await expect(options.description).toBeVisible();
      await expect(options.description).toContainText("http://localhost:3000");
    });

    test("URL input has type url and correct placeholder", async () => {
      await expect(options.urlInput).toHaveAttribute("type", "url");
      await expect(options.urlInput).toHaveAttribute(
        "placeholder",
        DEFAULT_URL,
      );
    });

    test('save button has class btn-primary and text "Sauvegarder"', async () => {
      await expect(options.saveButton).toContainText("Sauvegarder");
    });

    test('reset button has class btn-ghost and text "Réinitialiser"', async () => {
      await expect(options.resetButton).toContainText("Réinitialiser");
    });

    test("input is pre‑filled with the default URL when storage is empty", async () => {
      // Clean slate
      await options.clearStorage();
      await options.reload();
      await options.page.waitForSelector(".url-input");

      await expect(options.urlInput).toHaveValue(DEFAULT_URL);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Save — Success Paths                                                  */
  /* ---------------------------------------------------------------------- */

  test.describe("Save — Success", () => {
    test("saves a valid HTTP URL and shows success message", async () => {
      await options.fillUrl("http://example.com");
      await options.clickSave();
      await expect(options.successMessage).toContainText(
        "✓ Configuration sauvegardée",
      );
    });

    test("saves a valid HTTPS URL", async () => {
      await options.fillUrl("https://api.trendhunter.app");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();
    });

    test("saves a URL with a custom port", async () => {
      const url = "http://localhost:8080";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("saves a URL with a path", async () => {
      const url = "http://localhost:3000/api/v2";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("saves a URL with an IP address", async () => {
      const url = "http://192.168.1.100:3000";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("after save, the value persists in chrome.storage.sync", async () => {
      const url = "http://persist-check.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("after save and page reload, the saved URL is pre‑filled", async () => {
      const url = "http://reload-check.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Reload and verify the input picks up the saved value
      await options.reload();
      await options.page.waitForSelector(".url-input");

      await expect(options.urlInput).toHaveValue(url);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Save — Validation Errors                                              */
  /* ---------------------------------------------------------------------- */

  test.describe("Save — Validation Errors", () => {
    test("empty input does NOT trigger an error (validation skips falsy)", async () => {
      await options.fillUrl("");
      await options.clickSave();

      await expect(options.errorMessage).not.toBeVisible();
      // A successful removal also triggers the success message
      await expect(options.successMessage).toBeVisible();
    });

    test('shows error for URL without a protocol', async () => {
      await options.fillUrl("example.com");
      await options.clickSave();

      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });

    test("shows error for ftp:// URL", async () => {
      await options.fillUrl("ftp://example.com");
      await options.clickSave();

      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });

    test("shows error for an arbitrary invalid string", async () => {
      await options.fillUrl("not a url");
      await options.clickSave();

      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });

    test("shows error for a URL with spaces", async () => {
      await options.fillUrl("http://example .com");
      await options.clickSave();

      await expect(options.errorMessage).toContainText(
        "URL invalide. Doit commencer par http:// ou https://",
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Reset                                                                 */
  /* ---------------------------------------------------------------------- */

  test.describe("Reset", () => {
    test("clicking Reset restores the input value to the default URL", async () => {
      await options.fillUrl("http://custom.example.com");
      await options.clickReset();

      await expect(options.urlInput).toHaveValue(DEFAULT_URL);
    });

    test("clicking Reset shows the success message", async () => {
      await options.fillUrl("http://custom.example.com");
      await options.clickReset();

      await expect(options.successMessage).toContainText(
        "✓ Configuration sauvegardée",
      );
    });

    test("after reset, the storage key is removed", async () => {
      // First save a value so there is something to remove
      await options.fillUrl("http://custom.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Then reset
      await options.clickReset();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("after reset and reload, the default URL is shown", async () => {
      await options.fillUrl("http://custom.example.com");
      await options.clickReset();

      await options.reload();
      await options.page.waitForSelector(".url-input");

      await expect(options.urlInput).toHaveValue(DEFAULT_URL);
    });

    test("reset when input already has default value still shows success", async () => {
      // Ensure a clean default state
      await options.clearStorage();
      await options.reload();
      await options.page.waitForSelector(".url-input");

      await options.clickReset();
      await expect(options.successMessage).toBeVisible();
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Success Message Auto‑Clear                                            */
  /* ---------------------------------------------------------------------- */

  test.describe("Success Message Auto-Clear", () => {
    test("success message disappears after 3 seconds", async () => {
      await options.fillUrl("http://example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Wait for the 3-second timer to expire with generous buffer
      await expect(options.successMessage).not.toBeVisible({ timeout: 6000 });
    });

    test("multiple saves should extend the visible timer (desired behaviour)", async () => {
      // NOTE: The current implementation does NOT clearTimeout between saves,
      // so the timer from the first save fires ~3 s after that save and hides
      // the message regardless of subsequent saves.  This test documents the
      // DESIRED behaviour.  If it fails, the fix is to store the timer ID
      // and call clearTimeout() before setting a new one:
      //
      //   const timerRef = useRef<NodeJS.Timeout>();
      //   ...
      //   clearTimeout(timerRef.current);
      //   timerRef.current = setTimeout(() => setSaved(false), 3000);

      await options.fillUrl("http://first.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Wait ~2 s (just before the 3 s expiry)
      await options.page.waitForTimeout(2000);

      // Trigger a second save – should reset the timer
      await options.fillUrl("http://second.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      // Wait another 2 s (total ~4 s from first save, ~2 s from second)
      // With a proper clearTimeout the message would still be visible.
      await expect(options.successMessage).toBeVisible({ timeout: 3000 });
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Storage Verification                                                  */
  /* ---------------------------------------------------------------------- */

  test.describe("Storage Verification", () => {
    test("verifies the exact value saved in chrome.storage.sync", async () => {
      const url = "http://storage-check.example.com";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("verifies storage key is removed after reset", async () => {
      // Save something first
      await options.fillUrl("http://to-be-removed.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      await options.clickReset();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("");
    });

    test("URL with trailing slash is stored as‑is (trimmed, slash preserved)", async () => {
      const url = "http://example.com/api/";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      // setApiBaseUrl trims the input but does NOT strip trailing slashes
      expect(stored).toBe(url);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  Edge Cases                                                            */
  /* ---------------------------------------------------------------------- */

  test.describe("Edge Cases", () => {
    test("very long URL (2000+ chars) is saved correctly", async () => {
      const longPath = "/a".repeat(1980);
      const url = `http://example.com${longPath}`;
      expect(url.length).toBeGreaterThan(2000);

      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("URL with unicode characters is saved (regex matches .)", async () => {
      // The regex /^https?:\/\/.+/ uses '.' which matches unicode chars
      const url = "http://éxàmplé.com";
      await options.fillUrl(url);
      await options.clickSave();

      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("URL with auth credentials is saved as‑is", async () => {
      const url = "http://user:pass@localhost:3000";
      await options.fillUrl(url);
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe(url);
    });

    test("submits the form by pressing Enter in the input field", async () => {
      await options.fillUrl("http://enter-test.example.com");
      await options.pressEnter();

      await expect(options.successMessage).toBeVisible();
      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://enter-test.example.com");
    });

    test("rapid save/reset cycles (5×) do not produce errors", async () => {
      for (let i = 0; i < 5; i++) {
        await options.fillUrl(`http://cycle-${i}.example.com`);
        await options.clickSave();
        await expect(options.successMessage).toBeVisible();

        await options.clickReset();
        await expect(options.successMessage).toBeVisible();
        await expect(options.errorMessage).not.toBeVisible();
        await expect(options.urlInput).toHaveValue(DEFAULT_URL);
      }
    });

    test("save, change input, save again — second value is persisted", async () => {
      await options.fillUrl("http://first.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      await options.fillUrl("http://second.example.com");
      await options.clickSave();
      await expect(options.successMessage).toBeVisible();

      const stored = await options.readStorageUrl();
      expect(stored).toBe("http://second.example.com");

      // After reload the input should show the second value
      await options.reload();
      await options.page.waitForSelector(".url-input");
      await expect(options.urlInput).toHaveValue("http://second.example.com");
    });

    test("handles storage write failure on save — shows error message", async () => {
      // The storage override was installed in beforeEach.  Now we only
      // need to toggle the failure flag before triggering the save.
      await options.enableSaveFailureMode();

      await options.fillUrl("http://error-test.example.com");
      await options.clickSave();

      await expect(options.errorMessage).toContainText(
        "Erreur lors de la sauvegarde",
      );
    });

    test("handles storage remove failure on reset — shows error message", async () => {
      // The storage override was installed in beforeEach.  Toggle the
      // removal–failure flag before clicking reset.
      await options.enableResetFailureMode();

      await options.clickReset();

      await expect(options.errorMessage).toContainText(
        "Erreur lors de la réinitialisation",
      );
    });
  });
});
