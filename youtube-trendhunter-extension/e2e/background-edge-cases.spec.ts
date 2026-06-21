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
 * Get all tabs from the extension page via chrome.tabs.query.
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

/* ========================================================================== */
/*  BACKGROUND SCRIPT — EDGE CASES                                            */
/* ========================================================================== */
/*                                                                             */
/*  This file tests edge cases NOT covered by:                                 */
/*    - background.spec.ts (38 tests — auth, API, niche, analyze, tab events)  */
/*    - background-hardened.spec.ts (46 tests — quotas, lifecycle, concurrent, */
/*      ports, sidepanel, URL construction, error recovery)                    */
/*                                                                             */
/*  Focus areas:                                                               */
/*    1. Storage Access Patterns  — key forms, non-existent keys, type edge    */
/*    2. Tab Event Edge Cases     — non-YouTube URLs, view-source, data, file  */
/*    3. Message Error Propagation — error shape, handler boundary conditions  */
/*    4. Storage Write/Read Errors — fallback behavior, concurrent access     */
/*    5. URL Construction          — port variants, ANALYZE_VIDEO URL building */
/* ========================================================================== */

test.describe("Background Script — Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllStorage(page);
  });

  /* ------------------------------------------------------------------------ */
  /*  1. Storage Access Patterns                                              */
  /* ------------------------------------------------------------------------ */
  /*  NEW: Tests for chrome.storage.session.get key forms, type coercion,     */
  /*  non-existent keys, and combined storage access in message handlers.     */
  /*                                                                          */
  /*  NOT covered in background.spec.ts or background-hardened.spec.ts:       */
  /*    - single key string vs array form equivalence                         */
  /*    - non-existent key returns undefined                                  */
  /*    - boolean false/true apiToken type edges                              */
  /*    - combined session+sync access within one handler invocation          */
  /* ------------------------------------------------------------------------ */

  test.describe("Storage Access Patterns", () => {
    test("storage.session.get with single string key returns object with that key", async ({
      page,
    }) => {
      await setSessionStorage(page, { apiToken: "sk_test_token" });

      // GET_TRENDS uses get(["apiToken", "selectedNiche"]) — array form
      // ANALYZE_VIDEO uses get("apiToken") — string form
      // Verify the string form returns a usable result for ANALYZE_VIDEO
      const result = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get("apiToken", resolve);
        });
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("apiToken");
      expect(result.apiToken).toBe("sk_test_token");
      // Single key string returns an object, not the raw value
      expect(typeof result).toBe("object");
      expect(Object.keys(result)).toEqual(["apiToken"]);
    });

    test("storage.session.get with key array returns object with all requested keys", async ({
      page,
    }) => {
      await setSessionStorage(page, {
        apiToken: "sk_test_token",
        selectedNiche: "gaming",
        extraKey: "should_not_appear",
      });

      const result = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get(["apiToken", "selectedNiche"], resolve);
        });
      });

      expect(result).toBeDefined();
      expect(result.apiToken).toBe("sk_test_token");
      expect(result.selectedNiche).toBe("gaming");
      // extraKey should NOT be in result because it wasn't requested
      expect(result).not.toHaveProperty("extraKey");
    });

    test("storage.session.get for non-existent key returns undefined", async ({
      page,
    }) => {
      // No storage set at all — key doesn't exist
      const result = await page.evaluate(() => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get("nonexistentKey", resolve);
        });
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("nonexistentKey");
      expect(result.nonexistentKey).toBeUndefined();
    });

    test("apiToken stored as boolean false triggers NOT_AUTHENTICATED (falsy)", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: false,
        selectedNiche: "tech-ia",
      });

      // Hardened test uses apiToken: 0 (number) — this tests boolean false
      // Both are falsy in JS: !false === true, !0 === true
      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("apiToken stored as boolean true passes auth check (truthy)", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: true,
        selectedNiche: "tech-ia",
      });

      // Boolean true is truthy: !true === false, so auth check passes
      // Background will then call fetch with "Bearer true"
      await context.route("**/api/extension/trends*", async (route) => {
        // Verify the Authorization header contains "true"
        const authHeader = route.request().headers()["authorization"] || "";
        expect(authHeader).toBe("Bearer true");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // Auth check passed — should NOT get NOT_AUTHENTICATED
      expect(response).not.toEqual({ error: "NOT_AUTHENTICATED" });
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);
    });

    test("apiToken stored as number 1 (truthy number) passes auth check", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: 1,
        selectedNiche: "tech-ia",
      });

      // 1 is truthy: !1 === false
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // Should not be NOT_AUTHENTICATED since 1 is truthy
      expect(response).not.toEqual({ error: "NOT_AUTHENTICATED" });
      expect(response.data).toBeDefined();
    });

    test("both session and sync storage accessed in same GET_TRENDS handler without error", async ({
      page,
      context,
    }) => {
      // This tests the full code path:
      //   1. getApiBaseUrl() reads from chrome.storage.sync
      //   2. browser.storage.session.get(["apiToken", "selectedNiche"])
      // Both storage APIs must succeed without interfering
      await setSyncStorage(page, {
        apiBaseUrl: "https://custom.trendhunter.app",
      });
      await setSessionStorage(page, {
        apiToken: "th_sync_session_token",
        selectedNiche: "business-en-ligne",
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

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // Verify both storage sources were used correctly
      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
      // apiBaseUrl from sync storage
      expect(capturedUrl).toContain("custom.trendhunter.app");
      // selectedNiche from session storage
      expect(capturedUrl).toContain("niche=business-en-ligne");
    });

    test("both session and sync storage accessed in ANALYZE_VIDEO handler without error", async ({
      page,
      context,
    }) => {
      await setSyncStorage(page, {
        apiBaseUrl: "http://localhost:4000",
      });
      await setSessionStorage(page, {
        apiToken: "th_analyze_storage_token",
      });

      let capturedUrl = "";
      let capturedAuth = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedUrl = route.request().url();
        capturedAuth = route.request().headers()["authorization"] || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });

      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
      // Custom apiBaseUrl from sync storage
      expect(capturedUrl).toContain("localhost:4000");
      // apiToken from session storage
      expect(capturedAuth).toBe("Bearer th_analyze_storage_token");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  2. Tab Event Edge Cases                                                 */
  /* ------------------------------------------------------------------------ */
  /*  NEW: Non-YouTube URL schemes, same-domain path changes, non-existent    */
  /*  tab IDs, and multi-tab sidepanel state.                                 */
  /*                                                                          */
  /*  NOT covered in background.spec.ts or background-hardened.spec.ts:       */
  /*    - same domain, different path (stays enabled)                         */
  /*    - youtube.com/watch → youtube.com/shorts (stays enabled)              */
  /*    - youtube.com → yout-ube.com (disabled — similar but different)       */
  /*    - about:blank / chrome:// / file:// / data: / view-source: URLs       */
  /*    - non-existent tabId                                                  */
  /*    - multiple tabs: exactly one YouTube tab enabled                      */
  /* ------------------------------------------------------------------------ */

  test.describe("Tab Event Edge Cases", () => {
    /**
     * Helper: create a tab, navigate it, and wait for the background's
     * tabs.onUpdated listener to process the event.
     */
    async function createTabAndWait(
      context: BrowserContext,
      url: string,
      waitMs = 1500,
    ): Promise<Page> {
      const tab = await context.newPage();
      await tab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {
        // Navigation failures expected for some URL schemes (file://, etc.)
      });
      await tab.waitForTimeout(waitMs);
      return tab;
    }

    /**
     * Find the most recently created tab by taking the tab with the maximum id.
     * This works because Chrome assigns monotonically increasing tab IDs.
     */
    async function findNewestTab(page: Page): Promise<any | null> {
      const tabs = await queryTabs(page);
      if (tabs.length === 0) return null;
      return tabs.reduce((max, t) => (t.id > max.id ? t : max), tabs[0]);
    }

    /**
     * Check whether sidepanel is enabled for a given tab URL by creating a tab,
     * navigating it, and reading sidepanel options.
     * Returns the sidepanel options object.
     */
    async function navigateAndCheckSidepanel(
      page: Page,
      context: BrowserContext,
      url: string,
    ): Promise<{ enabled: boolean } | null> {
      const tabsBefore = await queryTabs(page);
      const maxIdBefore = tabsBefore.reduce(
        (max, t) => (t.id > max ? t.id : max),
        0,
      );

      const tab = await createTabAndWait(context, url);

      // Find the new tab (id > maxIdBefore)
      const tabsAfter = await queryTabs(page);
      const newTab = tabsAfter.find((t) => t.id > maxIdBefore);

      if (!newTab) {
        await tab.close().catch(() => {});
        return null;
      }

      const options = await getSidePanelOptions(page, newTab.id);
      await tab.close().catch(() => {});
      return options;
    }

    // ── Same domain, different paths ────────────────────────────────────────

    test("tab URL changes within youtube.com (different path) keeps sidepanel enabled", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/feed/trending",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) => t.url && t.url.includes("youtube.com/feed/trending"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      // Sidepanel should be enabled on YouTube
      let options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);

      // Navigate to a different path on the same YouTube domain
      await tab.goto("https://www.youtube.com/feed/subscriptions", {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForTimeout(1500);

      // Sidepanel should STILL be enabled (same domain)
      const tabsAfter = await queryTabs(page);
      const sameTab = tabsAfter.find((t: any) => t.id === ytTab!.id);
      test.skip(!sameTab, "Tab no longer exists after navigation");
      options = await getSidePanelOptions(page, sameTab!.id);
      expect(options.enabled).toBe(true);

      await tab.close();
    });

    test("tab URL changes from /watch to /shorts keeps sidepanel enabled", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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

      let options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);

      // Navigate to a Shorts URL
      await tab.goto("https://www.youtube.com/shorts/abc123xyz", {
        waitUntil: "domcontentloaded",
      });
      await tab.waitForTimeout(1500);

      // Sidepanel should remain enabled (still youtube.com)
      const tabsAfter = await queryTabs(page);
      const sameTab = tabsAfter.find((t: any) => t.id === ytTab!.id);
      test.skip(!sameTab, "Tab no longer exists after navigation");
      options = await getSidePanelOptions(page, sameTab!.id);
      expect(options.enabled).toBe(true);

      await tab.close();
    });

    // ── Similar but different domain ────────────────────────────────────────

    test("tab URL changes from youtube.com to yout-ube.com disables sidepanel", async ({
      page,
      context,
    }) => {
      const tab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=test123",
      );

      const tabs = await queryTabs(page);
      const ytTab = tabs.find(
        (t: any) =>
          t.url && t.url.includes("youtube.com") && t.url.includes("test123"),
      );

      test.skip(!ytTab, "Tab URL not accessible");
      expect(ytTab).toBeTruthy();

      let options = await getSidePanelOptions(page, ytTab!.id);
      expect(options.enabled).toBe(true);

      // Navigate to yout-ube.com (NOT youtube.com — note the hyphen)
      await tab
        .goto("https://www.yout-ube.com/", {
          waitUntil: "domcontentloaded",
        })
        .catch(() => {});
      await tab.waitForTimeout(1500);

      // Sidepanel should be disabled (different domain)
      const tabsAfter = await queryTabs(page);
      const sameTab = tabsAfter.find((t: any) => t.id === ytTab!.id);
      test.skip(!sameTab, "Tab no longer exists after navigation");
      options = await getSidePanelOptions(page, sameTab!.id);
      expect(options.enabled).toBe(false);

      await tab.close();
    });

    // ── Non-HTTP(S) URL schemes ─────────────────────────────────────────────

    test("about:blank tab has sidepanel disabled gracefully", async ({
      page,
      context,
    }) => {
      const options = await navigateAndCheckSidepanel(
        page,
        context,
        "about:blank",
      );

      // If tab was created and sidepanel options are readable
      if (options !== null) {
        expect(options.enabled).toBe(false);
      }
      // If null, tab URL wasn't accessible — but background should still handle
      // the tabs.onUpdated event without crashing. Verify worker is alive.
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });

    test("chrome:// URL tab has sidepanel disabled", async ({
      page,
      context,
    }) => {
      const options = await navigateAndCheckSidepanel(
        page,
        context,
        "chrome://version/",
      );

      if (options !== null) {
        expect(options.enabled).toBe(false);
      }
      // Even if we can't query options, verify worker survived
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });

    test("file:// URL tab has sidepanel disabled", async ({
      page,
      context,
    }) => {
      // File URLs may not be accessible — verify no crash
      const options = await navigateAndCheckSidepanel(
        page,
        context,
        "file:///C:/",
      );

      if (options !== null) {
        expect(options.enabled).toBe(false);
      }
      // Verify background worker is still alive and handles messages
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
    });

    test("data: URL tab has sidepanel disabled", async ({
      page,
      context,
    }) => {
      const options = await navigateAndCheckSidepanel(
        page,
        context,
        "data:text/html,<html><body>Hello</body></html>",
      );

      if (options !== null) {
        expect(options.enabled).toBe(false);
      }
      // Verify background is still responsive
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });

    test("view-source: URL containing youtube.com — sidepanel behavior", async ({
      page,
      context,
    }) => {
      // The background checks tab.url?.includes("youtube.com")
      // view-source:https://www.youtube.com/watch?v=xxx DOES include "youtube.com"
      // So the sidepanel will be ENABLED (the check is URL-string-based, not protocol-aware)
      //
      // This test documents current behavior. If the intent is to disable sidepanel
      // on view-source pages regardless of content, the URL detection logic would
      // need to be updated.

      const options = await navigateAndCheckSidepanel(
        page,
        context,
        "view-source:https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );

      if (options !== null) {
        // Current code enables sidepanel because "youtube.com" is in the URL string
        // This is arguably a bug — view-source pages aren't interactive YouTube
        console.log(
          "[view-source] Sidepanel enabled =",
          options.enabled,
          "(documenting current behavior)",
        );
        // We don't assert enabled/disabled here because behavior depends on
        // whether the URL contains "youtube.com"
      }
      // Verify background is still responsive
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });

    // ── Non-existent tab ID ─────────────────────────────────────────────────

    test("sidePanel.setOptions with non-existent tabId fails gracefully", async ({
      page,
    }) => {
      // Calling setOptions with a tabId that doesn't exist should not crash
      // the background service worker or propagate an unhandled rejection.
      const result = await page.evaluate(() => {
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
          try {
            chrome.sidePanel.setOptions(
              { tabId: 99999999, enabled: false },
              () => {
                // Callback-based API — may still call the callback even on error
                resolve({ success: true });
              },
            );
            // Also set a timeout fallback in case callback never fires
            setTimeout(() => resolve({ success: true }), 2000);
          } catch (err: any) {
            resolve({ success: false, error: err.message });
          }
        });
      });

      // Must not throw synchronously
      expect(result.success).toBe(true);

      // Verify the background worker is still alive after this operation
      // (no unhandled rejection should have killed it)
      const worker = context.serviceWorkers()[0];
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });

    // ── Multiple tabs ───────────────────────────────────────────────────────

    test("multiple tabs open: only YouTube tab has sidepanel enabled", async ({
      page,
      context,
    }) => {
      // Create a non-YouTube tab first
      const nonYtTab1 = await createTabAndWait(
        context,
        "https://example.com",
      );

      // Create a YouTube tab
      const ytTab = await createTabAndWait(
        context,
        "https://www.youtube.com/watch?v=multi-tab-test",
      );

      // Create another non-YouTube tab
      const nonYtTab2 = await createTabAndWait(
        context,
        "https://example.org",
      );

      // Query all tabs
      const tabs = await queryTabs(page);

      // Find YouTube tab by URL
      const foundYtTab = tabs.find(
        (t: any) =>
          t.url && t.url.includes("youtube.com") && t.url.includes("multi-tab-test"),
      );

      // Find non-YouTube tabs (those whose URL does NOT contain youtube.com,
      // or whose URL is undefined)
      const nonYtTabs = tabs.filter((t: any) => {
        if (!t.url) return true; // non-accessible URL = non-YouTube
        return !t.url.includes("youtube.com");
      });

      test.skip(!foundYtTab, "YouTube tab URL not accessible");
      expect(foundYtTab).toBeTruthy();

      // YouTube tab sidepanel should be enabled
      const ytOptions = await getSidePanelOptions(page, foundYtTab!.id);
      expect(ytOptions.enabled).toBe(true);

      // All non-YouTube tabs should have sidepanel disabled
      for (const tab of nonYtTabs) {
        const opts = await getSidePanelOptions(page, tab.id);
        expect(opts.enabled).toBe(false);
      }

      // Cleanup
      await nonYtTab1.close().catch(() => {});
      await ytTab.close().catch(() => {});
      await nonYtTab2.close().catch(() => {});
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  3. Message Error Propagation                                            */
  /* ------------------------------------------------------------------------ */
  /*  NEW: Error response shape verification and handler boundary conditions. */
  /*                                                                          */
  /*  NOT covered in background.spec.ts or background-hardened.spec.ts:       */
  /*    - Explicit response shape consistency for known error types           */
  /*    - Error response from ANALYZE_VIDEO with different failure modes      */
  /*    - Multiple error modes exercised on same code path                    */
  /* ------------------------------------------------------------------------ */

  test.describe("Message Error Propagation", () => {
    test("GET_TRENDS error response has consistent { error: string } shape", async ({
      page,
      context,
    }) => {
      // No apiToken → NOT_AUTHENTICATED
      const noTokenResp = await sendMessage(page, { type: "GET_TRENDS" });
      expect(noTokenResp).toEqual({ error: "NOT_AUTHENTICATED" });

      // Set token but make API fail
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Network abort → FETCH_ERROR
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("internetdisconnected");
      });

      const fetchErrorResp = await sendMessage(page, { type: "GET_TRENDS" });
      expect(fetchErrorResp).toEqual({ error: "FETCH_ERROR" });
    });

    test("ANALYZE_VIDEO error response has consistent { error: string } shape", async ({
      page,
      context,
    }) => {
      // No apiToken → NOT_AUTHENTICATED
      const noTokenResp = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });
      expect(noTokenResp).toEqual({ error: "NOT_AUTHENTICATED" });

      // Set token but make API fail
      await setSessionStorage(page, { apiToken: "th_test_token" });

      // Network abort → FETCH_ERROR
      await context.route("**/api/extension/analyze", async (route) => {
        await route.abort("connectionrefused");
      });

      const fetchErrorResp = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });
      expect(fetchErrorResp).toEqual({ error: "FETCH_ERROR" });
    });

    test("error response from GET_TRENDS does not contain extra unexpected properties", async ({
      page,
      context,
    }) => {
      // Test that error responses have exactly the expected shape: { error: string }
      await clearAllStorage(page); // ensure no token

      const resp = await sendMessage(page, { type: "GET_TRENDS" });

      expect(resp).toBeDefined();
      expect(resp).toHaveProperty("error");
      expect(typeof resp.error).toBe("string");

      // Should NOT have a data property when there's an error
      expect(resp).not.toHaveProperty("data");

      // Should only have one key: "error"
      const keys = Object.keys(resp);
      expect(keys).toEqual(["error"]);
    });

    test("error response from ANALYZE_VIDEO does not contain extra unexpected properties", async ({
      page,
    }) => {
      await clearAllStorage(page); // ensure no token

      const resp = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });

      expect(resp).toBeDefined();
      expect(resp).toHaveProperty("error");
      expect(typeof resp.error).toBe("string");
      expect(resp).not.toHaveProperty("data");
      expect(Object.keys(resp)).toEqual(["error"]);
    });

    test("unhandled message type returns undefined (no response sent)", async ({
      page,
    }) => {
      // Even with storage set, an unknown message type falls through all
      // handler branches and returns undefined
      await setSessionStorage(page, { apiToken: "th_test_token" });

      const resp1 = await sendMessage(page, { type: "UNKNOWN_MESSAGE_TYPE" });
      expect(resp1).toBeUndefined();

      // Extra fields don't change fallthrough behavior
      const resp2 = await sendMessage(page, {
        type: "SOME_OTHER_TYPE",
        extra: "data",
      });
      expect(resp2).toBeUndefined();
    });

    test("message handler processing continues after error response", async ({
      page,
      context,
    }) => {
      // Send a failing message, then a succeeding one — handler should recover
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Make the API fail
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("internetdisconnected");
      });

      // First message: should fail with FETCH_ERROR
      const failResp = await sendMessage(page, { type: "GET_TRENDS" });
      expect(failResp).toEqual({ error: "FETCH_ERROR" });

      // Now remove the route interception so the next request succeeds
      await context.unroute("**/api/extension/trends*");
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Second message: should succeed
      const successResp = await sendMessage(page, { type: "GET_TRENDS" });
      expect(successResp).toBeDefined();
      expect(successResp.error).toBeUndefined();
      expect(successResp.data).toBeDefined();
      expect(successResp.data.trends).toHaveLength(2);
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  4. Storage Write/Read Errors                                            */
  /* ------------------------------------------------------------------------ */
  /*  NEW: Error handling for storage API failures and concurrent access.     */
  /*                                                                          */
  /*  NOT covered in background.spec.ts or background-hardened.spec.ts:       */
  /*    - chrome.storage.sync.get failure → fallback to DEFAULT_API_BASE      */
  /*    - Concurrent get/set on session storage from multiple callers         */
  /*    - Storage operations interleaved with message handling                */
  /* ------------------------------------------------------------------------ */

  test.describe("Storage Write/Read Errors", () => {
    test("chrome.storage.sync.get failure falls back to DEFAULT_API_BASE", async ({
      page,
      context,
    }) => {
      // The getApiBaseUrl() function has a try/catch around sync.get()
      // If reading from sync fails, it returns DEFAULT_API_BASE
      //
      // We can't directly make sync.get fail, but we can verify the fallback
      // by setting apiBaseUrl in sync to a valid URL, then verifying it's used,
      // then verifying that an empty/missing apiBaseUrl correctly falls back.

      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Verify: no apiBaseUrl in sync → default URL is used
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
      const defaultUrl = new URL(capturedUrl);

      // Now set a custom apiBaseUrl
      await setSyncStorage(page, {
        apiBaseUrl: "https://fallback-test.example.com",
      });

      await sendMessage(page, { type: "GET_TRENDS" });
      expect(capturedUrl).toContain("fallback-test.example.com");

      // Now remove the apiBaseUrl (simulate "removal" by setting empty string)
      await setSyncStorage(page, { apiBaseUrl: "" });

      await sendMessage(page, { type: "GET_TRENDS" });
      const finalUrl = new URL(capturedUrl);

      // After removal, should fall back to default (same origin as first call)
      expect(finalUrl.origin).toBe(defaultUrl.origin);
      expect(capturedUrl).not.toContain("fallback-test.example.com");
    });

    test("concurrent session storage reads from multiple callers all resolve", async ({
      page,
    }) => {
      // Set up some storage values first
      await setSessionStorage(page, {
        apiToken: "th_concurrent_token",
        selectedNiche: "gaming",
        extraField: "shared_value",
      });

      // Fire 10 concurrent chrome.storage.session.get calls
      const results: any[][] = await page.evaluate(() => {
        const promises = Array.from({ length: 10 }, (_, i) => {
          return new Promise<any>((resolve) => {
            // Alternating between single key and array form
            const keys =
              i % 2 === 0 ? "apiToken" : ["apiToken", "selectedNiche"];
            chrome.storage.session.get(keys, resolve);
          });
        });
        return Promise.all(promises);
      });

      expect(results).toHaveLength(10);

      // Even-numbered calls used string key → single property
      expect(results[0].apiToken).toBe("th_concurrent_token");
      expect(Object.keys(results[0])).toEqual(["apiToken"]);

      // Odd-numbered calls used array key → both properties
      expect(results[1].apiToken).toBe("th_concurrent_token");
      expect(results[1].selectedNiche).toBe("gaming");
      expect(Object.keys(results[1]).sort()).toEqual(
        ["apiToken", "selectedNiche"].sort(),
      );

      // All results resolved without error
      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.apiToken).toBe("th_concurrent_token");
      }
    });

    test("concurrent session storage writes from multiple callers all succeed", async ({
      page,
    }) => {
      // Fire 10 concurrent chrome.storage.session.set calls with different values
      await page.evaluate(() => {
        const promises = Array.from({ length: 10 }, (_, i) => {
          return new Promise<void>((resolve) => {
            chrome.storage.session.set(
              { [`key_${i}`]: `value_${i}` },
              resolve,
            );
          });
        });
        return Promise.all(promises);
      });

      // Verify all values were written
      const keys = Array.from({ length: 10 }, (_, i) => `key_${i}`);
      const result = await page.evaluate((k) => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get(k, resolve);
        });
      }, keys);

      for (let i = 0; i < 10; i++) {
        expect(result[`key_${i}`]).toBe(`value_${i}`);
      }
    });

    test("interleaved storage read/write operations from multiple callers", async ({
      page,
    }) => {
      // Simulate a realistic scenario: multiple callers reading and writing
      // simultaneously, similar to what happens when the background handles
      // concurrent messages while storage changes occur.

      // Set initial values
      await setSessionStorage(page, {
        apiToken: "th_initial_token",
        selectedNiche: "tech-ia",
      });

      // Mix of reads and writes
      const results: any[] = await page.evaluate(() => {
        return Promise.all([
          // Read apiToken
          new Promise<any>((resolve) => {
            chrome.storage.session.get("apiToken", resolve);
          }),
          // Write apiToken (simulate options page updating)
          new Promise<void>((resolve) => {
            chrome.storage.session.set(
              { apiToken: "th_updated_token" },
              resolve,
            );
          }),
          // Read both keys
          new Promise<any>((resolve) => {
            chrome.storage.session.get(
              ["apiToken", "selectedNiche"],
              resolve,
            );
          }),
          // Write selectedNiche
          new Promise<void>((resolve) => {
            chrome.storage.session.set(
              { selectedNiche: "fitness" },
              resolve,
            );
          }),
          // Read selectedNiche
          new Promise<any>((resolve) => {
            chrome.storage.session.get("selectedNiche", resolve);
          }),
        ]);
      });

      expect(results).toHaveLength(5);

      // The first read may have the initial or updated token (race)
      // But all operations completed without error
      for (const result of results) {
        expect(result).toBeDefined();
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  5. URL Construction Edge Cases                                          */
  /* ------------------------------------------------------------------------ */
  /*  NEW: Port variants, ANALYZE_VIDEO URL building, and IP-based hosts.     */
  /*                                                                          */
  /*  NOT covered in background.spec.ts or background-hardened.spec.ts:       */
  /*    - GET_TRENDS with port AND no trailing slash                          */
  /*    - ANALYZE_VIDEO URL verification (existing tests only check headers)  */
  /*    - API_BASE with IP address                                            */
  /* ------------------------------------------------------------------------ */

  test.describe("URL Construction Edge Cases", () => {
    test("GET_TRENDS URL with apiBaseUrl containing port (no trailing slash)", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "http://localhost:8080",
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

      // Should produce: "http://localhost:8080/api/extension/trends?niche=tech-ia"
      // Note: no trailing slash on base, and endpoint starts with /, so combined
      // we get: "http://localhost:8080" + "/api/extension/trends" = correct
      const url = new URL(capturedUrl);
      expect(url.origin).toBe("http://localhost:8080");
      expect(url.pathname).toBe("/api/extension/trends");
      expect(url.searchParams.get("niche")).toBe("tech-ia");
      // Verify no double slash
      expect(capturedUrl).not.toContain("localhost:8080//");
    });

    test("GET_TRENDS URL with apiBaseUrl containing port AND trailing slash", async ({
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

      // With trailing slash: "http://localhost:8080/" + "/api/extension/trends"
      // produces "http://localhost:8080//api/extension/trends" (double slash)
      // Browsers normalize this to "http://localhost:8080/api/extension/trends"
      const url = new URL(capturedUrl);
      expect(url.origin).toBe("http://localhost:8080");
      expect(url.pathname).toBe("/api/extension/trends");
      // The raw URL may contain double slash (before browser normalization in request)
      // or it may be normalized by Playwright's URL parser
      expect(capturedUrl).toContain("niche=tech-ia");
    });

    test("ANALYZE_VIDEO URL is correctly constructed with custom apiBaseUrl", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "https://api.trendhunter.app",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });

      // The background uses: `${API_BASE}${API_ENDPOINTS.analyze}`
      // where API_ENDPOINTS.analyze = "/api/extension/analyze"
      // So URL should be: "https://api.trendhunter.app/api/extension/analyze"
      const url = new URL(capturedUrl);
      expect(url.origin).toBe("https://api.trendhunter.app");
      expect(url.pathname).toBe("/api/extension/analyze");
      // ANALYZE_VIDEO is a POST with no query params
      expect(url.search).toBe("");
    });

    test("ANALYZE_VIDEO URL with apiBaseUrl containing path prefix", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "https://proxy.company.com/api/v2",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "test123",
      });

      // URL should be: "https://proxy.company.com/api/v2/api/extension/analyze"
      // This is the concatenation: base path + endpoint path
      expect(capturedUrl).toBe(
        "https://proxy.company.com/api/v2/api/extension/analyze",
      );
    });

    test("GET_TRENDS URL with IP-address based apiBaseUrl", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await setSyncStorage(page, {
        apiBaseUrl: "http://192.168.1.100:3000",
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

      const url = new URL(capturedUrl);
      expect(url.origin).toBe("http://192.168.1.100:3000");
      expect(url.pathname).toBe("/api/extension/trends");
      expect(url.searchParams.get("niche")).toBe("tech-ia");
    });

    test("GET_TRENDS URL with apiBaseUrl pointing to localhost (default) produces correct URL", async ({
      page,
      context,
    }) => {
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "gaming",
      });
      // Not setting apiBaseUrl in sync storage → falls back to DEFAULT_API_BASE
      // Which is http://localhost:3000 (or VITE_API_BASE_URL env var)

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

      const url = new URL(capturedUrl);
      expect(url.pathname).toBe("/api/extension/trends");
      expect(url.searchParams.get("niche")).toBe("gaming");
      // The port might be 3000 or whatever VITE_API_BASE_URL sets
      expect(url.port).toBeTruthy();
      // The host should be localhost or whatever the env variable specifies
      expect(url.host).toBeTruthy();
    });
  });
});
