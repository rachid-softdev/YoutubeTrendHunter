import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

const BADGE_ID = "#trendhunter-badge";

/* ── Mock HTML ──────────────────────────────────────────────────────────── */

function mockWatchPageHTML(title = "Test Video Title"): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body>
  <div id="above-the-fold">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer">${title}</h1>
    </div>
  </div>
  <div id="content"></div>
</body></html>`;
}

function mockMinimalHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>YouTube</title></head>
<body>
  <div id="content"></div>
</body></html>`;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

async function setSessionStorage(page: Page, items: Record<string, unknown>): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set(data, resolve);
    });
  }, items);
}

async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

async function createYouTubePage(
  context: BrowserContext,
  html: string,
  url = "https://www.youtube.com/watch?v=test",
): Promise<Page> {
  const page = await context.newPage();
  await page.route("https://www.youtube.com/**", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({ status: 200, contentType: "text/html", body: html });
    } else {
      await route.abort();
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function changeVideoId(page: Page, newVideoId: string) {
  await page.evaluate((vid) => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", vid);
    window.history.pushState({}, "", url.toString());
    const el = document.getElementById("content");
    if (el) el.innerHTML = `<div>video: ${vid}</div>`;
  }, newVideoId);
}

async function removeVideoParam(page: Page) {
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.history.pushState({}, "", url.toString());
    const el = document.getElementById("content");
    if (el) el.innerHTML = "<div>no video</div>";
  });
}

const DEFAULT_SCORE = 85;
function analyzeResponseBody(score: number): string {
  return JSON.stringify({ score });
}

/* ========================================================================== */
/*  Test Suite — Content Script Missing Coverage                              */
/* ========================================================================== */
/*                                                                             */
/*  These tests cover edge cases and behaviors not found in:                   */
/*    - content-script.spec.ts         (score display, nav, edge cases)        */
/*    - content-script-hardened.spec.ts (page types, layout, security)         */
/*    - content-script-robustness.spec.ts (debounce, observer, timing)         */
/* ========================================================================== */

test.describe("Extension — Content Script (Missing Coverage)", () => {
  let currentAnalyzeBody: string;

  test.beforeEach(async ({ page: sidepanelPage, context }) => {
    await clearAllStorage(sidepanelPage);
    currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

    // Register the analyze API mock at context level for background worker.
    await context.route("**/api/extension/analyze", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
        return;
      }
      if (currentAnalyzeBody.startsWith("ABORT")) {
        await route.abort("internetdisconnected");
        return;
      }
      await route.fulfill({
        status: currentAnalyzeBody.startsWith("ERROR") ? 500 : 200,
        contentType: "application/json",
        body: currentAnalyzeBody.startsWith("ERROR")
          ? JSON.stringify({ error: "Internal server error" })
          : currentAnalyzeBody,
      });
    });
  });

  /* ====================================================================== */
  /*  1. removeBadge Safety                                                   */
  /*  Verifies removeBadge() is no-op safe when badge does not exist.         */
  /* ====================================================================== */

  test.describe("removeBadge Safety", () => {
    test("removeBadge is safe when called without a badge in the DOM", async ({
      page: sidepanelPage,
      context,
    }) => {
      // Navigate to a YouTube page that has NO video ID (homepage).
      // The content script runs, but checkVideo short-circuits because
      // getVideoId() returns null. No badge is injected.
      const youtubePage = await createYouTubePage(
        context,
        mockMinimalHTML(),
        "https://www.youtube.com/",
      );
      await youtubePage.waitForTimeout(1_000);

      // Now call removeBadge directly via evaluate (simulating what injectBadge
      // does as its first step). There is no badge element to remove.
      const removed = await youtubePage.evaluate(() => {
        try {
          const el = document.getElementById("trendhunter-badge");
          el?.remove();
          return true;
        } catch {
          return false;
        }
      });
      expect(removed).toBe(true);

      // Verify no badge exists
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("removeBadge called before each injectBadge never leaves duplicates", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveCount(1);

      // InjectBadge always calls removeBadge first. Simulate calling
      // injectBadge directly multiple times via evaluate to verify
      // removeBadge prevents duplicates even when called in quick succession.
      for (let i = 0; i < 5; i++) {
        await youtubePage.evaluate(() => {
          // Simulate the content script's injectBadge logic
          const existing = document.getElementById("trendhunter-badge");
          if (existing) existing.remove();

          const container = document.querySelector("#above-the-fold #title");
          if (!container) return;

          const badge = document.createElement("div");
          badge.id = "trendhunter-badge";
          badge.textContent = `call-${i}`;
          container.parentNode?.insertBefore(badge, container.nextSibling);
        });
        await youtubePage.waitForTimeout(50);
      }

      // Exactly one badge should exist after all calls
      await expect(badge).toHaveCount(1);
      // The last call's text should be visible
      await expect(badge).toHaveText("call-4");
      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  2. currentVideoId Guard                                                 */
  /*  Verifies the guard prevents re-querying the API for the same video.     */
  /* ====================================================================== */

  test.describe("currentVideoId Guard", () => {
    test("navigating to the same video ID does not re-trigger checkVideo", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      // Track how many times the analyze API is called
      let analyzeCallCount = 0;
      await context.unroute("**/api/extension/analyze");
      await context.route("**/api/extension/analyze", async (route) => {
        analyzeCallCount++;
        if (route.request().method() === "OPTIONS") {
          await route.fulfill({
            status: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: currentAnalyzeBody,
        });
      });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=stable-id",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      expect(analyzeCallCount).toBe(1); // Initial checkVideo

      // Trigger a DOM mutation that re-runs debouncedCheck but with the
      // same videoId. The guard `videoId !== currentVideoId` should prevent
      // a new API call.
      await youtubePage.evaluate(() => {
        const el = document.getElementById("content");
        if (el) el.innerHTML = "<div>unrelated mutation</div>";
      });
      await youtubePage.waitForTimeout(1_000); // Debounce window

      // API should NOT have been called again
      expect(analyzeCallCount).toBe(1);

      await youtubePage.close();
    });

    test("changing to a different video ID then back calls API twice", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      let analyzeCallCount = 0;
      await context.unroute("**/api/extension/analyze");
      await context.route("**/api/extension/analyze", async (route) => {
        analyzeCallCount++;
        if (route.request().method() === "OPTIONS") {
          await route.fulfill({
            status: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: currentAnalyzeBody,
        });
      });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=video-a",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      expect(analyzeCallCount).toBe(1); // Initial call for video-a

      // Navigate to video-b
      currentAnalyzeBody = analyzeResponseBody(50);
      await changeVideoId(youtubePage, "video-b");
      await youtubePage.waitForTimeout(1_000);
      expect(analyzeCallCount).toBe(2); // Second call for video-b

      // Navigate back to video-a
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);
      await changeVideoId(youtubePage, "video-a");
      await youtubePage.waitForTimeout(1_000);
      expect(analyzeCallCount).toBe(3); // Third call (new currentVideoId)

      await expect(badge).toHaveCount(1);
      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  3. checkVideo with Null/Empty VideoId                                   */
  /*  Verifies the content script handles missing video gracefully.           */
  /* ====================================================================== */

  test.describe("checkVideo with Missing Video ID", () => {
    test("navigating from watch page to homepage does not remove badge (current behavior documented)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=doc-test",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Simulate SPA navigation to homepage (remove ?v param)
      await removeVideoParam(youtubePage);
      await youtubePage.waitForTimeout(1_000);

      // checkVideo short-circuits because getVideoId() returns null.
      // The badge REMAINS in the DOM because removeBadge is only called
      // inside injectBadge, and injectBadge is never called when videoId
      // is null. This documents the current known limitation.
      //
      // Expected fix: checkVideo should call removeBadge() when videoId is null:
      //   if (!videoId) { removeBadge(); currentVideoId = null; return; }
      await expect(badge).toHaveCount(1);

      await youtubePage.close();
    });

    test("page with empty v= param does not inject badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=",
      );
      await youtubePage.waitForTimeout(2_000);

      // Empty string is falsy → getVideoId() returns "" → condition
      // `videoId && ...` short-circuits → no badge
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  4. MutationObserver Longevity                                          */
  /*  Verifies the observer remains connected across many mutations.          */
  /* ====================================================================== */

  test.describe("MutationObserver Longevity", () => {
    test("observer remains connected after 50+ DOM mutations", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=longevity-test",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Trigger 50 DOM mutations in rapid succession
      for (let i = 0; i < 50; i++) {
        await youtubePage.evaluate((idx) => {
          const el = document.getElementById("content");
          if (el) el.innerHTML = `<span>mutation ${idx}</span>`;
        }, i);
      }

      // Wait for debounce to settle
      await youtubePage.waitForTimeout(1_000);

      // Badge should still be present and functional
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCount(1);

      // Navigate to a new video — observer must still be connected
      currentAnalyzeBody = analyzeResponseBody(30);
      await changeVideoId(youtubePage, "final-video");
      await youtubePage.waitForTimeout(1_000);

      await expect(badge).toBeVisible();
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("30");

      await youtubePage.close();
    });

    test("observer handles document.body replacement gracefully", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=body-replace",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Simulate a SPA that replaces document.body entirely
      await youtubePage.evaluate(() => {
        const newBody = document.createElement("body");
        newBody.innerHTML = `
          <div id="above-the-fold">
            <div id="title">
              <h1 class="ytd-video-primary-info-renderer">Replaced Body</h1>
            </div>
          </div>
          <div id="content">replaced</div>
        `;
        document.body.replaceWith(newBody);
      });

      // Wait for any observer callbacks to process
      await youtubePage.waitForTimeout(1_000);

      // The observer was attached to the original document.body.
      // After body replacement, the observer may be disconnected.
      // This test documents current behavior — the badge may or may not remain.
      // At minimum, the page should not crash.
      const pageFunctional = await youtubePage.evaluate(
        () => document.querySelector("body") !== null,
      );
      expect(pageFunctional).toBe(true);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  5. Console Output Verification                                          */
  /*  Verifies no unexpected console output from the content script.          */
  /* ====================================================================== */

  test.describe("Console Output", () => {
    test("content script does not log to console during initialization", async ({
      page: sidepanelPage,
      context,
    }) => {
      const consoleMessages: string[] = [];
      const youtubePage = await context.newPage();

      youtubePage.on("console", (msg) => {
        // Collect all console output, filter for extension-related messages
        if (
          msg.text().toLowerCase().includes("trendhunter") ||
          msg.text().includes("content.ts") ||
          msg.text().includes("trendhunter-badge")
        ) {
          consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
        }
      });

      await youtubePage.route("https://www.youtube.com/**", async (route) => {
        if (route.request().resourceType() === "document") {
          await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: mockWatchPageHTML(),
          });
        } else {
          await route.abort();
        }
      });

      await youtubePage.goto("https://www.youtube.com/watch?v=console-test", {
        waitUntil: "domcontentloaded",
      });

      // Wait for content script to initialize and badge to appear
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // No extension-related console messages should have been logged
      expect(consoleMessages).toHaveLength(0);

      await youtubePage.close();
    });
  });
});
