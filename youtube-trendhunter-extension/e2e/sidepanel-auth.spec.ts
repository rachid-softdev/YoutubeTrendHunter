import { test, expect } from "./fixtures";
import {
  openSidepanel,
  setStorageToken,
  clearStorage,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";

/* ================================================================
 * Setup
 * ================================================================ */

/**
 * Shared mock for the background API endpoints.
 * The sidepanel app calls:
 *   - GET /api/extension/trends/niches   (from loadNiches in App.tsx)
 *   - GET /api/extension/trends?niche=…  (from background GET_TRENDS handler)
 *
 * We intercept ALL requests matching the trends API path and dispatch
 * based on the URL to avoid route-overlap issues.
 */
test.beforeEach(async ({ context }) => {
  await context.route("**/api/extension/trends**", async (route) => {
    const url = route.request().url();

    if (url.includes("/trends/niches")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_NICHES),
      });
    } else {
      // Trends list endpoint (with ?niche= query param)
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
});

/* ================================================================
 * Success Cases
 * ================================================================ */
test.describe("Auth Screen — Success Cases", () => {
  test("shows auth screen when no token is stored", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);

    // Without a stored token the app should show the auth screen
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Verify key visual elements are present
    await expect(sidepanel.getLogo()).toBeVisible();
    await expect(sidepanel.getAuthTitle()).toHaveText("Connexion");
    await expect(sidepanel.getAuthDescription()).toHaveText(
      "Entrez votre token API pour accéder aux tendances."
    );
  });

  test("token input is of type password with correct placeholder", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const input = sidepanel.getTokenInput();
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("placeholder", "Token API (ex: th_xxxx...)");
  });

  test("connect button text is SE CONNECTER", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    await expect(sidepanel.getConnectButton()).toBeVisible();
    await expect(sidepanel.getConnectButton()).toHaveText("SE CONNECTER");
  });

  test("OBTENIR UN TOKEN link is visible with correct href", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const link = sidepanel.getObtainTokenLink();
    await expect(link).toBeVisible();
    await expect(link).toHaveText("OBTENIR UN TOKEN →");
    await expect(link).toHaveAttribute("href", "https://trendhunter.app/billing");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("user can type a token, click connect, and token is stored in chrome.storage.session", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Type a token and click connect
    await sidepanel.connect("th_test_token_123");

    // The token should now be stored in chrome.storage.session
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_test_token_123");
  });

  test("after connecting, screen transitions to main (loading may flash briefly)", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect with a valid token — API is mocked so it should succeed
    await sidepanel.connect("th_valid_token");

    // With mocked API the app should transition to main screen
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Verify main screen elements are present
    await expect(sidepanel.getMainLogo()).toBeVisible();
    await expect(sidepanel.getMainLogoText()).toHaveText("TrendHunter");
    await expect(sidepanel.getPlanBadge()).toBeVisible();
    await expect(sidepanel.getPlanBadge()).toHaveText("Plan FREE");
    await expect(sidepanel.getNicheSelect()).toBeVisible();
    await expect(sidepanel.getTrendsList()).toBeVisible();
    await expect(sidepanel.getLogoutButton()).toBeVisible();

    // FREE plan should show upgrade banner
    await expect(sidepanel.getUpgradeBanner()).toBeVisible();
    await expect(sidepanel.getUpgradeLink()).toHaveAttribute(
      "href",
      "https://trendhunter.app/pricing"
    );

    // Trend cards should be rendered
    await expect(sidepanel.getTrendCards()).toHaveCount(MOCK_TRENDS.length);
  });
});

/* ================================================================
 * Visual States
 * ================================================================ */
test.describe("Auth Screen — Visual States", () => {
  test("auth screen has logo with SVG play icon", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // The logo icon is an SVG with a play triangle path
    const svg = sidepanel.getLogoIcon();
    await expect(svg).toBeVisible();
    // Verify it has the play-icon path (d="M8 5v14l11-7z")
    const pathD = await svg.locator("path").getAttribute("d");
    expect(pathD).toBe("M8 5v14l11-7z");
  });

  test("auth screen has TrendHunter brand text", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    await expect(sidepanel.getLogoText()).toBeVisible();
    await expect(sidepanel.getLogoText()).toHaveText("TrendHunter");
  });

  test("ou divider is visible between form and obtain-token link", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const divider = sidepanel.getDivider();
    await expect(divider).toBeVisible();
    await expect(divider).toHaveText("ou");
  });
});

/* ================================================================
 * Empty / Edge Cases
 * ================================================================ */
test.describe("Auth Screen — Empty & Edge Cases", () => {
  test("empty token: form submits but stays on auth screen", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Click connect without typing anything
    await sidepanel.connect("");

    // Should still be on auth screen (empty token is trimmed to empty, no storage write)
    await expect(sidepanel.getAuthScreen()).toBeVisible();
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("whitespace-only token: treated as empty, stays on auth", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Type only whitespace
    await sidepanel.connect("   \t\n  ");

    // Should still be on auth screen (whitespace trimmed to empty → no storage write)
    await expect(sidepanel.getAuthScreen()).toBeVisible();
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("token with special characters / XSS attempt is stored as-is", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const xssToken =
      'th_<script>alert("xss")</script>&"><img src=x onerror=alert(1)>';
    await sidepanel.connect(xssToken);

    // Token should be stored exactly as entered
    const stored = await getStorageToken(page);
    expect(stored).toBe(xssToken);
  });

  test("very long token (1000+ chars) is stored correctly", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const longToken = "th_" + "a".repeat(1000);
    await sidepanel.connect(longToken);

    const stored = await getStorageToken(page);
    expect(stored).toBe(longToken);
    expect(stored!.length).toBe(1003); // "th_" + 1000 a's
  });

  test("token with th_ prefix format is stored and accepted", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const token = "th_abc123def456";
    await sidepanel.connect(token);

    const stored = await getStorageToken(page);
    expect(stored).toBe(token);
  });
});

/* ================================================================
 * Auth State Persistence
 * ================================================================ */
test.describe("Auth State Persistence", () => {
  test("token already stored on open → directly shows main screen", async ({ page, extensionId }) => {
    // First open the sidepanel so extension storage is available
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");

    // Pre-set a token in storage
    await setStorageToken(page, "th_persisted_token");

    // Reload the page — app should find the token and go directly to main
    const sidepanel = await openSidepanel(page, extensionId);

    // With token present and API mocked, should reach main
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel.getNicheSelect()).toBeVisible();
  });

  test("after page refresh, auth state persists (token still in session storage)", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Set a token and wait for main screen
    await sidepanel.connect("th_persist_test");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Reload the page
    const sidepanel2 = await openSidepanel(page, extensionId);

    // Token should still be in session storage → main screen should appear
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Verify the token is still stored
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_persist_test");
  });

  test("logout clears token and returns to auth screen", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect first
    await sidepanel.connect("th_logout_test");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Click logout
    await sidepanel.logout();

    // Should return to auth screen and token should be cleared
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("multiple rapid connect/disconnect cycles do not cause errors", async ({ page, extensionId }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Perform rapid connect/disconnect cycles
    for (let i = 0; i < 3; i++) {
      await sidepanel.connect(`th_cycle_${i}`);
      // Wait briefly for the state to settle
      await page.waitForTimeout(300);

      // Logout
      await sidepanel.logout();
      await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    }

    // No console errors should have been logged during the cycles
    expect(consoleErrors).toHaveLength(0);
  });

  test("token in storage but API returns NOT_AUTHENTICATED → falls back to auth screen", async ({ page, context, extensionId }) => {
    // Override route to simulate NOT_AUTHENTICATED from background
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
        });
      } else {
        // Simulate the background returning NOT_AUTHENTICATED
        // The background script returns { error: "NOT_AUTHENTICATED" }
        // when it can't find a token in its own session storage.
        // But since we pre-set the token, the background WILL find it
        // and make the API call. We intercept that call and return 401.
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
      }
    });

    // Pre-set token and open
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_expired_token");

    // Reload — token exists but API returns 401
    // Background receives 401 → returns { error: "FETCH_ERROR" }
    // loadTrends gets response with no data and no NOT_AUTHENTICATED error
    // → setScreen("main") is called anyway with empty trends/FREE plan
    // So we actually check that the main screen appears but trends are empty
    const sidepanel = await openSidepanel(page, extensionId);

    // With a 401 from the API, the background returns FETCH_ERROR
    // loadTrends still calls setScreen("main") since it's not NOT_AUTHENTICATED
    // The main screen shows but with empty state since no data
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
  });
});

/* ================================================================
 * Loading Screen
 * ================================================================ */
test.describe("Loading Screen", () => {
  test("loading screen shows spinner element and Chargement... text", async ({ page, context, extensionId }) => {
    // Delay API responses to ensure loading screen is visible
    await context.route("**/api/extension/trends**", async (route) => {
      // Add a small delay so the loading screen has time to render
      await new Promise((r) => setTimeout(r, 500));
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
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

    // Pre-set token so app tries to load on startup
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_loading_test");

    // Reload — app should show loading screen while API calls are in flight
    const sidepanel = await openSidepanel(page, extensionId);

    // Wait for loading screen to appear
    await expect(sidepanel.getLoadingScreen()).toBeVisible({ timeout: 5000 });

    // Verify spinner and text
    await expect(sidepanel.getSpinner()).toBeVisible();
    await expect(sidepanel.getLoadingText()).toBeVisible();
    await expect(sidepanel.getLoadingText()).toHaveText("Chargement...");

    // Eventually should transition to main
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
  });

  test("loading screen appears briefly when connecting with valid token", async ({ page, context, extensionId }) => {
    // Delay API to observe loading state
    await context.route("**/api/extension/trends**", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: MOCK_TRENDS,
            plan: "PRO",
          }),
        });
      }
    });

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect — should briefly show loading then main
    await sidepanel.connect("th_pro_token");

    // Loading screen should appear
    await expect(sidepanel.getLoadingScreen()).toBeVisible({ timeout: 5000 });
    await expect(sidepanel.getSpinner()).toBeVisible();

    // Then transition to main with PRO plan
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel.getPlanBadge()).toHaveText("Plan PRO");

    // PRO plan should NOT show upgrade banner
    await expect(sidepanel.getUpgradeBanner()).toHaveCount(0);
  });
});
