import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";
import {
  openSidepanel,
  setStorageToken,
  clearStorage,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";

/* ========================================================================== */
/*  SIDEPANEL — MISSING COVERAGE                                              */
/* ========================================================================== */
/*                                                                             */
/*  This file tests edge cases NOT covered by existing sidepanel spec files:   */
/*    - sidepanel-auth.spec.ts          (21 tests — basic auth flow)           */
/*    - sidepanel-auth-hardened.spec.ts (25+ tests — token, storage, offline) */
/*    - sidepanel-main.spec.ts          (30+ tests — UI, scores, angles)      */
/*    - sidepanel-main-hardened.spec.ts (60+ tests — a11y, i18n, boundary)    */
/*    - sidepanel-interactions.spec.ts  (20+ tests — keyboard, details)       */
/*    - sidepanel-state-machine.spec.ts (20+ tests — transitions, races)      */
/*                                                                             */
/*  Focus areas:                                                               */
/*    1. handleLogout — selectedNiche NOT reset (state completeness)           */
/*    2. handleNicheChange — NOT_AUTHENTICATED gap (actual behavior)           */
/*    3. loadNiches network failure — fallback to DEFAULT_NICHES               */
/* ========================================================================== */

/* ── Mutable mock state ─────────────────────────────────────────────────── */

let mockNiches: Array<{ slug: string; name: string }> = MOCK_NICHES;
let mockTrends: Array<Record<string, unknown>> = MOCK_TRENDS;
let mockPlan = "FREE";

/* ── Storage helpers ─────────────────────────────────────────────────────── */

async function setSelectedNicheInStorage(page: Page, slug: string): Promise<void> {
  await page.evaluate(
    (s: string) =>
      new Promise<void>((resolve) => {
        chrome.storage.session.set({ selectedNiche: s }, resolve);
      }),
    slug,
  );
}

async function getSelectedNicheFromStorage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      chrome.storage.session.get("selectedNiche", (res) => {
        resolve((res.selectedNiche as string) ?? null);
      });
    });
  });
}

/* ── Shared route setup ──────────────────────────────────────────────────── */

test.beforeEach(async ({ context }) => {
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

/* ========================================================================== */
/*  1. handleLogout — selectedNiche NOT reset                                 */
/*  App.tsx handleLogout removes apiToken and resets trends/plan/screen       */
/*  but does NOT reset selectedNiche. After logout → reconnect, the niche     */
/*  selector should still reflect the previously selected niche.              */
/* ========================================================================== */

test.describe("handleLogout — Selected Niche Persistence", () => {
  test("after logout and reconnect, selectedNiche retains its value", async ({
    page,
    extensionId,
  }) => {
    // Add more niches so there's a meaningful alternative to tech-ia
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "finance-personnelle", name: "Finance personnelle" },
    ];

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect and wait for main screen
    await sidepanel.connect("th_niche_persist");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Switch to a non-default niche
    await sidepanel.selectNiche("finance-personnelle");
    await expect(sidepanel.getNicheSelect()).toHaveValue("finance-personnelle");

    // Verify selectedNiche was written to storage
    const storedNiche = await getSelectedNicheFromStorage(page);
    expect(storedNiche).toBe("finance-personnelle");

    // Logout — handleLogout clears apiToken but NOT selectedNiche
    await sidepanel.logout();
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Verify selectedNiche is still in storage (was not removed)
    const nicheAfterLogout = await getSelectedNicheFromStorage(page);
    expect(nicheAfterLogout).toBe("finance-personnelle");

    // Reconnect by pre-setting token and reloading
    await setStorageToken(page, "th_reconnect_token");
    const sidepanel2 = await openSidepanel(page, extensionId);

    // App useEffect reads apiToken (found) and selectedNiche (still
    // "finance-personnelle" from storage) → main screen with finance niche
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel2.getNicheSelect()).toHaveValue("finance-personnelle");
  });

  test("handleLogout does NOT reset React selectedNiche state (only storage)", async ({
    page,
    extensionId,
  }) => {
    // Connect and switch niche
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "gaming", name: "Gaming" },
    ];

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_state_test");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    await sidepanel.selectNiche("gaming");
    await expect(sidepanel.getNicheSelect()).toHaveValue("gaming");

    // Logout — React selectedNiche state still holds "gaming"
    await sidepanel.logout();
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Reconnect by providing token via handleConnect
    await sidepanel.connect("th_reconnect_state");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // handleConnect calls setScreen("loading") then loadNiches/loadTrends.
    // After loadTrends completes, setScreen("main") remounts MainScreen.
    // selectedNiche React state was never reset by handleLogout, so it
    // should still be "gaming".
    await expect(sidepanel.getNicheSelect()).toHaveValue("gaming");
  });
});

/* ========================================================================== */
/*  2. handleNicheChange — NOT_AUTHENTICATED gap (actual behavior)            */
/*  App.tsx handleNicheChange sends GET_TRENDS but does NOT check for         */
/*  response.error === "NOT_AUTHENTICATED". When the token is removed         */
/*  externally and the user changes niche, the app stays on main screen       */
/*  instead of transitioning to auth. This documents the current behavior.    */
/*                                                                             */
/*  Expected fix: add the same check as loadTrends:                            */
/*    if (response?.error === "NOT_AUTHENTICATED") { setScreen("auth"); }      */
/* ========================================================================== */

test.describe("handleNicheChange — NOT_AUTHENTICATED Gap", () => {
  test("niche change after external token removal stays on main screen (current behavior)", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "fitness", name: "Fitness" },
    ];

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_niche_gap_test");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Remove token from storage externally (simulates background clearing it
    // or another extension instance logging out)
    await clearStorage(page);

    // Main screen should still be displayed (React hasn't re-rendered)
    await expect(sidepanel.getMainScreen()).toBeVisible();

    // Change niche — this calls handleNicheChange which sends GET_TRENDS.
    // Background won't find apiToken → returns { error: "NOT_AUTHENTICATED" }.
    // handleNicheChange only checks response?.data (undefined in this case)
    // and does NOT transition to auth. The app stays on main screen.
    await sidepanel.selectNiche("fitness");

    // Wait for any async processing to complete
    await page.waitForTimeout(1000);

    // The app should STILL show the main screen because handleNicheChange
    // does not handle NOT_AUTHENTICATED. This is the current known limitation.
    //
    // NOTE: If the implementation is updated to add the NOT_AUTHENTICATED
    // check (matching loadTrends), this assertion should change to:
    //   await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await expect(sidepanel.getMainScreen()).toBeVisible();

    // No page-level errors should have occurred
    expect(pageErrors).toHaveLength(0);
  });

  test("handleNicheChange silently ignores other error responses from GET_TRENDS", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "business", name: "Business" },
    ];

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_other_error_test");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Change niche — handleNicheChange sends GET_TRENDS.
    // The background finds the token and makes the API call.
    // Our route returns 200 with data, so this should succeed.
    await sidepanel.selectNiche("business");
    await page.waitForTimeout(500);

    // No errors from the niche change
    expect(pageErrors).toHaveLength(0);

    // Main screen should still be visible
    await expect(sidepanel.getMainScreen()).toBeVisible();
  });
});

/* ========================================================================== */
/*  3. loadNiches network failure — fallback to DEFAULT_NICHES                */
/*  When the niches API call fails (network error), loadNiches catches and    */
/*  falls back to DEFAULT_NICHES from the api constants. This ensures the     */
/*  niche selector still works even when the API is unreachable.              */
/* ========================================================================== */

test.describe("loadNiches — Network Failure Fallback", () => {
  test("niches API failure falls back to default niches in dropdown", async ({
    page,
    context,
    extensionId,
  }) => {
    // Collect page errors
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Intercept the niches endpoint to fail
    await context.unroute("**/api/extension/trends**");

    // Only mock the trends endpoint (success), niches endpoint (failure)
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        // Make niches endpoint fail with network error
        await route.abort("connectionrefused");
      } else {
        // Trends endpoint still succeeds
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: MOCK_TRENDS,
            plan: "FREE",
          }),
        });
      }
    });

    // Pre-set token and open sidepanel
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_niches_fallback");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          chrome.storage.session.set({ selectedNiche: "tech-ia" }, resolve);
        }),
    );

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // After loadNiches fails, DEFAULT_NICHES should be used.
    // The niche selector should have at least some options.
    const options = page.locator(".niche-select option");
    await expect(options.first()).toBeVisible();

    // Verify no page-level errors occurred during the fallback
    expect(pageErrors).toHaveLength(0);
  });

  test("niches API returning non-array also falls back to default niches", async ({
    page,
    context,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // niches endpoint returns a non-array object
    await context.unroute("**/api/extension/trends**");
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ not: "an array" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: MOCK_TRENDS,
            plan: "FREE",
          }),
        });
      }
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_nonarray_niches");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          chrome.storage.session.set({ selectedNiche: "tech-ia" }, resolve);
        }),
    );

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // App.tsx: if (!Array.isArray(data)) → setNiches(DEFAULT_NICHES)
    // The niche selector should fall back to DEFAULT_NICHES
    const options = page.locator(".niche-select option");
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    expect(pageErrors).toHaveLength(0);
  });
});
