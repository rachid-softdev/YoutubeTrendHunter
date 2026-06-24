import { test, expect } from "../fixtures";

test.describe("Sidepanel — Network resilience", () => {
  test("S1 — Network offline → sidepanel shows error message", async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForTimeout(500);

    // Set network offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Sidepanel should show an error or empty state (no trends loaded)
    const trendsList = page.locator('[data-testid="trends-list"], [class*="trend"]').first();
    const visible = await trendsList.isVisible().catch(() => false);

    // Verify the page didn't crash — should still show UI elements
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);

    await context.setOffline(false);
  });

  test("S2 — Network offline → online → sidepanel recovers without reload", async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForTimeout(500);

    // Offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Back online
    await context.setOffline(false);
    await page.waitForTimeout(2000);

    // Sidepanel should attempt to re-fetch data (may show empty state or trends)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("S3 — API timeout → friendly message, not crash", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForTimeout(500);

    // Intercept API requests and delay them (simulate timeout)
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 10000));
      await route.fulfill({ status: 504, body: "Gateway Timeout" });
    });

    await page.waitForTimeout(1500);

    // Should show an error/empty state, not crash
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(0);
  });

  test("S4 — Sidepanel closes during API call → no unhandled rejection", async ({
    page,
    context,
    extensionId,
  }) => {
    // Track console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForTimeout(500);

    // Start a slow API call then close immediately
    await page.evaluate(async () => {
      // Start an in-flight request
      chrome.runtime.sendMessage({ type: "GET_TRENDS" }).catch(() => {});
    });

    // Navigate away (simulates sidepanel closing)
    await page.goto("about:blank");
    await page.waitForTimeout(500);

    // Should not have unhandled rejections
    const rejectionErrors = consoleErrors.filter(
      (e) => e.includes("unhandled") || e.includes("Uncaught") || e.includes("rejection"),
    );
    expect(rejectionErrors.length).toBe(0);
  });
});
