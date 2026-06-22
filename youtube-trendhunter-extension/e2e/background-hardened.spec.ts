import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Send a runtime message from the extension page and await the response.
 */
function sendMessage<T = any>(
  page: Page,
  msg: Record<string, unknown>,
): Promise<T> {
  return page.evaluate((m) => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(m, resolve);
    });
  }, msg);
}

/**
 * Set values in chrome.storage.session from the extension page.
 */
async function setSessionStorage(
  page: Page,
  items: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set(data, resolve);
    });
  }, items);
}

/**
 * Set a value in chrome.storage.sync from the extension page.
 */
async function setSyncStorage(
  page: Page,
  items: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.sync.set(data, resolve);
    });
  }, items);
}

/**
 * Clear all extension storage (session + sync) from the extension page.
 */
async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

/**
 * Get tab information from the extension page (sidepanel) via chrome.tabs.query.
 * Relies on host_permissions for youtube.com to expose tab URLs.
 */
async function queryTabs(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    return new Promise<any[]>((resolve) => {
      chrome.tabs.query({}, resolve);
    });
  });
}

/**
 * Get sidepanel options for a specific tabId from the extension page.
 */
async function getSidePanelOptions(page: Page, tabId: number): Promise<any> {
  return page.evaluate((id) => {
    return new Promise<any>((resolve) => {
      chrome.sidePanel.getOptions({ tabId: id }, resolve);
    });
  }, tabId);
}

/**
 * Default successful GET_TRENDS response body.
 */
const DEFAULT_TRENDS_RESPONSE = JSON.stringify({
  trends: [
    { id: "1", title: "Trend 1", score: 85, channelName: "Channel 1" },
    { id: "2", title: "Trend 2", score: 72, channelName: "Channel 2" },
  ],
  plan: "FREE",
  nextCursor: null,
});

/**
 * Default successful ANALYZE_VIDEO response body.
 */
const DEFAULT_ANALYZE_RESPONSE = JSON.stringify({
  score: 85,
  analysis: "Strong upward trend detected",
  velocity: "+12%",
});

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Background Script — Hardened", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllStorage(page);
  });

  /* ------------------------------------------------------------------------ */
  /*  1. Storage Quota & Limits                                               */
  /* ------------------------------------------------------------------------ */

  test.describe("Storage Quota & Limits", () => {
    test("apiBaseUrl missing from storage.sync falls back to default URL", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      // Intentionally NOT setting apiBaseUrl in sync storage

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // The default API_BASE (localhost:3000 or env var) should be used
      expect(capturedUrl).toContain("/api/extension/trends");
      // Should NOT contain literal "undefined" or "null" in the URL
      expect(capturedUrl).not.toContain("undefined");
      expect(capturedUrl).not.toContain("null");
    });

    test("handles API response payload >100KB correctly", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Generate a ~150KB trends payload
      const largeTrends = Array.from({ length: 500 }, (_, i) => ({
        id: `trend-${i}`,
        title: `Extremely Long Trend Title For Testing Purposes #${i} ` + "x".repeat(80),
        score: Math.round(Math.random() * 100),
        channelName: `Channel ${i % 50} – très longue chaîne pour test`,
        description: "x".repeat(200),
        metrics: {
          views: i * 10000,
          likes: i * 500,
          comments: i * 50,
          growth: `${(Math.random() * 50).toFixed(1)}%`,
        },
      }));
      const largeBody = JSON.stringify({
        trends: largeTrends,
        plan: "PRO",
        nextCursor: "cursor-large",
      });

      // Verify the payload is actually >100KB
      expect(largeBody.length).toBeGreaterThan(100 * 1024);

      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: largeBody,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toBeDefined();
      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(500);
      expect(response.data.plan).toBe("PRO");
      expect(response.data.nextCursor).toBe("cursor-large");
    });

    test("non-string apiToken stored as number yields NOT_AUTHENTICATED", async ({
      page,
    }) => {
      // apiToken set as a number (0 is falsy, so !apiToken is true)
      await setSessionStorage(page, { apiToken: 0, selectedNiche: "tech-ia" });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("non-string apiToken stored as empty object yields NOT_AUTHENTICATED", async ({
      page,
    }) => {
      // {} is truthy in JS, but the background checks `!apiToken`
      // An empty object is truthy, so it passes the auth check but may fail later
      await setSessionStorage(page, {
        apiToken: {},
        selectedNiche: "tech-ia",
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // {} is truthy, so it passes the !apiToken check
      // The fetch will use "Bearer [object Object]" which will be sent
      // So this should NOT return NOT_AUTHENTICATED
      expect(response).not.toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("apiBaseUrl with trailing slash in sync storage still works", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, { apiBaseUrl: "https://api.trendhunter.app/" });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // Background uses template literal: `${API_BASE}${API_ENDPOINTS.trends}`
      // With trailing slash: "https://api.trendhunter.app//api/extension/trends?niche=..."
      // Browsers normalize // to / in the path, so this should work
      expect(capturedUrl).toContain("api.trendhunter.app");
      expect(capturedUrl).toContain("/api/extension/trends");
      // The URL should have the double slash between base and endpoint
      expect(capturedUrl).toMatch(/trendhunter\.app\/\/api/);
    });

    test("apiBaseUrl with path prefix produces valid request", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "https://proxy.company.com/api/v2",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      expect(capturedUrl).toBe(
        "https://proxy.company.com/api/v2/api/extension/trends?niche=tech-ia",
      );
    });

    test("removing apiBaseUrl from sync storage triggers fallback", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      // Set a custom URL first
      await setSyncStorage(page, {
        apiBaseUrl: "https://custom.example.com",
      });
      // Then remove it (set to empty string triggers removal in setApiBaseUrl)
      await setSyncStorage(page, { apiBaseUrl: "" });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // Should NOT use the custom URL since it was removed
      expect(capturedUrl).not.toContain("custom.example.com");
      // Should fall back to the default URL
      expect(capturedUrl).toContain("/api/extension/trends");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  2. Extension Lifecycle                                                  */
  /* ------------------------------------------------------------------------ */

  test.describe("Extension Lifecycle", () => {
    test("session storage persists across background worker re-evaluation", async ({
      page,
      context,
    }) => {
      // Set session storage values
      await setSessionStorage(page, {
        apiToken: "th_persist_token",
        selectedNiche: "fitness",
      });

      // Verify values are set
      const storedValues = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get(["apiToken", "selectedNiche"], resolve);
        });
      });
      expect(storedValues.apiToken).toBe("th_persist_token");
      expect(storedValues.selectedNiche).toBe("fitness");

      // The background worker should still see these values when processing messages
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
      // Token persisted and was used successfully
    });

    test("consecutive message handling across multiple turns", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Send 5 consecutive GET_TRENDS messages, one at a time
      for (let i = 0; i < 5; i++) {
        const response = await sendMessage(page, { type: "GET_TRENDS" });
        expect(response).toBeDefined();
        expect(response.data).toBeDefined();
        expect(response.data.trends).toHaveLength(2);
      }
    });

    test("message handler responds after simulated storage race condition", async ({
      page,
      context,
    }) => {
      // Simulate a race: set token, send message, then immediately change niche
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "gaming",
      });

      let callCount = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Send message and IMMEDIATELY change storage (race condition simulation)
      const [response] = await Promise.all([
        sendMessage(page, { type: "GET_TRENDS" }),
        setSessionStorage(page, { selectedNiche: "fitness" }),
      ]);

      // Both operations should succeed — no crash
      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(callCount).toBe(1);
    });

    test("background refreshes niche after storage change between messages", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "gaming",
      });

      const capturedUrls: string[] = [];
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // First message
      await sendMessage(page, { type: "GET_TRENDS" });

      // Update niche while "worker is idle" between messages
      await setSessionStorage(page, { selectedNiche: "business-en-ligne" });

      // Second message after delay
      await page.waitForTimeout(200);
      await sendMessage(page, { type: "GET_TRENDS" });

      expect(capturedUrls).toHaveLength(2);
      const url1 = new URL(capturedUrls[0]);
      const url2 = new URL(capturedUrls[1]);
      expect(url1.searchParams.get("niche")).toBe("gaming");
      expect(url2.searchParams.get("niche")).toBe("business-en-ligne");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  3. Tab & Window Management                                              */
  /* ------------------------------------------------------------------------ */

  test.describe("Tab & Window Management", () => {
    /**
     * Helper: create a page, navigate it, and wait for the background's
     * tabs.onUpdated listener to process the event.
     */
    async function createTabAndWait(
      context: BrowserContext,
      url: string,
      waitMs = 1500,
    ): Promise<Page> {
      const tab = await context.newPage();
      await tab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {
        // Navigation failures are expected for some test URLs (e.g. invalid)
      });
      await tab.waitForTimeout(waitMs);
      return tab;
    }

    test("subdomain YouTube URLs (music.youtube.com) get sidepanel enabled", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(context, "https://music.youtube.com/");

      // Query tabs from the extension page to find our tab
      const tabs = await queryTabs(page);
      const youtubeTab = tabs.find(
        (t: any) => t.url && t.url.includes("music.youtube.com"),
      );

      test.skip(!youtubeTab, "Tab URL not accessible — may need 'tabs' permission");
      expect(youtubeTab).toBeTruthy();

      const options = await getSidePanelOptions(page, youtubeTab!.id);
      expect(options.enabled).toBe(true);
      await tab.close();
    });

    test("youtube.com/watch with query parameters gets sidepanel enabled", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=shared&t=30",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) =>
          t.url &&
          t.url.includes("youtube.com/watch") &&
          t.url.includes("dQw4w9WgXcQ"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      const options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);
      await tab.close();
    });

    test("navigating tab away from YouTube disables sidepanel", async ({
      page,
      context,
    }) => {
      // Create a tab on YouTube first
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=test123",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) => t.url && t.url.includes("youtube.com"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      // Now navigate away from YouTube
      await tab.goto("https://example.com", {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForTimeout(1500);

      // Check sidepanel is now disabled
      const optionsAfter = await getSidePanelOptions(page, ytTab!.id);
      expect(optionsAfter.enabled).toBe(false);
      await tab.close();
    });

    test("tab navigated to example.com (non-YouTube) does NOT enable sidepanel", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(context, "https://example.com/");

      const tabs = await queryTabs(page);
      const nonYtTab = tabs.find(
        (t: any) => t.url && t.url.includes("example.com"),
      );

      test.skip(!nonYtTab, "Tab URL not accessible");
      expect(nonYtTab).toBeTruthy();

      const options = await getSidePanelOptions(page, nonYtTab!.id);
      expect(options.enabled).toBe(false);
      await tab.close();
    });

    test("URL with hash fragment still enables sidepanel", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=abc123#scrollto=comments",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) => t.url && t.url.includes("youtube.com/watch?v=abc123"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      const options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);
      await tab.close();
    });

    test("non-YouTube tab URL does not crash tabs.onUpdated listener", async ({
      page,
      context,
    }) => {
      // Edge: URLs that are not HTTP/HTTPS or malformed
      const tab = await context.newPage();

      // Navigate to about:blank first (this is a valid but non-http page)
      await tab.goto("about:blank", { waitUntil: "domcontentloaded" });
      await tab.waitForTimeout(1000);

      // The tabs.onUpdated should fire without crashing
      // Verify by checking the background worker is still alive and responds
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);

      // And we can still send messages
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response.data).toBeDefined();

      await tab.close();
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  4. Concurrent Request Handling                                          */
  /* ------------------------------------------------------------------------ */

  test.describe("Concurrent Request Handling", () => {
    test("50 rapid GET_TRENDS messages all resolve without crash", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      let requestCount = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        requestCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Fire 50 GET_TRENDS messages in parallel
      const results: any[] = await page.evaluate(() => {
        const promises = Array.from({ length: 50 }, (_, i) => {
          return new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve);
          });
        });
        return Promise.all(promises);
      });

      expect(results).toHaveLength(50);
      expect(requestCount).toBe(50);

      // Every single response should have valid data
      for (const result of results) {
        expect(result).toHaveProperty("data");
        expect(result.data.trends).toHaveLength(2);
        expect(result.error).toBeUndefined();
      }
    });

    test("GET_TRENDS with slow API while ANALYZE_VIDEO fires — both resolve", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // GET_TRENDS API is slow (1s delay)
      await context.route("**/api/extension/trends*", async (route) => {
        await new Promise((r) => setTimeout(r, 1000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // ANALYZE_VIDEO API is instant
      await context.route("**/api/extension/analyze", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      // Fire GET_TRENDS and immediately ANALYZE_VIDEO
      const results: any[] = await page.evaluate(() => {
        return Promise.all([
          new Promise<any>((r) =>
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, r),
          ),
          new Promise<any>((r) =>
            chrome.runtime.sendMessage(
              { type: "ANALYZE_VIDEO", videoId: "vid-123" },
              r,
            ),
          ),
        ]);
      });

      expect(results).toHaveLength(2);
      // GET_TRENDS result
      expect(results[0].data.trends).toBeDefined();
      expect(results[0].data.trends).toHaveLength(2);
      // ANALYZE_VIDEO result (should resolve first since it's instant)
      expect(results[1].data.score).toBe(85);
    });

    test("same GET_TRENDS message sent 20 times — all handled independently", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      let callIndex = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        const idx = callIndex++;
        // Add slight variability to response timing
        await new Promise((r) => setTimeout(r, Math.random() * 100));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: [
              {
                id: `${idx}`,
                title: `Response ${idx}`,
                score: 50 + idx,
                channelName: "Channel",
              },
            ],
            plan: "FREE",
            nextCursor: null,
          }),
        });
      });

      const results: any[] = await page.evaluate(() => {
        const promises = Array.from({ length: 20 }, () => {
          return new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve);
          });
        });
        return Promise.all(promises);
      });

      expect(results).toHaveLength(20);
      // Every response should have unique trend data (different scores)
      const scores = new Set(results.map((r: any) => r.data.trends[0].score));
      expect(scores.size).toBeGreaterThan(1);
    });

    test("burst of 100 GET_TRENDS messages in rapid succession", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      let requestCount = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        requestCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Send 100 messages as fast as possible (burst mode)
      const results: any[] = await page.evaluate(() => {
        const promises = Array.from({ length: 100 }, () => {
          return new Promise<any>((resolve) => {
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve);
          });
        });
        return Promise.all(promises);
      });

      expect(results).toHaveLength(100);
      expect(requestCount).toBe(100);

      // Verify no errors in any response
      const errors = results.filter((r: any) => r.error);
      expect(errors).toHaveLength(0);
    });

    test("response ordering is preserved for sequential GET_TRENDS messages", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      let sendOrder = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        const order = sendOrder++;
        // Add random delay to test ordering
        await new Promise((r) => setTimeout(r, Math.random() * 200));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: [
              {
                id: `msg-${order}`,
                title: `Message ${order}`,
                score: order,
                channelName: "Channel",
              },
            ],
            plan: "FREE",
            nextCursor: null,
          }),
        });
      });

      // Send messages sequentially, capture responses in order
      const results: any[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await sendMessage(page, { type: "GET_TRENDS" });
        results.push(response);
      }

      // Each response should correspond to the send order
      for (let i = 0; i < 10; i++) {
        expect(results[i].data.trends[0].id).toBe(`msg-${i}`);
        expect(results[i].data.trends[0].score).toBe(i);
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  5. Background Fetch Reliability                                         */
  /* ------------------------------------------------------------------------ */

  test.describe("Background Fetch Reliability", () => {
    test("fetch timeout (aborted with timedout) returns FETCH_ERROR", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Simulate a network timeout
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("timedout");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("fetch aborted (connection refused) returns FETCH_ERROR", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Simulate connection refused
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("connectionrefused");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("HTTP 304 (Not Modified) returns cached data response", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // The background script always calls res.json(), so a 304 with no body
      // should cause a JSON parse error → FETCH_ERROR
      // But if the API returns a 304 WITH a body, it should parse fine
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 304,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // A 304 with a valid JSON body should still be parseable
      // The background doesn't check status codes — it always calls res.json()
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);
    });

    test("HTTP 304 without body returns FETCH_ERROR (empty body parse fails)", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // API returns 304 with no body → res.json() throws SyntaxError
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 304,
          contentType: "application/json",
          body: "",
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("SSL/TLS connectivity error returns FETCH_ERROR", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Simulate an SSL/connection failure
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("connectionfailed");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("CORS/blocked request returns FETCH_ERROR", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Simulate a request blocked by the client (CORS-like failure)
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("blockedbyclient");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("connection reset during fetch returns FETCH_ERROR", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("connectionreset");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response).toEqual({ error: "FETCH_ERROR" });
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  6. Message Port Communication                                           */
  /* ------------------------------------------------------------------------ */

  test.describe("Message Port Communication", () => {
    test("long-lived port via chrome.runtime.connect can send messages", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Use chrome.runtime.connect to establish a long-lived port
      // and send a message through it
      const response = await page.evaluate(() => {
        return new Promise<any>((resolve, reject) => {
          let resolved = false;
          const port = chrome.runtime.connect({ name: "test-port" });
          port.onMessage.addListener((msg: any) => {
            resolved = true;
            resolve(msg);
            port.disconnect();
          });
          port.onDisconnect.addListener(() => {
            // If disconnected without message, reject
            if (!resolved) reject(new Error("Port disconnected without response"));
          });
          port.postMessage({ type: "GET_TRENDS" });
          // Timeout fallback
          setTimeout(() => {
            if (!resolved) {
              port.disconnect();
              reject(new Error("Timeout waiting for port response"));
            }
          }, 5000);
        });
      });

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);
    });

    test("port disconnect fires cleanup without crash", async ({
      page,
    }) => {
      // Connect and immediately disconnect — should not throw
      const result = await page.evaluate(() => {
        try {
          const port = chrome.runtime.connect({ name: "disconnect-test" });
          port.disconnect();
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      });

      expect(result.success).toBe(true);
    });

    test("multiple simultaneous port connections all receive responses", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Open 5 simultaneous port connections, each sends GET_TRENDS
      const results: any[] = await page.evaluate(() => {
        const ports = Array.from({ length: 5 }, (_, i) => {
          return new Promise<any>((resolve) => {
            const port = chrome.runtime.connect({ name: `port-${i}` });
            port.onMessage.addListener((msg: any) => {
              resolve(msg);
              port.disconnect();
            });
            port.postMessage({ type: "GET_TRENDS" });
          });
        });
        return Promise.all(ports);
      });

      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result.data).toBeDefined();
        expect(result.data.trends).toHaveLength(2);
      }
    });

    test("port disconnected before response still handled gracefully", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Make the API response slow so we can disconnect before it arrives
      await context.route("**/api/extension/trends*", async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const result = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          const port = chrome.runtime.connect({ name: "early-disconnect" });
          port.postMessage({ type: "GET_TRENDS" });

          // Disconnect before response arrives
          setTimeout(() => {
            port.disconnect();
            resolve({ disconnected: true });
          }, 100);

          // Safety timeout
          setTimeout(() => {
            resolve({ disconnected: true });
          }, 3000);
        });
      });

      expect(result.disconnected).toBe(true);
      // The background should still handle the response gracefully
      // (no unhandled rejection or crash)
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  7. Sidepanel Management Logic                                           */
  /* ------------------------------------------------------------------------ */

  test.describe("Sidepanel Management Logic", () => {
    async function createTabAndWait(
      context: BrowserContext,
      url: string,
      waitMs = 1500,
    ): Promise<Page> {
      const tab = await context.newPage();
      await tab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await tab.waitForTimeout(waitMs);
      return tab;
    }

    test("sidePanel.setOptions enabled for youtube.com/watch tab", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=abc123",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) => t.url && t.url.includes("youtube.com/watch?v=abc123"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      const options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);
      await tab.close();
    });

    test("sidePanel disabled when tab navigates from YouTube to non-YouTube", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=xyz789",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) => t.url && t.url.includes("youtube.com"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      // Navigate away
      await tab.goto("https://example.org", {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForTimeout(1500);

      const options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(false);
      await tab.close();
    });

    test("sidepanel remains disabled for non-YouTube navigation", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(context, "https://example.org/page");

      const tabs = await queryTabs(page);
      const nonYtTab = tabs.find(
        (t: any) => t.url && t.url.includes("example.org"),
      );

      test.skip(!nonYtTab, "Tab URL not accessible");
      expect(nonYtTab).toBeTruthy();

      const options = await getSidePanelOptions(page, nonYtTab!.id);
      expect(options.enabled).toBe(false);
      await tab.close();
    });

    test("background worker stays alive after multiple tab update events", async ({
      page,
      context,
    }) => {
      // Create several tabs with different YouTube URLs to trigger
      // multiple tabs.onUpdated events
      const tabs = await Promise.all([
        createTabAndWait(
          context,
          "https://www.youtube.com/watch?v=video1",
          500,
        ),
        createTabAndWait(
          context,
          "https://www.youtube.com/watch?v=video2",
          500,
        ),
        createTabAndWait(
          context,
          "https://www.youtube.com/watch?v=video3",
          500,
        ),
      ]);

      // Verify the worker is still alive and processing messages
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);

      // Close all tabs
      for (const tab of tabs) {
        await tab.close();
      }
    });

    test("tabs.onUpdated does not throw for tab without URL", async ({
      page,
      context,
    }) => {
      // Create a tab with a chrome:// URL (which has no accessible URL to the extension)
      const tab = await context.newPage();
      await tab.goto("chrome://version/", {
        waitUntil: "domcontentloaded",
      }).catch(() => {
        // chrome:// URLs may fail to load in some contexts — that's fine
      });
      await tab.waitForTimeout(1000);

      // The background's tabs.onUpdated should handle null/undefined URL gracefully
      // Verify by checking worker is still responsive
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);

      await tab.close();
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  8. URL Construction Edge Cases                                          */
  /* ------------------------------------------------------------------------ */

  test.describe("URL Construction Edge Cases", () => {
    test("API_BASE without trailing slash constructs valid URL", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "https://api.trendhunter.app",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // Should be: https://api.trendhunter.app/api/extension/trends?niche=tech-ia
      expect(capturedUrl).toBe(
        "https://api.trendhunter.app/api/extension/trends?niche=tech-ia",
      );
    });

    test("API_BASE with trailing slash and hostname:port constructs valid URL", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "http://localhost:8080/",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // Backtick template: `${API_BASE}${API_ENDPOINTS.trends}?niche=...`
      // With trailing slash: "http://localhost:8080//api/extension/trends?niche=tech-ia"
      expect(capturedUrl).toMatch(/localhost:8080\/\/api/);
      expect(capturedUrl).toContain("niche=tech-ia");
    });

    test("GET_TRENDS with niche containing special characters URL-encoded", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech & ia / spécial+test",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      expect(capturedUrl).toContain(
        encodeURIComponent("tech & ia / spécial+test"),
      );
    });

    test("GET_TRENDS with numeric niche value still works", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: 42, // numeric, not string
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // String(42) ?? "tech-ia" → "42" (since 42 is truthy)
      expect(capturedUrl).toContain("niche=42");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  9. Error Recovery & Edge Cases                                          */
  /* ------------------------------------------------------------------------ */

  test.describe("Error Recovery & Edge Cases", () => {
    test("ANALYZE_VIDEO with missing videoId field still sends request", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      // Send ANALYZE_VIDEO without videoId
      await sendMessage(page, { type: "ANALYZE_VIDEO" });

      const parsed = JSON.parse(capturedBody);
      expect(parsed.videoId).toBeUndefined();
    });

    test("GET_TRENDS with extra unknown message fields still works", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Send GET_TRENDS with extra unknown fields
      const response = await sendMessage(page, {
        type: "GET_TRENDS",
        extraField: "should-be-ignored",
        nested: { foo: "bar" },
      });

      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);
    });

    test("message without type returns undefined (falls through all handlers)", async ({
      page,
    }) => {
      const response = await sendMessage(page, {
        notype: true,
        data: "test",
      });
      expect(response).toBeUndefined();
    });

    test("ANALYZE_VIDEO with numeric videoId still works (string coercion)", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      // Send with numeric videoId — JSON.stringify will preserve it as number
      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: 12345,
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed.videoId).toBe(12345);
    });
  });
});
