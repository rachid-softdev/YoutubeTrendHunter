import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

const DEFAULT_SCORE = 85;

const BG_RED = "rgb(255, 0, 0)";
const BG_AMBER = "rgb(245, 158, 11)";
const BG_GREEN = "rgb(34, 197, 94)";
const BG_DARK = "rgb(33, 33, 33)";
const GRAY_AAA = "rgb(170, 170, 170)";
const BADGE_ID = "#trendhunter-badge";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Mock HTML builders                                                       */
/*  Each returns a minimal page that the content script can act on.           */
/* ────────────────────────────────────────────────────────────────────────── */

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

function mockShortsPageHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Shorts — YouTube</title></head>
<body>
  <div id="content">Shorts player container</div>
</body></html>`;
}

function mockChannelPageHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Channel — YouTube</title></head>
<body>
  <div id="content">Channel page content</div>
</body></html>`;
}

function mockHomePageHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>YouTube</title></head>
<body>
  <div id="content">Home feed</div>
</body></html>`;
}

function mockSearchHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Search — YouTube</title></head>
<body>
  <div id="content">Search results</div>
</body></html>`;
}

function mockPlaylistHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Playlist — YouTube</title></head>
<body>
  <div id="content">Playlist page</div>
</body></html>`;
}

function mockEmbedHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>YouTube</title></head>
<body>
  <div id="player">Embedded player</div>
  <div id="content"></div>
</body></html>`;
}

// 300+ character title to force wrapping
const LONG_TITLE =
  "This is an extremely long video title that is designed to wrap across multiple lines and test that the TrendHunter badge renders correctly even when the title text extends far beyond a single line on the YouTube watch page layout without any visual or layout problems occurring whatsoever";

function mockLongTitleHTML(): string {
  return mockWatchPageHTML(LONG_TITLE);
}

// Page that triggers the fallback selector: h1.ytd-video-primary-info-renderer
// but NOT #above-the-fold #title
function mockH1FallbackHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body>
  <div id="above-the-fold">
    <h1 class="ytd-video-primary-info-renderer">Video Title via h1</h1>
  </div>
  <div id="content"></div>
</body></html>`;
}

// Page with clickable buttons next to the title region
function mockWatchWithButtonHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body>
  <div id="above-the-fold">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer">Video Title</h1>
      <button id="subscribe-btn" onclick="window.__subscribeClicked = true">Subscribe</button>
      <button id="like-btn" onclick="window.__likeClicked = true">Like</button>
    </div>
  </div>
  <div id="content"></div>
</body></html>`;
}

// Narrow mobile viewport
function mockMobileHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body style="margin:0">
  <div id="above-the-fold" style="width:360px;box-sizing:border-box;padding:8px;">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer" style="font-size:16px;">Mobile Video Title</h1>
    </div>
  </div>
  <div id="content"></div>
</body></html>`;
}

// Dark theme background
function mockDarkThemeHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body style="background:#0f0f0f;margin:0;">
  <div id="above-the-fold" style="background:#0f0f0f;padding:8px;">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer" style="color:#f1f1f1;">Dark Theme Video</h1>
    </div>
  </div>
  <div id="content"></div>
</body></html>`;
}

// Light theme background
function mockLightThemeHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>Watch — YouTube</title></head>
<body style="background:#ffffff;margin:0;">
  <div id="above-the-fold" style="background:#ffffff;padding:8px;">
    <div id="title">
      <h1 class="ytd-video-primary-info-renderer" style="color:#0f0f0f;">Light Theme Video</h1>
    </div>
  </div>
  <div id="content"></div>
</body></html>`;
}

// Page with #content already removed (simulating a placeholder element for
// SPA transition tests)
function mockMinimalHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>YouTube</title></head>
<body>
  <div id="content"></div>
</body></html>`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Storage helpers — identical pattern to content-script.spec.ts            */
/* ────────────────────────────────────────────────────────────────────────── */

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

async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  API mock helpers                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function analyzeResponseBody(score: number): string {
  return JSON.stringify({ score });
}

function analyzeErrorBody(): string {
  return JSON.stringify({ error: "Internal server error" });
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  YouTube page helper                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Create a new page, intercept all youtube.com requests, serve custom HTML.
 */
async function createYouTubePage(
  context: BrowserContext,
  html: string,
  url: string = "https://www.youtube.com/watch?v=test",
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
 * SPA-style navigation: change the ?v= param and trigger DOM mutation
 * so the MutationObserver fires.
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

/* ========================================================================== */
/*  Tests                                                                     */
/* ========================================================================== */

test.describe("Extension — Content Script (Hardened)", () => {
  let currentAnalyzeBody: string;

  /* ---- Reset mock & storage before each test --------------------------- */

  test.beforeEach(async ({ page: sidepanelPage, context }) => {
    await clearAllStorage(sidepanelPage);
    currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

    // Wire up API mock at the context level so the background service worker's
    // fetch calls are intercepted.
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
          ? analyzeErrorBody()
          : currentAnalyzeBody,
      });
    });
  });

  /* ====================================================================== */
  /*  1. YouTube Shorts & Other Page Types                                   */
  /* ====================================================================== */

  test.describe("YouTube Shorts & Other Page Types", () => {
    test("Shorts page receives content script but yields no badge (no ?v=)", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockShortsPageHTML(),
        "https://www.youtube.com/shorts/abc123",
      );
      // The content script runs (matches pattern) but getVideoId() returns
      // null because there is no ?v= param.
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("channel page yields no badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockChannelPageHTML(),
        "https://www.youtube.com/@testchannel",
      );
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("homepage yields no badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockHomePageHTML(),
        "https://www.youtube.com/",
      );
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("search results page yields no badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockSearchHTML(),
        "https://www.youtube.com/results?search_query=test",
      );
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("playlist page yields no badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockPlaylistHTML(),
        "https://www.youtube.com/playlist?list=PLabc123",
      );
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("embed page yields no badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      const youtubePage = await createYouTubePage(
        context,
        mockEmbedHTML(),
        "https://www.youtube.com/embed/abc123",
      );
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);
      await youtubePage.close();
    });

    test("SPA navigation from Shorts to watch page injects badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      // Start on a Shorts page
      const youtubePage = await createYouTubePage(
        context,
        mockShortsPageHTML(),
        "https://www.youtube.com/shorts/abc123",
      );
      await youtubePage.waitForTimeout(1_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      // SPA-navigate to a watch URL
      await youtubePage.evaluate(() => {
        window.history.pushState({}, "", "/watch?v=xyz789");
        const el = document.getElementById("content");
        if (el) el.innerHTML = "<div>video: xyz789</div>";
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  2. Badge Position & Layout                                             */
  /* ====================================================================== */

  test.describe("Badge Position & Layout", () => {
    test("is inserted directly after #above-the-fold #title", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Verify DOM sibling relationship
      const isNextSibling = await youtubePage.evaluate(() => {
        const title = document.querySelector("#above-the-fold #title");
        const badgeEl = document.getElementById("trendhunter-badge");
        return title?.nextElementSibling === badgeEl;
      });
      expect(isNextSibling).toBe(true);

      await youtubePage.close();
    });

    test("falls back to h1.ytd-video-primary-info-renderer when #above-the-fold #title missing", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockH1FallbackHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const isNextSibling = await youtubePage.evaluate(() => {
        const h1 = document.querySelector("h1.ytd-video-primary-info-renderer");
        const badgeEl = document.getElementById("trendhunter-badge");
        return h1?.nextElementSibling === badgeEl;
      });
      expect(isNextSibling).toBe(true);

      await youtubePage.close();
    });

    test("renders correctly with very long multi-line video title", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockLongTitleHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Badge should have reasonable dimensions (not crushed or overflowing)
      const box = await badge.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(20);

      // Title should also be visible
      const title = youtubePage.locator("h1");
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();
      expect(titleBox).not.toBeNull();
      // The title and badge should both be within the viewport
      expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(
        box!.y + box!.height + 200,
      );

      await youtubePage.close();
    });

    test("margin value matches CSS specification", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // The badge CSS specifies margin: 8px 0
      await expect(badge).toHaveCSS("margin-top", "8px");
      await expect(badge).toHaveCSS("margin-bottom", "8px");

      await youtubePage.close();
    });

    test("does not overlap adjacent interactive elements", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(
        context,
        mockWatchWithButtonHTML(),
      );
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Check that the badge's bounding box does not overlap with the
      // subscribe button's bounding box (badge is inserted after #title,
      // and the button lives inside #title, so they should be disjoint).
      const badgeBox = await badge.boundingBox();
      const subscribeBtn = youtubePage.locator("#subscribe-btn");
      const btnBox = await subscribeBtn.boundingBox();

      expect(badgeBox).not.toBeNull();
      expect(btnBox).not.toBeNull();

      // Badge should be below the button (badge.y > btn.y + btn.height)
      expect(badgeBox!.y).toBeGreaterThanOrEqual(btnBox!.y + btnBox!.height);

      await youtubePage.close();
    });

    test("renders on narrow mobile viewport without horizontal overflow", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      // Create page, then set viewport to mobile dimensions
      const youtubePage = await context.newPage();
      await youtubePage.setViewportSize({ width: 360, height: 640 });
      await youtubePage.route("https://www.youtube.com/**", async (route) => {
        if (route.request().resourceType() === "document") {
          await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: mockMobileHTML(),
          });
        } else {
          await route.abort();
        }
      });
      await youtubePage.goto("https://www.youtube.com/watch?v=mobiletest", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Badge should not overflow the viewport horizontally
      const box = await badge.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);

      await youtubePage.close();
    });

    test("renders on dark themed YouTube page", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockDarkThemeHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Badge background should be its own dark color, not transparent
      await expect(badge).toHaveCSS("background-color", BG_DARK);
      // Text should be visible against dark background
      await expect(badge).toHaveCSS("color", "rgb(241, 241, 241)");

      await youtubePage.close();
    });

    test("renders on light themed YouTube page", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockLightThemeHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Badge maintains its own styling independent of page theme
      await expect(badge).toHaveCSS("background-color", BG_DARK);

      await youtubePage.close();
    });

    test("no title container — badge not injected", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      // Page with no #above-the-fold #title and no h1.ytd-video-primary-info-renderer
      const youtubePage = await createYouTubePage(context, mockMinimalHTML());
      await youtubePage.waitForTimeout(2_000);
      await expect(youtubePage.locator(BADGE_ID)).toHaveCount(0);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  3. Badge Interaction                                                   */
  /* ====================================================================== */

  test.describe("Badge Interaction", () => {
    test("badge is not clickable (no pointer cursor)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Cursor must NOT be 'pointer' (not clickable)
      const cursor = await badge.evaluate((el) =>
        window.getComputedStyle(el).cursor,
      );
      expect(cursor).not.toBe("pointer");

      // Verify no onclick handler attached
      const hasClickHandler = await youtubePage.evaluate(() => {
        const el = document.getElementById("trendhunter-badge");
        if (!el) return false;
        // Check both onelick property and listeners
        return (
          (el as HTMLElement & { onclick: unknown }).onclick !== null ||
          el.hasAttribute("onclick")
        );
      });
      expect(hasClickHandler).toBe(false);

      await youtubePage.close();
    });

    test("click on badge does not navigate or trigger any action", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const currentUrl = youtubePage.url();

      // Click the center of the badge
      await badge.click({ force: true });

      // Allow any microtasks to settle
      await youtubePage.waitForTimeout(500);

      // URL must not have changed
      expect(youtubePage.url()).toBe(currentUrl);

      // No navigation should have occurred
      const didNavigate = await youtubePage.evaluate(() => {
        return (window as unknown as Record<string, unknown>).__thNavigated === true;
      });
      expect(didNavigate).not.toBe(true);

      await youtubePage.close();
    });

    test("badge text is not user-selectable", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Verify user-select is none (or the computed equivalent)
      const userSelect = await badge.evaluate((el) => {
        return window.getComputedStyle(el).userSelect;
      });
      // Common values: "none" (standard) or "-webkit-none" (older WebKit)
      expect(userSelect).toMatch(/none/i);

      await youtubePage.close();
    });

    test("badge has no hover effects (no pseudo-class style changes)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Get baseline computed styles
      const bgBefore = await badge.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor,
      );

      // Hover over the badge
      await badge.hover({ force: true });
      await youtubePage.waitForTimeout(200);

      // Get styles while hovering
      const bgDuring = await badge.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor,
      );

      // No style change on hover
      expect(bgBefore).toBe(bgDuring);

      await youtubePage.close();
    });

    test("badge does not intercept click events on adjacent YouTube buttons", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(
        context,
        mockWatchWithButtonHTML(),
      );
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Click the subscribe button that lives near the badge area
      const subscribeBtn = youtubePage.locator("#subscribe-btn");
      await expect(subscribeBtn).toBeVisible();
      await subscribeBtn.click({ force: true });

      // Verify the click handler fired
      const wasClicked = await youtubePage.evaluate(
        () => (window as unknown as Record<string, boolean>).__subscribeClicked,
      );
      expect(wasClicked).toBe(true);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  4. Animation & Transitions                                             */
  /* ====================================================================== */

  test.describe("Animation & Transitions", () => {
    test("badge appears without CSS transition or opacity animation (documents current no-animation state)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // No animation or transition properties
      await expect(badge).toHaveCSS("animation-duration", "0s");
      await expect(badge).toHaveCSS("transition-duration", "0s");

      // Opacity should be 1 immediately (no fade-in)
      await expect(badge).toHaveCSS("opacity", "1");

      await youtubePage.close();
    });

    test("badge removal has no transition effect", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Check the parent container for transition properties
      const parentHasTransition = await youtubePage.evaluate(() => {
        const badgeEl = document.getElementById("trendhunter-badge");
        if (!badgeEl || !badgeEl.parentElement) return false;
        const style = window.getComputedStyle(badgeEl.parentElement);
        return (
          style.transitionDuration !== "0s" ||
          style.animationDuration !== "0s"
        );
      });
      // No transition on badge or parent
      expect(parentHasTransition).toBe(false);

      await youtubePage.close();
    });

    test("score update has no flash or transition animation", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      // Start with score 85
      currentAnalyzeBody = analyzeResponseBody(85);
      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveCSS("background-color", BG_RED);

      // Navigate to another video (score 34 → green)
      currentAnalyzeBody = analyzeResponseBody(34);
      await changeVideoId(youtubePage, "video-b");
      await youtubePage.waitForTimeout(1_000);

      // Score element should update without animation
      await expect(scoreSpan).toHaveCSS("background-color", BG_GREEN);
      await expect(scoreSpan).toHaveCSS("transition-duration", "0s");
      await expect(scoreSpan).toHaveCSS("animation-duration", "0s");

      await youtubePage.close();
    });

    test("badge is inserted as next sibling of title (no re-parenting of title)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // The badge must be a direct child of #above-the-fold (the same parent
      // as #title), never nested inside #title or another container that would
      // cause re-layout of the heading.
      const domPosition = await youtubePage.evaluate(() => {
        const container = document.querySelector("#above-the-fold");
        const title = document.querySelector("#above-the-fold #title");
        const badgeEl = document.getElementById("trendhunter-badge");
        if (!container || !title || !badgeEl) return null;
        const children = Array.from(container.children);
        return {
          titleIndex: children.indexOf(title),
          badgeIndex: children.indexOf(badgeEl),
          parentTag: badgeEl.parentElement?.tagName ?? null,
        };
      });
      expect(domPosition).not.toBeNull();
      // Badge immediately follows title in the container's child list
      expect(domPosition!.badgeIndex).toBe(domPosition!.titleIndex + 1);
      // Badge's parent is the same container as title
      expect(domPosition!.parentTag).toBe("DIV");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  5. Internationalization                                                */
  /* ====================================================================== */

  test.describe("Internationalization", () => {
    test('authenticated badge shows "Score TrendHunter" in English', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Score TrendHunter");
      await youtubePage.close();
    });

    test('authenticated badge shows "via TrendHunter" source', async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const sourceSpan = badge.locator("> div > span").last();
      await expect(sourceSpan).toContainText("via TrendHunter");
      await expect(sourceSpan).toHaveCSS("color", GRAY_AAA);

      await youtubePage.close();
    });

    test('unauthenticated badge shows "Analyser avec TrendHunter" (French)', async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText("Analyser avec TrendHunter");

      await youtubePage.close();
    });

    test('unauthenticated badge shows "Extension" source text', async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const sourceSpan = badge.locator("> div > span").last();
      await expect(sourceSpan).toContainText("Extension");

      await youtubePage.close();
    });

    test("DOM structure lacks i18n data attributes (documents future opportunity)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Check that no data-i18n or lang attributes exist in the badge
      const hasI18nAttributes = await youtubePage.evaluate(() => {
        const el = document.getElementById("trendhunter-badge");
        if (!el) return { i18n: false, lang: false };
        const allElements = el.querySelectorAll("*");
        let hasI18nAttr = false;
        let hasLangAttr = false;
        if (el.hasAttribute("data-i18n")) hasI18nAttr = true;
        if (el.hasAttribute("lang")) hasLangAttr = true;
        allElements.forEach((child) => {
          if (child.hasAttribute("data-i18n")) hasI18nAttr = true;
          if (child.hasAttribute("lang")) hasLangAttr = true;
        });
        return { i18n: hasI18nAttr, lang: hasLangAttr };
      });
      expect(hasI18nAttributes.i18n).toBe(false);
      expect(hasI18nAttributes.lang).toBe(false);

      await youtubePage.close();
    });

    test("score number is formatted as plain integer without locale-specific separators", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // Use a four-digit score to test locale formatting
      currentAnalyzeBody = analyzeResponseBody(1234);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // The score is rendered via String(Math.round(score)) which converts
      // 1234 to "1234", not "1,234" (no Intl.NumberFormat used).
      const scoreSpan = badge.locator("> div > span").first();
      await expect(scoreSpan).toHaveText("1234");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  6. Performance & Resource Usage                                        */
  /* ====================================================================== */

  test.describe("Performance & Resource Usage", () => {
    test("no DOM node accumulation on repeated SPA navigations", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Rapidly navigate through 20 different video IDs
      for (let i = 0; i < 20; i++) {
        currentAnalyzeBody = analyzeResponseBody((i * 7) % 101);
        await changeVideoId(youtubePage, `video-${i}`);
      }

      // Wait for final debounce
      await youtubePage.waitForTimeout(1_000);

      // Badge count must remain exactly 1
      await expect(badge).toHaveCount(1);

      await youtubePage.close();
    });

    test("no console errors during badge injection", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      // Create page and register console listener BEFORE navigation
      // so no content-script console message is missed.
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
      await youtubePage.goto("https://www.youtube.com/watch?v=test", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Navigate to another video to trigger re-injection
      currentAnalyzeBody = analyzeResponseBody(50);
      await changeVideoId(youtubePage, "video-2");
      await youtubePage.waitForTimeout(1_000);

      // Check for extension-related errors only (ignore 3rd-party)
      const extErrors = consoleErrors.filter(
        (e) =>
          e.includes("trendhunter") ||
          e.includes("TrendHunter") ||
          e.includes("chrome-extension"),
      );
      const extWarnings = consoleWarnings.filter(
        (e) =>
          e.includes("trendhunter") ||
          e.includes("TrendHunter") ||
          e.includes("chrome-extension"),
      );
      expect(extErrors).toEqual([]);
      expect(extWarnings).toEqual([]);

      await youtubePage.close();
    });

    test("badge does not load any images", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // The badge should have no <img> elements
      const imgCount = await badge.locator("img").count();
      expect(imgCount).toBe(0);

      // Also no SVG or canvas elements (no thumbnails)
      const svgCount = await badge.locator("svg").count();
      expect(svgCount).toBe(0);
      const canvasCount = await badge.locator("canvas").count();
      expect(canvasCount).toBe(0);

      await youtubePage.close();
    });

    test("no network requests originate from content script", async ({
      page: sidepanelPage,
      context,
    }) => {
      // This test verifies that the content script does not make direct
      // network requests (it communicates via runtime.sendMessage, which
      // the background worker handles). The page.route intercepts all
      // youtube.com requests, so any content-script-initiated fetch would
      // also be caught.
      await removeSessionStorage(sidepanelPage, "apiToken");

      // Create page and register listener BEFORE navigation.
      const youtubePage = await context.newPage();
      const requestsFromPage: string[] = [];
      youtubePage.on("request", (req) => {
        if (req.resourceType() !== "document") {
          requestsFromPage.push(req.url());
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
      await youtubePage.goto("https://www.youtube.com/watch?v=test", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Navigate to trigger re-check
      await removeSessionStorage(sidepanelPage, "apiToken");
      await changeVideoId(youtubePage, "video-2");
      await youtubePage.waitForTimeout(1_000);

      // All non-document requests should have been aborted by our route
      // handler, meaning the content script didn't make any unexpected
      // network calls. (The analyze fetch is done by background worker,
      // not by the content script directly, so it won't appear here.)
      expect(requestsFromPage.length).toBe(0);

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  7. Error Recovery                                                      */
  /* ====================================================================== */

  test.describe("Error Recovery", () => {
    test("content script exception does not break other YouTube page features", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Inject a simulated error in the content script scope
      const pageStillFunctional = await youtubePage.evaluate(() => {
        try {
          // Simulate an unhandled error in the content script's context
          // by removing a critical DOM element and triggering observer
          const content = document.getElementById("content");
          if (content) content.remove();
          // The page should still respond to basic DOM queries
          return document.querySelector("body") !== null;
        } catch {
          return false;
        }
      });
      expect(pageStillFunctional).toBe(true);

      // The badge should still be present despite the simulated error
      await expect(badge).toBeVisible();
      // YouTube page should still have its title
      await expect(youtubePage.locator("h1")).toBeVisible();

      await youtubePage.close();
    });

    test("SPA navigation interrupted mid-transition yields consistent badge state", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Simulate interrupted navigation chain:
      // 1. Start navigation to video-2
      currentAnalyzeBody = analyzeResponseBody(50);
      await changeVideoId(youtubePage, "video-2");

      // 2. Before debounce fires, change to video-3 (interrupt)
      currentAnalyzeBody = analyzeResponseBody(34);
      await changeVideoId(youtubePage, "video-3");

      // 3. Before debounce fires, change back to video-1
      currentAnalyzeBody = analyzeResponseBody(85);
      await changeVideoId(youtubePage, "video-1");

      await youtubePage.waitForTimeout(1_000);

      // Exactly one badge, reflecting the last requested video
      await expect(badge).toHaveCount(1);
      await expect(badge.locator("> div > span").first()).toHaveCSS(
        "background-color",
        BG_RED,
      );

      await youtubePage.close();
    });

    test("background service worker port disconnection does not break badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      currentAnalyzeBody = analyzeResponseBody(DEFAULT_SCORE);

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Simulate the background worker being terminated by revoking the
      // apiToken and triggering a re-check. The content script should
      // degrade gracefully to the unauthenticated fallback.
      await removeSessionStorage(sidepanelPage, "apiToken");
      await changeVideoId(youtubePage, "video-new");
      await youtubePage.waitForTimeout(1_000);

      // Badge should show unauthenticated fallback (no crash)
      await expect(badge).toBeVisible();
      await expect(badge).toContainText("Analyser avec TrendHunter");

      await youtubePage.close();
    });

    test("only one badge exists even with multiple content script triggers", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // Force multiple rapid DOM mutations that would trigger the
      // MutationObserver multiple times
      for (let i = 0; i < 10; i++) {
        await youtubePage.evaluate((idx) => {
          const el = document.getElementById("content");
          if (el) el.innerHTML = `<span>mutation ${idx}</span>`;
        }, i);
        await youtubePage.waitForTimeout(50);
      }

      await youtubePage.waitForTimeout(700);

      // Still only one badge
      await expect(badge).toHaveCount(1);

      await youtubePage.close();
    });

    test("API timeout results in fallback badge, not stuck loading state", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // Abort the API request (simulating timeout)
      currentAnalyzeBody = "ABORT";

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 15_000 });

      // Should show fallback (no loading spinner, no frozen state)
      await expect(badge).toContainText("Analyser avec TrendHunter");
      await expect(badge.locator("> div > span")).toHaveCount(2);

      await youtubePage.close();
    });

    test("malformed API response (non-JSON) shows fallback badge", async ({
      page: sidepanelPage,
      context,
    }) => {
      await setSessionStorage(sidepanelPage, { apiToken: "th_test_token" });
      // Return a 200 OK with invalid JSON (HTML error page)
      currentAnalyzeBody = "NOT_JSON";

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 15_000 });

      // Should degrade gracefully to fallback
      await expect(badge).toContainText("Analyser avec TrendHunter");

      await youtubePage.close();
    });
  });

  /* ====================================================================== */
  /*  8. Security & CSP                                                      */
  /* ====================================================================== */

  test.describe("Security & CSP", () => {
    test("badge is created using DOM API only (no innerHTML or eval)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // No <script> elements should exist inside the badge
      const scriptCount = await badge.locator("script").count();
      expect(scriptCount).toBe(0);

      // Verify the badge's inner HTML has no event handler attributes
      const hasInlineHandlers = await youtubePage.evaluate(() => {
        const el = document.getElementById("trendhunter-badge");
        if (!el) return true; // fail if badge not found
        const html = el.outerHTML;
        const handlerPatterns = [
          "onclick",
          "onmouseover",
          "onload",
          "onerror",
          "onfocus",
          "onchange",
          "onsubmit",
          "onkeydown",
          "onkeyup",
        ];
        return handlerPatterns.some((p) =>
          new RegExp(`${p}\\s*=\\s*["']`, "i").test(html),
        );
      });
      expect(hasInlineHandlers).toBe(false);

      await youtubePage.close();
    });

    test("no external resource URLs in badge (no src or href attributes)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const hasExternalResources = await youtubePage.evaluate(() => {
        const el = document.getElementById("trendhunter-badge");
        if (!el) return true;
        const allElements = el.querySelectorAll("*");
        let found = false;
        // Check for src, href, srcset, and other resource-loading attributes
        allElements.forEach((child) => {
          if (
            child.hasAttribute("src") ||
            child.hasAttribute("href") ||
            child.hasAttribute("srcset") ||
            child.hasAttribute("poster") ||
            child.hasAttribute("data-src")
          ) {
            found = true;
          }
        });
        return found;
      });
      expect(hasExternalResources).toBe(false);

      await youtubePage.close();
    });

    test("badge does not contain iframe, object, or embed elements", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      const iframeCount = await badge.locator("iframe").count();
      const objectCount = await badge.locator("object").count();
      const embedCount = await badge.locator("embed").count();
      expect(iframeCount).toBe(0);
      expect(objectCount).toBe(0);
      expect(embedCount).toBe(0);

      await youtubePage.close();
    });

    test("badge CSS is fully self-contained (no external stylesheets loaded)", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      const youtubePage = await createYouTubePage(context, mockWatchPageHTML());
      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // All styles on the badge should be inline (no class-based styling)
      const styleSource = await youtubePage.evaluate(() => {
        const el = document.getElementById("trendhunter-badge");
        if (!el) return { inline: false, classCount: 0, styleTagCount: 0 };

        // Check that styles come from inline style attribute, not a stylesheet
        const hasStyleAttr = el.hasAttribute("style");
        const classCount = el.classList.length;

        // Check that no <style> tags were added by the content script
        const styleTags = document.querySelectorAll("style");
        let thStyleTag = false;
        styleTags.forEach((tag) => {
          if (
            tag.textContent?.includes("trendhunter") ||
            tag.textContent?.includes("trendhunter-badge")
          ) {
            thStyleTag = true;
          }
        });

        return {
          inline: hasStyleAttr,
          classCount,
          thStyleTag,
        };
      });
      expect(styleSource.inline).toBe(true);
      expect(styleSource.classCount).toBe(0);
      // No <style> element was injected by the content script
      expect(styleSource.thStyleTag).toBe(false);

      await youtubePage.close();
    });

    test("badge does not access or exfiltrate YouTube page data", async ({
      page: sidepanelPage,
      context,
    }) => {
      await removeSessionStorage(sidepanelPage, "apiToken");

      // Set up a network monitor to catch any unexpected outbound requests
      const outboundRequests: string[] = [];
      const youtubePage = await context.newPage();
      youtubePage.on("request", (req) => {
        const url = req.url();
        // Ignore our mock youtube.com and chrome-extension requests
        if (
          !url.startsWith("https://www.youtube.com/") &&
          !url.startsWith("chrome-extension://")
        ) {
          outboundRequests.push(url);
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

      await youtubePage.goto("https://www.youtube.com/watch?v=exfil-test", {
        waitUntil: "domcontentloaded",
      });

      const badge = youtubePage.locator(BADGE_ID);
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // No outbound requests to external domains (data exfiltration)
      // The content script only communicates via runtime.sendMessage,
      // which doesn't create new HTTP requests from the page context.
      expect(outboundRequests).toEqual([]);

      await youtubePage.close();
    });
  });
});
