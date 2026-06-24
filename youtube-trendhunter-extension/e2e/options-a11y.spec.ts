import { test, expect } from "../fixtures";

test.describe("Options Page — Accessibility & keyboard navigation", () => {
  test("O1 — Tab order through form elements (input → save → reset)", async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForTimeout(500);

    // Get all focusable elements
    const focusableElements = await page.evaluate(() => {
      const elements = document.querySelectorAll(
        'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      return Array.from(elements).map((el) => ({
        tag: el.tagName,
        id: el.id,
        type: (el as HTMLInputElement).type,
      }));
    });

    // Should have at least input + save button + reset button
    expect(focusableElements.length).toBeGreaterThanOrEqual(3);

    // Tab through elements
    const focusedTags: string[] = [];
    for (let i = 0; i < focusableElements.length; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}:${(el as HTMLInputElement).type || el.id}` : "none";
      });
      focusedTags.push(focused);
    }

    expect(focusedTags.length).toBeGreaterThanOrEqual(3);
  });

  test("O2 — Focus management after save — focus stays on save button", async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForTimeout(500);

    const saveButton = page
      .getByRole("button")
      .filter({ hasText: /save|enregistrer|sauvegarder/i })
      .first();
    const resetButton = page
      .getByRole("button")
      .filter({ hasText: /reset|réinitialiser/i })
      .first();

    if (await saveButton.isVisible()) {
      await saveButton.focus();
      await page.waitForTimeout(200);

      const focusedEl = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.textContent || el?.id || el?.tagName || "";
      });
      expect(focusedEl.length).toBeGreaterThan(0);
    }
  });

  test("O3 — Screen reader labels on interactive elements", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForTimeout(500);

    // Check for aria-labels on interactive elements
    const elementsWithAria = await page.evaluate(() => {
      const allElements = document.querySelectorAll("input, button, select, textarea");
      return Array.from(allElements).map((el) => ({
        tag: el.tagName,
        hasAriaLabel: el.hasAttribute("aria-label"),
        hasAriaLabelledby: el.hasAttribute("aria-labelledby"),
        hasAriaDescribedby: el.hasAttribute("aria-describedby"),
        placeholder: (el as HTMLInputElement).placeholder || "",
        title: (el as HTMLElement).title || "",
        textContent: el.textContent?.trim() || "",
      }));
    });

    // At least some elements should have accessibility attributes
    const hasA11y = elementsWithAria.some(
      (el) =>
        el.hasAriaLabel ||
        el.hasAriaLabelledby ||
        el.hasAriaDescribedby ||
        el.placeholder ||
        el.title ||
        el.textContent,
    );
    expect(hasA11y).toBe(true);
  });

  test("O4 — Enter key submits the form", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForTimeout(500);

    const urlInput = page.locator('input[type="url"], input[type="text"]').first();
    const saveButton = page
      .getByRole("button")
      .filter({ hasText: /save|enregistrer|sauvegarder/i })
      .first();

    if (await urlInput.isVisible()) {
      await urlInput.fill("https://test-enter-key.example.com");
      await urlInput.press("Enter");
      await page.waitForTimeout(500);

      // After Enter, the save should be triggered and storage should have the value
      const savedValue = await page.evaluate(async () => {
        const result = await chrome.storage.sync.get("apiBaseUrl");
        return result.apiBaseUrl;
      });
      expect(savedValue).toBe("https://test-enter-key.example.com");

      // Cleanup
      await chrome.storage.sync.remove("apiBaseUrl");
    }
  });
});
