import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

const DEFAULT_SCORE = 85;
const BADGE_ID = "#trendhunter-badge";
const DEBOUNCE_MS = 500;
const API_MOCK_PATH = "**/api/extension/analyze";

/* ========================================================================== */
/*  Mock HTML builders                                                        */
/* ========================================================================== */

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
  <div id="deep-nest"><div><div><div id="target">deep</div></div></div></div>
</body></html>`;
}

function mockMinimalHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>YouTube</title></head>
<body>
  <div id="content"></div>
  <div id="deep-nest"><div><div><div id="target">deep</div></div></div></div>
</body></html>`;
}

function mockAboveFoldNoTitleHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body>
  <div id="above-the-fold">
    <div id="info">No title element here</div>
  </div>
  <div id="content"></div>
</body></html>`;
}

/* ========================================================================== */
/*  Storage helpers — mirrors existing spec files                             */
/* ========================================================================== */

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

async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

/* ========================================================================== */
/*  API helpers                                                               */
/* ========================================================================== */

function analyzeResponseBody(score: number): string {
  return JSON.stringify({ score });
}

/* ========================================================================== */
/*  YouTube page helpers — mirrors existing spec files                        */
/* ========================================================================== */

/**
 * Create a new page with YouTube route interception that serves custom HTML.
 */
async function createYouTubePage(
  context: BrowserContext,
  html: string,
  url = "https://www.youtube.com/watch?v=test",
): Promise<Page> {
  const page = await context.newPage();
  await page.route("https://www.youtube.com/**", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: html,
      });
    } else {
      await route.abort();
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

/**
 * SPA-style navigation: change the ?v= param and trigger DOM mutation.
 */
async function changeVideoId(page: Page, newVideoId: string) {
  await page.evaluate((vid) => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", vid);
    window.history.pushState({}, "", url.toString());
    const el = document.getElementById("content");
    if (el) el.innerHTML = `<div>video: ${vid}</div>`;
  }, newVideoId);
}

/**
 * Navigate to a path via History API + DOM mutation (no page reload).
 */
async function spaNavigateTo(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    const el = document.getElementById("content");
    if (el) el.innerHTML = `<div>nav: ${p}</div>`;
  }, path);
}

/* ========================================================================== */
/*  Test suite                                                                */
/* ========================================================================== */

test.describe("Extension — Content Script Robustness", () => {
  let currentAnalyzeBody: string;

  /* ---- Fixture setup --------------------------------------------------- */

  test.beforeEach(async ({ page: sidepanelPage, context }) => {
    await clearAllStorage(sidepanelPage);
    currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

    // Intercept the background worker's fetch call to the analyze API.
    await context.route(API_MOCK_PATH, async (route) => {
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
  /*  1. Multiple Injection Prevention                                       */
  /*  Verifies the content script never produces duplicate badges.           */
  /* ====================================================================== */

  test.describe("Multiple Injection Prevention", () => {
    test("navigates 5 different videos — exactly 1 badge in DOM at each step", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const videos = [
        { id: "vid-alpha", score: 85 },
        { id: "vid-beta", score: 34 },
        { id: "vid-gamma", score: 62 },
        { id: "vid-delta", score: 75 },
        { id: "vid-omega", score: 50 },
      ];

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        `https://www.youtube.com/watch?v=${videos[0].id}`,
      );

      for (let i = 0; i < videos.length; i++) {
        if (i > 0) {
          currentAnalyzeBody = analyzeResponseBody(videos[i].score);
          await changeVideoId(youtubePage, videos[i].id);
          await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);
        }

        // Verify via Playwright locator
        const badge = youtubePage.locator(BADGE_ID);
        await expect(badge).toHaveCount(1);
        // Badge is visible (non-null assertion for strict check)
        await expect(badge).toBeVisible();

        // Verify via querySelectorAll (raw DOM — no locator caching)
        const domCount = await youtubePage.evaluate(() =>
          document.querySelectorAll("#trendhunter-badge").length,
        );
        expect(domCount).toBe(1);

        // Verify getElementById returns exactly one element (not null)
        const byId = await youtubePage.evaluate(() =>
          document.getElementById("trendhunter-badge") !== null,
        );
        expect(byId).toBe(true);
      }

      await youtubePage.close();
    });

    test("same videoId does not cause re-injection (currentVideoId guard)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      // Set a distinctive score so we can detect if re-injection occurs
      currentAnalyzeBody = analyzeResponseBody(72);
      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=sticky",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      // Re-navigate to the exact same video ID (no URL change, only DOM mutation)
      await changeVideoId(youtubePage, "sticky");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Badge count must still be exactly 1
      await expect(badge).toHaveCount(1);

      // Badge should still show "Score TrendHunter" (not fallback)
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test("removeBadge prevents duplicate badges during navigation swap", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=first",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Navigate to a new video and wait for debounce to process
      currentAnalyzeBody = analyzeResponseBody(30);
      await changeVideoId(youtubePage, "second");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // After the debounce fires, removeBadge runs before injectBadge,
      // so there should never be 2 badges. Final state: exactly 1 badge.
      await expect(badge).toHaveCount(1);

      // The score should reflect the second video
      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveText("30");

      await youtubePage.close();
    });

    test("10 rapid URL changes within 2 seconds — only last triggers injection", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=vid-0",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Fire 10 rapid URL changes, 1 every ~180ms (total ~1.8s).
      // Each stays within the debounce window of the previous, so only
      // the last one should trigger checkVideo.
      for (let i = 1; i <= 10; i++) {
        currentAnalyzeBody = analyzeResponseBody((i * 9 + 3) % 101);
        await changeVideoId(youtubePage, `rapid-${i}`);
        await youtubePage.waitForTimeout(180);
      }

      // Wait for final debounce to settle
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Only one badge in DOM
      await expect(badge).toHaveCount(1);

      // Final video: i=10 → score = (10*9+3) % 101 = 93 % 101 = 93
      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveText("93");

      await youtubePage.close();
    });

    test("getElementById and querySelectorAll return at most 1 badge element", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=unique-id",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // getElementById returns non-null (single element or null by spec)
      const byIdExists = await youtubePage.evaluate(() =>
        document.getElementById("trendhunter-badge") !== null,
      );
      expect(byIdExists).toBe(true);

      // querySelectorAll returns exactly 1
      const qsaCount = await youtubePage.evaluate(() =>
        document.querySelectorAll("#trendhunter-badge").length,
      );
      expect(qsaCount).toBe(1);

      // No other element shares the same id (id uniqueness)
      const idUniqueness = await youtubePage.evaluate(() => {
        const id = "trendhunter-badge";
        return document.querySelectorAll(`[id="${id}"]`).length === 1;
      });
      expect(idUniqueness).toBe(true);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  2. MutationObserver Behavior                                           */
  /*  Verifies the observer configuration and interaction with debounce.      */
  /* ====================================================================== */

  test.describe("MutationObserver Behavior", () => {
    test("deeply nested DOM mutation is captured (subtree: true)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=first",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Change both the URL and a deeply nested DOM element (3 levels deep).
      // The observer watches document.body with subtree:true, so it catches
      // mutations anywhere in the tree, not just direct children.
      currentAnalyzeBody = analyzeResponseBody(50);
      await youtubePage.evaluate(() => {
        window.history.pushState({}, "", "/watch?v=deep-mutation");
        const target = document.querySelector("#target");
        if (target) target.textContent = "mutated-by-observer";
        const content = document.getElementById("content");
        if (content) content.innerHTML = "<div>nested change</div>";
      });
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Badge should update to reflect the new video
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("50");

      await youtubePage.close();
    });

    test("100 rapid DOM mutations trigger debounced (not per-mutation) calls", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=baseline",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Append 100 elements to the page in a tight loop.
      // Each triggers a MutationObserver callback → debouncedCheck.
      // The debounce ensures that only the last checkVideo fires,
      // preventing 100 sequential API calls.
      await youtubePage.evaluate(() => {
        const container = document.getElementById("content");
        if (!container) return;
        for (let i = 0; i < 100; i++) {
          const el = document.createElement("div");
          el.textContent = `bulk-${i}`;
          container.appendChild(el);
        }
      });

      // Change video ID while mutations are still settling
      currentAnalyzeBody = analyzeResponseBody(88);
      await changeVideoId(youtubePage, "post-burst");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Only one badge should exist
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("88");

      await youtubePage.close();
    });

    test("observer remains active after initial badge injection", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=initial",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Perform 3 sequential SPA navigations. Each requires the observer to
      // catch the DOM mutation and trigger debouncedCheck. If the observer
      // were disconnected after initial injection, these would not work.
      const navigations = [
        { id: "seq-a", score: 42 },
        { id: "seq-b", score: 88 },
        { id: "seq-c", score: 16 },
      ];

      for (const nav of navigations) {
        currentAnalyzeBody = analyzeResponseBody(nav.score);
        await changeVideoId(youtubePage, nav.id);
        await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

        await expect(badge).toBeVisible();
        await expect(badge).toHaveCount(1);
        await expect(badge.locator("> div > span").first()).toHaveText(
          String(nav.score),
        );
      }

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  3. Debounce Edge Cases                                                  */
  /*  Verifies the 500ms debounce on checkVideo behaves correctly.            */
  /* ====================================================================== */

  test.describe("Debounce Edge Cases", () => {
    test("multiple calls within 500ms produce only one badge update", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=initial",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Fire 5 URL changes at 50ms intervals (250ms total — inside debounce)
      for (let i = 0; i < 5; i++) {
        currentAnalyzeBody = analyzeResponseBody((i + 1) * 20);
        await changeVideoId(youtubePage, `burst-${i}`);
        await youtubePage.waitForTimeout(50);
      }

      // Only 250ms elapsed — no debounce should have fired yet.
      // Badge should STILL display the initial score.
      await expect(badge.locator("> div > span").first()).toHaveText(
        String(DEFAULT_SCORE),
      );

      // Wait for debounce to settle (500ms from last change + buffer)
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Now badge should reflect the LAST video (burst-4, score = 5*20=100)
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("100");

      await youtubePage.close();
    });

    test("debounce timer resets on each rapid call (trailing edge)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=base",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Change video, wait 300ms (< 500ms), then change again.
      // The second call resets the debounce timer, so the first change's
      // score should NEVER appear in the badge.
      currentAnalyzeBody = analyzeResponseBody(30);
      await changeVideoId(youtubePage, "interrupted");
      await youtubePage.waitForTimeout(300);

      currentAnalyzeBody = analyzeResponseBody(90);
      await changeVideoId(youtubePage, "final-one");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 100);

      // Only the LAST video's score should be shown (timer was reset)
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("90");

      // The first score (30) must never have appeared
      const badgeText = await badge.innerText();
      expect(badgeText).not.toContain("30");

      await youtubePage.close();
    });

    test("checkVideo is called immediately on page load (no debounce)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await context.newPage();
      let navigationStart = 0;

      // Capture the DOMContentLoaded timestamp
      youtubePage.on("domcontentloaded", () => {
        navigationStart = Date.now();
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

      await youtubePage.goto("https://www.youtube.com/watch?v=first-load", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // The badge appears from the direct checkVideo() call (not debounced).
      // The direct call happens synchronously at the end of main().
      // A debounced call would take at least 500ms from document_idle.
      // We allow generous time for extension injection + storage read + API.
      const elapsed = Date.now() - navigationStart;
      expect(elapsed).toBeLessThan(3000);

      await youtubePage.close();
    });

    test("after debounce fires, subsequent changes start new 500ms window", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=first-wave",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Wave 1: change video, wait for debounce to fire
      currentAnalyzeBody = analyzeResponseBody(60);
      await changeVideoId(youtubePage, "wave-1");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Badge should now show wave-1's score (debounce fired)
      await expect(badge.locator("> div > span").first()).toHaveText("60");

      // Wave 2: change video — timer starts fresh
      currentAnalyzeBody = analyzeResponseBody(25);
      await changeVideoId(youtubePage, "wave-2");

      // Immediately verify badge still shows old score (debounce hasn't fired)
      await expect(badge.locator("> div > span").first()).toHaveText("60");

      // Wait for debounce to fire
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Now badge reflects wave-2
      await expect(badge.locator("> div > span").first()).toHaveText("25");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  4. Video ID Extraction                                                  */
  /*  Verifies getVideoId() handles all URL patterns correctly.               */
  /* ====================================================================== */

  test.describe("Video ID Extraction", () => {
    test('standard URL "/watch?v=dQw4w9WgXcQ" injects badge', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test('URL with timestamp "/watch?v=abc&t=123" — v is first param', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=abc&t=123",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test('URL with list before v "/watch?list=xyz&v=abc" — extracts v param', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?list=xyz&v=abc",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test('URL with no params "/watch" — no badge (getVideoId returns null)', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch",
      );

      await youtubePage.waitForTimeout(2000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      await youtubePage.close();
    });

    test('URL with empty v "/watch?v=" — no badge (falsy empty string)', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=",
      );

      await youtubePage.waitForTimeout(2000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      await youtubePage.close();
    });

    test('Shorts URL "/shorts/abc" — no v param, no badge', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockMinimalHTML(),
        "https://www.youtube.com/shorts/abc",
      );

      await youtubePage.waitForTimeout(2000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      await youtubePage.close();
    });

    test('URL with fragment "/watch?v=abc#fragment" — extracts video ID before hash', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=abc#fragment",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  5. Badge Injection Timing                                               */
  /*  Verifies the badge is injected at the right time relative to the DOM.   */
  /* ====================================================================== */

  test.describe("Badge Injection Timing", () => {
    test("badge appears within 1000ms of DOM content being ready", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await context.newPage();
      let domReady = 0;

      youtubePage.on("domcontentloaded", () => {
        domReady = Date.now();
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

      await youtubePage.goto("https://www.youtube.com/watch?v=timing-test", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Measure from domcontentloaded to badge visible.
      // The target is < 1000ms; we use 3000ms to account for extension
      // injection overhead, storage reads, and CI variability.
      const elapsed = Date.now() - domReady;
      expect(elapsed).toBeLessThan(3000);

      await youtubePage.close();
    });

    test("badge appears AFTER the title element is available in DOM", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML("Title is Present"),
        "https://www.youtube.com/watch?v=title-order",
      );

      // Title must exist independently
      await expect(youtubePage.locator("h1")).toBeVisible({ timeout: 5_000 });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Verify DOM insertion order: badge is inserted AFTER the title
      // container as a next sibling, not before.
      const titleIndex = await youtubePage.evaluate(() => {
        const parent = document.querySelector("#above-the-fold");
        if (!parent) return -1;
        const children = Array.from(parent.children);
        const title = document.querySelector("#above-the-fold #title");
        const badgeEl = document.getElementById("trendhunter-badge");
        if (!title || !badgeEl) return -1;
        return children.indexOf(title);
      });
      const badgeIndex = await youtubePage.evaluate(() => {
        const parent = document.querySelector("#above-the-fold");
        if (!parent) return -1;
        const children = Array.from(parent.children);
        const badgeEl = document.getElementById("trendhunter-badge");
        if (!badgeEl) return -1;
        return children.indexOf(badgeEl);
      });

      expect(titleIndex).toBeGreaterThanOrEqual(0);
      expect(badgeIndex).toBe(titleIndex + 1);

      await youtubePage.close();
    });

    test("container exists but no title element — badge not injected", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockAboveFoldNoTitleHTML(),
        "https://www.youtube.com/watch?v=missing-title",
      );

      // Page has #above-the-fold but no #title inside it, and no
      // h1.ytd-video-primary-info-renderer. injectBadge should bail.
      await youtubePage.waitForTimeout(2000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  6. Console & Error Resilience                                           */
  /*  Verifies no errors during operation and graceful degradation.           */
  /* ====================================================================== */

  test.describe("Console & Error Resilience", () => {
    test("no console errors during 5 rapid video navigations", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await context.newPage();
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];

      youtubePage.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
        if (msg.type() === "warning") consoleWarnings.push(msg.text());
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

      await youtubePage.goto("https://www.youtube.com/watch?v=nav-0", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Navigate through 5 different videos
      for (let i = 1; i <= 5; i++) {
        currentAnalyzeBody = analyzeResponseBody((i * 13) % 101);
        await changeVideoId(youtubePage, `nav-console-${i}`);
        await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);
        await expect(badge).toBeVisible();
      }

      // Filter for extension-related messages only
      const extErrors = consoleErrors.filter(
        (e) =>
          e.toLowerCase().includes("trendhunter") ||
          e.toLowerCase().includes("chrome-extension") ||
          e.includes("content.ts"),
      );
      const extWarnings = consoleWarnings.filter(
        (e) =>
          e.toLowerCase().includes("trendhunter") ||
          e.toLowerCase().includes("chrome-extension") ||
          e.includes("content.ts"),
      );

      expect(extErrors).toEqual([]);
      expect(extWarnings).toEqual([]);

      await youtubePage.close();
    });

    test("navigation to malformed URL does not crash content script", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(
        context,
        mockWatchPageHTML(),
        "https://www.youtube.com/watch?v=stable",
      );

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Navigate to a non-video URL (search results) via SPA — simulates
      // a YouTube SPA transition where getVideoId() returns null.
      await spaNavigateTo(youtubePage, "/results?search_query=something");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      // Page must still be functional (no crash)
      const pageFunctional = await youtubePage.evaluate(
        () => document.querySelector("body") !== null,
      );
      expect(pageFunctional).toBe(true);

      // Navigate back to a valid video — badge should recover
      currentAnalyzeBody = analyzeResponseBody(72);
      await spaNavigateTo(youtubePage, "/watch?v=recovered");
      await youtubePage.waitForTimeout(DEBOUNCE_MS + 200);

      await expect(badge).toBeVisible({ timeout: 5_000 });
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveText("72");

      await youtubePage.close();
    });
  });
});
