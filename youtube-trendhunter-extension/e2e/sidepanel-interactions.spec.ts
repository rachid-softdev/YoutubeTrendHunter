import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  openSidepanel,
  clearStorage,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";

/* ================================================================
 * Sidepanel Interaction Details
 *
 * This file targets low-level user interaction behaviors that are
 * NOT tested in the existing suites:
 *   - sidepanel-auth.spec.ts          — basic auth flow
 *   - sidepanel-auth-hardened.spec.ts — auth edge cases
 *   - sidepanel-main.spec.ts          — main screen structure
 *   - sidepanel-main-hardened.spec.ts — main screen hardening
 *   - sidepanel-state-machine.spec.ts — state transitions & races
 *
 * Focus: keyboard typing, backspace, paste, button/link DOM
 * states, placeholder styling, auto-focus, fine-grained trend
 * card assertions, angle-toggle attributes, niche select edge
 * cases, and logout-button class verification.
 * ================================================================ */

// ── Types ─────────────────────────────────────────────────────────

interface MockTrend {
  id?: string;
  title?: string;
  keyword?: string;
  score: number;
  videoCount?: number | null;
  velocity?: number | null;
  contentAngles?: string[];
}

// ── Mutable mock state (used inside Main Screen describe blocks) ──

let mockNiches: Array<{ slug: string; name: string }> = MOCK_NICHES;
let mockTrends: MockTrend[] = MOCK_TRENDS;
let mockPlan = "FREE";

// ── Helpers ───────────────────────────────────────────────────────

/** Open the sidepanel and wait for the auth screen to become visible. */
async function openToAuth(page: Page, extensionId: string) {
  const sp = await openSidepanel(page, extensionId);
  await expect(sp.getAuthScreen()).toBeVisible({ timeout: 5000 });
  return sp;
}

/**
 * Open the sidepanel, connect with a test token, and wait for the
 * main screen to appear.  The caller MUST have set up API routes
 * (typically via test.beforeEach) BEFORE calling this helper.
 */
async function connectAndWaitForMain(page: Page, extensionId: string) {
  const sp = await openToAuth(page, extensionId);
  await sp.connect("th_interaction_token");
  await expect(sp.getMainScreen()).toBeVisible({ timeout: 8000 });
  return sp;
}

/* ================================================================
 * Auth Screen — Input Keyboard Interactions
 *
 * These tests validate low-level keystroke handling (typing each
 * character, backspace, clipboard paste, select-all + delete).
 * No existing test covers individual keystroke granularity.
 * ================================================================ */

test.describe("Auth Screen — Input Keyboard Interactions", () => {
  test("typing individual keystrokes into the token field builds the value correctly", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const input = sp.getTokenInput();

    // Click to focus, then type one key at a time
    await input.click();
    await page.keyboard.press("t");
    await page.keyboard.press("h");
    await page.keyboard.press("_");
    await page.keyboard.press("T");
    await page.keyboard.press("o");
    await page.keyboard.press("k");

    await expect(input).toHaveValue("th_Tok");
  });

  test("backspace key decrements the token field value by one character", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const input = sp.getTokenInput();

    await input.click();
    await input.fill("th_test_value");

    // Press Backspace three times
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    await expect(input).toHaveValue("th_test_va");
  });

  test("Ctrl+V keyboard shortcut pastes clipboard content into the token field", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const input = sp.getTokenInput();

    await input.click();

    // Write to the system clipboard from the secure extension context
    await page.evaluate(() =>
      navigator.clipboard.writeText("th_clipboard_paste_42"),
    );

    // Paste via keyboard shortcut
    await page.keyboard.press("Control+V");

    await expect(input).toHaveValue("th_clipboard_paste_42");
  });

  test("selecting all text via keyboard and pressing Delete empties the token field", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const input = sp.getTokenInput();

    await input.fill("th_selective_clear");

    // Select all then Delete
    await input.press("Control+a");
    await input.press("Delete");

    await expect(input).toHaveValue("");
  });
});

/* ================================================================
 * Auth Screen — Button & Link States
 *
 * Verifies the connect button is never disabled, the obtain-token
 * link can be reached via Tab, and pressing Enter on the focused
 * link does not cause crashes.
 * ================================================================ */

test.describe("Auth Screen — Button & Link States", () => {
  test("connect button never carries a disabled HTML attribute", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const btn = sp.getConnectButton();

    await expect(btn).toBeVisible();
    // The button is always enabled — validation is handled in the
    // form's onSubmit handler (e.preventDefault + trim check).
    await expect(btn).not.toHaveAttribute("disabled");
  });

  test("pressing Tab repeatedly eventually lands focus on the obtain-token link", async ({
    page,
    extensionId,
  }) => {
    await openToAuth(page, extensionId);

    // Tab through the page until the focused element is the
    // obtain-token link (or we exhaust 15 attempts).
    let focusedHref = "";
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      focusedHref = await page.evaluate(
        () => (document.activeElement as HTMLAnchorElement)?.href ?? "",
      );
      if (focusedHref.includes("trendhunter.app/billing")) break;
    }

    expect(focusedHref).toContain("trendhunter.app/billing");
  });

  test("pressing Enter on the focused obtain-token link triggers no page errors", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);

    // Collect page-level JS errors
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Focus the link directly
    await sp.getObtainTokenLink().focus();
    await expect(async () => {
      await page.keyboard.press("Enter");
    }).not.toThrow();

    // Small wait for any async side-effects to settle
    await page.waitForTimeout(300);
    expect(pageErrors).toHaveLength(0);
  });
});

/* ================================================================
 * Auth Screen — Input Behavior
 *
 * Covers ::placeholder styling and the absence of auto-focus.
 * ================================================================ */

test.describe("Auth Screen — Input Behavior", () => {
  test("placeholder pseudo-element has the gray #717171 text color", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);
    const input = sp.getTokenInput();

    const placeholderColor = await input.evaluate((el) => {
      const style = getComputedStyle(el, "::placeholder");
      return style.color;
    });

    // AuthScreen.css: .input-field::placeholder { color: #717171; }
    expect(placeholderColor).toBe("rgb(113, 113, 113)");
  });

  test("token input field is not the document's active element on mount", async ({
    page,
    extensionId,
  }) => {
    const sp = await openToAuth(page, extensionId);

    // The AuthScreen component does NOT set autoFocus on the input.
    // After the screen renders, the document's active element should
    // NOT be the token input.
    const activeElClass = await page.evaluate(
      () => document.activeElement?.className ?? "",
    );

    expect(activeElClass).not.toContain("input-field");
  });
});

/* ================================================================
 * Main Screen — Shared Setup
 *
 * Tests in this top-level describe block all exercise the main
 * screen and therefore need mocked API routes.
 * ================================================================ */

test.describe("Main Screen", () => {
  // ── Reusable mock state & route handler ──────────────────────

  test.beforeEach(async ({ context }) => {
    // Reset to sensible defaults
    mockNiches = MOCK_NICHES;
    mockTrends = MOCK_TRENDS;
    mockPlan = "FREE";

    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockNiches),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: mockTrends,
            plan: mockPlan,
          }),
        });
      }
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * Trend Card Classes & Scores
   *
   * Validates that every trend card is a div.trend-card, hot
   * cards carry trend-hot, and score badges have the correct
   * classification class and Math.round'ed text.
   * ───────────────────────────────────────────────────────────── */

  test.describe("Trend Card Classes & Scores", () => {
    test("every trend card is a div element bearing the trend-card CSS class", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "A", keyword: "a", score: 50, videoCount: 5, velocity: 2 },
        { id: "2", title: "B", keyword: "b", score: 80, videoCount: 10, velocity: 4 },
      ];
      const sp = await connectAndWaitForMain(page, extensionId);

      await expect(sp.getTrendCards()).toHaveCount(2);
      const cards = sp.getTrendCards();
      for (let i = 0; i < 2; i++) {
        const card = cards.nth(i);
        const tag = await card.evaluate((el) => el.tagName.toLowerCase());
        expect(tag).toBe("div");
        await expect(card).toHaveClass(/trend-card/);
      }
    });

    test("trend cards whose score is 75 or more carry the trend-hot modifier class", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Hot", keyword: "h", score: 92, videoCount: 10, velocity: 5 },
        { id: "2", title: "Cool", keyword: "c", score: 45, videoCount: 5, velocity: 2 },
      ];
      const sp = await connectAndWaitForMain(page, extensionId);

      await expect(sp.getTrendCards().nth(0)).toHaveClass(/trend-hot/);
      await expect(sp.getTrendCards().nth(1)).not.toHaveClass(/trend-hot/);
    });

    test("trend-score element includes exactly one score-hot/mid/low class", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "H", keyword: "h", score: 85, videoCount: 10, velocity: 5 },
        { id: "2", title: "M", keyword: "m", score: 60, videoCount: 10, velocity: 5 },
        { id: "3", title: "L", keyword: "l", score: 30, videoCount: 10, velocity: 5 },
      ];
      await connectAndWaitForMain(page, extensionId);

      const badges = page.locator(".trend-score");
      await expect(badges.nth(0)).toHaveClass(/score-hot/);
      await expect(badges.nth(1)).toHaveClass(/score-mid/);
      await expect(badges.nth(2)).toHaveClass(/score-low/);
    });

    test("trend-score text content equals Math.round of the original score value", async ({
      page,
      extensionId,
    }) => {
      // 74.6 → Math.round(74.6) = 75
      mockTrends = [
        { id: "1", title: "Decimal", keyword: "d", score: 74.6, videoCount: 10, velocity: 5 },
      ];
      await connectAndWaitForMain(page, extensionId);

      await expect(page.locator(".trend-score")).toHaveText("75");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * Title & Meta Fallbacks
   *
   * Covers the title fallback chain (title → keyword → Sans titre)
   * and null fallbacks for videoCount / velocity.
   * ───────────────────────────────────────────────────────────── */

  test.describe("Title & Meta Fallbacks", () => {
    test("trend title resolves through title then keyword then Sans titre fallback", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Regular Title", keyword: "reg", score: 50, videoCount: 5, velocity: 2 },
        { id: "2", title: null as unknown as string, keyword: "kw-fallback", score: 50, videoCount: 5, velocity: 2 },
        { id: "3", title: null as unknown as string, keyword: null as unknown as string, score: 50, videoCount: 5, velocity: 2 },
      ];
      await connectAndWaitForMain(page, extensionId);

      const titles = page.locator(".trend-title");
      await expect(titles.nth(0)).toHaveText("Regular Title");
      await expect(titles.nth(1)).toHaveText("kw-fallback");
      await expect(titles.nth(2)).toHaveText("Sans titre");
    });

    test("null videoCount displays a question mark instead of a number", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Null VC", keyword: "nvc", score: 50, videoCount: null as unknown as number, velocity: 10 },
      ];
      await connectAndWaitForMain(page, extensionId);

      await expect(page.locator(".trend-meta")).toContainText("?");
    });

    test("null velocity displays +0% as the fallback formatted value", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Null Vel", keyword: "nvel", score: 50, videoCount: 10, velocity: null as unknown as number },
      ];
      await connectAndWaitForMain(page, extensionId);

      await expect(page.locator(".trend-meta")).toContainText("+0%");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * Angle Toggle Details
   *
   * Covers type="button", aria-expanded state, chevron rotation
   * class, and pill expand/collapse.
   * ───────────────────────────────────────────────────────────── */

  test.describe("Angle Toggle Details", () => {
    test("angle-toggle button is declared with type=button to suppress form submit", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Type", keyword: "t", score: 50, videoCount: 5, velocity: 2, contentAngles: ["A"] },
      ];
      await connectAndWaitForMain(page, extensionId);

      await expect(page.locator(".angle-toggle")).toHaveAttribute("type", "button");
    });

    test("aria-expanded attribute toggles stepwise from false to true to false", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Aria", keyword: "a", score: 50, videoCount: 5, velocity: 2, contentAngles: ["X", "Y"] },
      ];
      await connectAndWaitForMain(page, extensionId);

      const toggle = page.locator(".angle-toggle");

      // Initial state: collapsed
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      // Click to expand
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      // Click to collapse
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    test("chevron icon receives and loses the chevron-open CSS class on toggle", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Chevron", keyword: "ch", score: 50, videoCount: 5, velocity: 2, contentAngles: ["A"] },
      ];
      await connectAndWaitForMain(page, extensionId);

      const chevron = page.locator(".angle-chevron");

      // Initially closed
      await expect(chevron).not.toHaveClass(/chevron-open/);

      // Expand
      await page.locator(".angle-toggle").click();
      await expect(chevron).toHaveClass(/chevron-open/);

      // Collapse
      await page.locator(".angle-toggle").click();
      await expect(chevron).not.toHaveClass(/chevron-open/);
    });

    test("angle-pills container appears on expand and vanishes on collapse", async ({
      page,
      extensionId,
    }) => {
      mockTrends = [
        { id: "1", title: "Pills", keyword: "p", score: 50, videoCount: 5, velocity: 2, contentAngles: ["Pill A", "Pill B"] },
      ];
      await connectAndWaitForMain(page, extensionId);

      const toggle = page.locator(".angle-toggle");

      // Before expand: no pills DOM element
      await expect(page.locator(".angle-pills")).toHaveCount(0);

      // Expand → pills visible with correct pill count
      await toggle.click();
      await expect(page.locator(".angle-pills")).toBeVisible();
      await expect(page.locator(".angle-pill")).toHaveCount(2);

      // Collapse → pills gone
      await toggle.click();
      await expect(page.locator(".angle-pills")).toHaveCount(0);
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * Logout Button Classes
   *
   * Verifies the logout button carries the exact CSS classes
   * declared in the source: btn, btn-ghost, logout-btn.
   * ───────────────────────────────────────────────────────────── */

  test.describe("Logout Button Classes", () => {
    test('logout button carries CSS classes btn btn-ghost and logout-btn', async ({
      page,
      extensionId,
    }) => {
      const sp = await connectAndWaitForMain(page, extensionId);
      const btn = sp.getLogoutButton();

      await expect(btn).toHaveClass("btn btn-ghost logout-btn");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * Niche Selector Edge Case
   *
   * When the stored selectedNiche slug does not match any option
   * in the niches list, the select holds that value but no option
   * element carries the selected attribute.
   * ───────────────────────────────────────────────────────────── */

  test.describe("Niche Selector Edge Case", () => {
    test("niche select holds an unmatched value when selectedNiche is not in the list", async ({
      page,
      extensionId,
    }) => {
      // Use a niche list that does NOT contain the stored value
      mockNiches = [
        { slug: "custom-a", name: "Custom A" },
        { slug: "custom-b", name: "Custom B" },
      ];
      mockTrends = [
        { id: "1", title: "Edge", keyword: "e", score: 50, videoCount: 5, velocity: 2 },
      ];

      // Pre-set the token AND a selectedNiche that doesn't match any slug
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.waitForSelector("#root");
      await page.evaluate(() =>
        new Promise<void>((resolve) => {
          chrome.storage.session.set(
            { apiToken: "th_edge_niche", selectedNiche: "missing-slug" },
            resolve,
          );
        }),
      );

      const sp = await openSidepanel(page, extensionId);
      await expect(sp.getMainScreen()).toBeVisible({ timeout: 8000 });

      // The select's HTML value is set to "missing-slug" even though no
      // option matches — the browser will show a blank/fallback selection.
      await expect(sp.getNicheSelect()).toHaveValue("missing-slug");

      // No option should carry the native `selected` property
      const selectedCount = await page.evaluate(() => {
        const select = document.querySelector(".niche-select") as HTMLSelectElement;
        if (!select) return -1;
        return Array.from(select.options).filter((o) => o.selected).length;
      });
      // When the value doesn't match any option, the select keeps the
      // value but no option has `selected = true`.
      expect(selectedCount).toBe(0);
    });
  });
});
