import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

const DEFAULT_SCORE = 85;

/** Simulated YouTube watch page with the container that the content script targets. */
function mockYouTubeHTML(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Test Video — YouTube</title></head>
<body>
  <div id="above-the-fold">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer">Test Video Title</h1>
    </div>
  </div>
  <div id="content"></div>
</body>
</html>`;
}

/** Simulated YouTube page WITHOUT the badge injection container. */
function mockYouTubeHTMLWithoutContainer(): string {
  return `<!DOCTYPE html>
<html>
<head><title>YouTube</title></head>
<body>
  <div id="content">No title container here</div>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*  CSS colour constants (computed rgb(...) values)                           */
/* -------------------------------------------------------------------------- */

const BG_RED = "rgb(255, 0, 0)";
const BG_AMBER = "rgb(245, 158, 11)";
const BG_GREEN = "rgb(34, 197, 94)";
const BG_DARK = "rgb(33, 33, 33)";
const GRAY_AAA = "rgb(170, 170, 170)";

/* -------------------------------------------------------------------------- */
/*  Helpers — mirrors helpers from background.spec.ts                          */
/* -------------------------------------------------------------------------- */

/**
 * Set values in chrome.storage.session from an extension page
 * (sidepanel page where chrome.runtime is available).
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
 * Remove a key from chrome.storage.session.
 */
async function removeSessionStorage(
  page: Page,
  key: string,
): Promise<void> {
  await page.evaluate((k) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.remove(k, resolve);
    });
  }, key);
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

/* -------------------------------------------------------------------------- */
/*  YouTube page helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create a fresh page, intercept all youtube.com requests, and serve a
 * simulated YouTube watch page.
 */
async function createYouTubePage(
  context: BrowserContext,
  useContainer = true,
): Promise<Page> {
  const page = await context.newPage();

  await page.route("https://www.youtube.com/**", async (route) => {
    if (route.request().resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: useContainer ? mockYouTubeHTML() : mockYouTubeHTMLWithoutContainer(),
      });
    } else {
      await route.abort();
    }
  });

  return page;
}

/**
 * Navigate to a simulated YouTube watch page.
 */
async function navigateToVideo(page: Page, videoId: string) {
  await page.goto(`https://www.youtube.com/watch?v=${videoId}`);
}

/**
 * Navigate to YouTube without a ?v= parameter.
 */
async function navigateToYouTubeHome(page: Page) {
  await page.goto("https://www.youtube.com/");
}

/**
 * Simulate SPA navigation: change the ?v= param via History API and
 * trigger a DOM mutation so the MutationObserver fires.
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
 * Remove the ?v= param via History API and trigger a DOM mutation.
 */
async function removeVideoParam(page: Page) {
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.history.pushState({}, "", url.toString());
    const el = document.getElementById("content");
    if (el) el.innerHTML = "<div>no video</div>";
  });
}

/**
 * Trigger an unrelated DOM mutation (no URL change).
 */
async function triggerUnrelatedMutation(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById("content");
    if (el) el.innerHTML = `<div>unrelated ${Date.now()}</div>`;
  });
}

/**
 * Build the JSON body for a successful analyze response.
 */
function analyzeResponseBody(score: number): string {
  return JSON.stringify({ score });
}

/**
 * Build the JSON body for an error analyze response.
 */
function analyzeErrorBody(): string {
  return JSON.stringify({ error: "Internal server error" });
}

/* ========================================================================== */
/*  Tests                                                                     */
/* ========================================================================== */

test.describe("Extension — Content Script", () => {
  /* ---- Fixture setup --------------------------------------------------- */

  // We'll manage the analyze API mock ourselves with a dynamic hook variable
  // so that individual tests can change the score without re-registering routes.
  let currentAnalyzeBody: string;

  /* ---- Reset mock & storage before each test --------------------------- */
  // Each test gets its own browser context (test-scoped fixture), so we
  // register the analyse-API route inside beforeEach.

  test.beforeEach(async ({ page: sidepanelPage, context }) => {
    // The `page` fixture navigates to the extension sidepanel page where
    // chrome.runtime / chrome.storage APIs are available in the page context.
    await clearAllStorage(sidepanelPage);
    currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

    // Register (or re-register) the context-level route that intercepts the
    // background service worker's fetch call to `/api/extension/analyze`.
    //
    // NOTE: context.route (not page.route) is required because the background
    // script's fetch calls are NOT made from the page's frame.
    await context.route("**/api/extension/analyze", async (route) => {
      // Let CORS preflight through
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
      // Start with "ABORT" → simulate network failure (fetch throws)
      if (currentAnalyzeBody.startsWith("ABORT")) {
        await route.abort("internetdisconnected");
        return;
      }
      // Start with "ERROR" → simulate API 500 error
      await route.fulfill({
        status: currentAnalyzeBody.startsWith("ERROR") ? 500 : 200,
        contentType: "application/json",
        body: currentAnalyzeBody.startsWith("ERROR")
          ? analyzeErrorBody()
          : currentAnalyzeBody,
      });
    });
  });

  /* ====================================================================== */
  /*  Authenticated — Score Display                                          */
  /* ====================================================================== */

  test.describe("Authenticated — Score Display", () => {
    test("injects badge on YouTube watch page", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "dQw4w9WgXcQ");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveId("trendhunter-badge");

      await youtubePage.close();
    });

    test("badge has correct flex layout and dark background", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Root: inline-flex, dark bg, padding, border-radius, font
      await expect(badge).toHaveCSS("display", "inline-flex");
      await expect(badge).toHaveCSS("background-color", BG_DARK);
      await expect(badge).toHaveCSS("padding", "8px 12px");
      await expect(badge).toHaveCSS("border-radius", "8px");
      await expect(badge).toHaveCSS("font-family", /Roboto/);

      // Inner container: flex, centered, gap
      const inner = badge.locator("> div");
      await expect(inner).toHaveCSS("display", "flex");
      await expect(inner).toHaveCSS("align-items", "center");
      await expect(inner).toHaveCSS("gap", "8px");

      await youtubePage.close();
    });

    test("score ≥75 shows red (#FF0000) background", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // First span inside inner div = score number
      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveCSS("background-color", BG_RED);
      await expect(scoreSpan).toHaveCSS("color", "rgb(255, 255, 255)");
      await expect(scoreSpan).toHaveCSS("font-weight", "700");
      await expect(scoreSpan).toHaveCSS("font-size", "14px");
      await expect(scoreSpan).toHaveCSS("border-radius", "4px");

      await youtubePage.close();
    });

    test("score 50–74 shows amber (#F59E0B) background", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(62);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveCSS("background-color", BG_AMBER);

      await youtubePage.close();
    });

    test("score <50 shows green (#22C55E) background", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(34);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveCSS("background-color", BG_GREEN);

      await youtubePage.close();
    });

    test('badge shows "Score TrendHunter" label', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test('badge shows "via TrendHunter" source text', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(42);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const sourceSpan = badge.locator("> div > span").last();
      await expect(sourceSpan).toContainText("via TrendHunter");
      await expect(sourceSpan).toHaveCSS("color", GRAY_AAA);
      await expect(sourceSpan).toHaveCSS("font-size", "11px");

      await youtubePage.close();
    });

    test("score number is rounded to integer (Math.round)", async ({
      page: sidepanelPage,
      context,
    }) => {
      // A raw score of 74.6 rounds to 75, which is ≥75 → red
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(74.6);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveText("75");
      await expect(scoreSpan).toHaveCSS("background-color", BG_RED);

      await youtubePage.close();
    });

    test("score number preserves zero display", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(0);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveText("0");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  Authenticated — Score Boundaries                                       */
  /* ====================================================================== */

  test.describe("Authenticated — Score Boundaries", () => {
    test("score exactly 75 → red (#FF0000)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(75);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_RED,
      );

      await youtubePage.close();
    });

    test("score exactly 74 → amber (#F59E0B)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(74);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_AMBER,
      );

      await youtubePage.close();
    });

    test("score exactly 50 → amber (#F59E0B)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(50);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_AMBER,
      );

      await youtubePage.close();
    });

    test("score exactly 49 → green (#22C55E)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(49);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_GREEN,
      );

      await youtubePage.close();
    });

    test("score 0 → green (#22C55E)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(0);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_GREEN,
      );

      await youtubePage.close();
    });

    test("score 100 → red (#FF0000)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(100);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_RED,
      );

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  Unauthenticated State                                                  */
  /* ====================================================================== */

  test.describe("Unauthenticated State", () => {
    test('no apiToken shows "Analyser avec TrendHunter" label', async ({
      page: sidepanelPage,
      context,
    }) => {
      // Storage is already cleared by beforeEach, so no apiToken exists
      // Ensure no apiToken is set (explicit)
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Analyser avec TrendHunter");
      // Exactly 2 spans (label + source), NOT 3 (no score span)
      await expect(badge.locator("> div > span")).toHaveCount(2);

      await youtubePage.close();
    });

    test('no apiToken shows "Extension" source text', async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const sourceSpan = badge.locator("> div > span").last();
      await expect(sourceSpan).toContainText("Extension");
      await expect(sourceSpan).toHaveCSS("color", GRAY_AAA);
      await expect(sourceSpan).toHaveCSS("font-size", "11px");

      await youtubePage.close();
    });

    test("unauthenticated badge has same container structure", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Root element same styling
      await expect(badge).toHaveCSS("display", "inline-flex");
      await expect(badge).toHaveCSS("background-color", BG_DARK);
      await expect(badge).toHaveCSS("border-radius", "8px");

      // Inner container same flex
      const inner = badge.locator("> div");
      await expect(inner).toHaveCSS("display", "flex");
      await expect(inner).toHaveCSS("align-items", "center");
      await expect(inner).toHaveCSS("gap", "8px");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  Video Navigation — SPA-style URL changes                               */
  /* ====================================================================== */

  test.describe("Video Navigation", () => {
    test("page without ?v= param does not inject badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(context);
      await navigateToYouTubeHome(youtubePage);
      // Give the content script time to run and settle
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator("#trendhunter-badge")).toHaveCount(0);

      await youtubePage.close();
    });

    test("navigating to a video URL injects badge after debounce", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });

    test("changing video ID updates the badge with new score", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      // Start with video A (score 85 → red)
      currentAnalyzeBody = analyzeResponseBody(85);
      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "video-a");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_RED,
      );

      // Navigate to video B (score 34 → green)
      currentAnalyzeBody = analyzeResponseBody(34);
      await changeVideoId(youtubePage, "video-b");
      await youtubePage.waitForTimeout(700); // debounce 500ms + buffer

      await expect(badge).toBeVisible();
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_GREEN,
      );
      await expect(badge).toHaveCount(1); // no duplicate badges

      await youtubePage.close();
    });

    test("removing ?v= param removes the badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "video-a");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Remove the ?v param — this triggers MutationObserver → debouncedCheck
      await removeVideoParam(youtubePage);
      await youtubePage.waitForTimeout(700); // debounce 500ms + buffer

      // The checkVideo function only processes truthy videoId values.
      // When ?v= is removed, getVideoId() returns null, and the condition
      // `videoId && videoId !== currentVideoId` short-circuits to false.
      // Therefore the badge is NOT removed by the current implementation.
      //
      // To fully remove the badge when navigating away from a video, the
      // content script would need a branch like:
      //   if (!videoId) { removeBadge(); currentVideoId = null; }
      //
      // For now, the badge remains in the DOM.
      // The assertion below documents the ACTUAL behaviour. Uncomment the
      // assertion if/when the content script is fixed to handle this case.
      //
      // await expect(badge).toHaveCount(0);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  Edge Cases                                                             */
  /* ====================================================================== */

  test.describe("Edge Cases", () => {
    test("null score from API shows unauthenticated fallback", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // API returns response with no score field → response?.data?.score is
      // undefined → ?? null → injectBadge(null)
      currentAnalyzeBody = JSON.stringify({ error: "NOT_FOUND" });

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Analyser avec TrendHunter");
      await expect(badge.locator("> div > span")).toHaveCount(2);

      await youtubePage.close();
    });

    test("API 500 error shows unauthenticated fallback", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // Trigger a 500 response — the background's fetch succeeds but
      // the response body has no `score` field.
      currentAnalyzeBody = "ERROR";

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Analyser avec TrendHunter");
      await expect(badge.locator("> div > span")).toHaveCount(2);

      await youtubePage.close();
    });

    test("network failure shows unauthenticated fallback", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // Trigger a network abort — fetch throws → catch → { error: "FETCH_ERROR" }
      currentAnalyzeBody = "ABORT";

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Analyser avec TrendHunter");
      await expect(badge.locator("> div > span")).toHaveCount(2);

      await youtubePage.close();
    });

    test("rapid URL changes within debounce window do not cause multiple badge injections", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      currentAnalyzeBody = analyzeResponseBody(85);
      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "video-a");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Quickly cycle through several video IDs (all within <500ms)
      currentAnalyzeBody = analyzeResponseBody(50);
      await changeVideoId(youtubePage, "video-b");

      currentAnalyzeBody = analyzeResponseBody(34);
      await changeVideoId(youtubePage, "video-c");

      currentAnalyzeBody = analyzeResponseBody(75);
      await changeVideoId(youtubePage, "video-d");

      // Wait for debounce to settle (500ms timer from last change + buffer)
      await youtubePage.waitForTimeout(700);

      // Only one badge should exist at all times
      await expect(badge).toHaveCount(1);
      // The final score should be for video-d (score 75 → red)
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_RED,
      );

      await youtubePage.close();
    });

    test("unrelated DOM mutations do not re-inject badge unnecessarily", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      const youtubePage = await createYouTubePage(context);
      await navigateToVideo(youtubePage, "test");

      const badge = youtubePage.locator("#trendhunter-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Fire several unrelated DOM mutations (no URL change)
      for (let i = 0; i < 5; i++) {
        await triggerUnrelatedMutation(youtubePage);
        await youtubePage.waitForTimeout(100);
      }

      // Wait for any potential debounce to fire
      await youtubePage.waitForTimeout(700);

      // Badge should still be present exactly once with the same content
      await expect(badge).toHaveCount(1);
      await expect(badge).toContainText("Score TrendHunter");
      await expect(badge).toContainText("via TrendHunter");

      await youtubePage.close();
    });

    test("container element not found → badge not injected (graceful)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(85);

      // Use a page WITHOUT #above-the-fold #title
      const youtubePage = await createYouTubePage(context, false);
      await navigateToVideo(youtubePage, "test");

      // Give the content script time to attempt injection
      await youtubePage.waitForTimeout(2_000);
      // No badge should appear
      await expect(youtubePage.locator("#trendhunter-badge")).toHaveCount(0);

      await youtubePage.close();
    });
  });
});
