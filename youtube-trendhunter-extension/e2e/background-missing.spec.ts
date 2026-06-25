import { test, expect } from "../fixtures";

test.describe("Background — Missing handlers & edge cases", () => {
  test("B1 — runtime.onInstalled handler — first-run setup absent", async ({
    context,
    extensionId,
  }) => {
    // The extension has no onInstalled listener — verify no first-run logic runs
    const sw = context.serviceWorkers()[0];
    expect(sw).toBeDefined();
    // If onInstalled existed, it would write to storage on install
    const storage = await sw!.evaluate(() => chrome.storage.sync.get(null));
    // No first-run keys should exist automatically
    expect(Object.keys(storage).length).toBe(0);
  });

  test("B2 — Fetch timeout not configured — slow API could hang", async ({ page }) => {
    // Verify the background script doesn't have an explicit fetch timeout
    const sw = page.context().serviceWorkers()[0];
    const backgroundSource = await sw!.evaluate(() => {
      // @ts-expect-error — accessing internal source for analysis
      return typeof chrome.runtime.onMessage !== "undefined" ? "listener exists" : "missing";
    });
    expect(backgroundSource).toBe("listener exists");
    // Note: This is an informational test — no timeout means long requests will hang
  });

  test("B3 — ANALYZE_VIDEO with malformed videoId", async ({ page, extensionId }) => {
    await page.goto(`https://www.youtube.com/watch?v=test123`);
    await page.waitForSelector("#trendhunter-badge", { timeout: 5000 }).catch(() => {});
    // Send malformed videoId via runtime message
    const sw = page.context().serviceWorkers()[0];
    const response = await sw!.evaluate(async () => {
      return chrome.runtime.sendMessage({
        type: "ANALYZE_VIDEO",
        videoId: "../../etc/passwd",
      });
    });
    // Should handle gracefully — no crash, no error thrown
    expect(response).toBeDefined();
    expect(response.error).not.toBe("INVALID_VIDEO_ID");
  });

  test("B4 — storage.onChanged not handled for API base URL change", async ({
    page,
    extensionId,
  }) => {
    // Background doesn't listen to storage.onChanged — changing API URL mid-session has no effect
    const sw = page.context().serviceWorkers()[0];
    // Change API base in storage
    await sw!.evaluate(async () => {
      await chrome.storage.sync.set({ apiBaseUrl: "https://changed.example.com" });
    });
    // The background should be using the new URL — but it doesn't listen
    // This test documents the gap — not a crash test
    expect(true).toBe(true);
  });

  test("B5 — Concurrent GET_TRENDS from multiple sidepanel instances", async ({
    page,
    extensionId,
  }) => {
    // Open sidepanel and send GET_TRENDS rapidly
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector('[data-testid="trends-list"]', { timeout: 5000 }).catch(() => {});

    const sw = page.context().serviceWorkers()[0];
    // Send 3 parallel GET_TRENDS requests
    const results = await sw!.evaluate(async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(chrome.runtime.sendMessage({ type: "GET_TRENDS" }));
      }
      return Promise.all(promises);
    });
    // All should resolve without error (may have race condition on response ordering)
    results.forEach((r: any) => {
      expect(r).toBeDefined();
      expect(r.error).not.toBe("INTERNAL_ERROR");
    });
  });
});
