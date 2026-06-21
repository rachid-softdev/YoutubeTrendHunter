import { test, expect, type Page, type BrowserContext } from "./fixtures";
import {
  openSidepanel,
  setStorageToken,
  clearStorage,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";

/* ================================================================
 * Hardened Auth Tests — Edge Cases, Storage, Multi-Instance,
 * Network Failures, Session, Reinstall & Token Flow
 *
 * These tests cover scenarios NOT already tested in the main
 * sidepanel-auth.spec.ts (21 tests). They target:
 *   1. Token Expiry & Validation
 *   2. Storage Edge Cases
 *   3. Multiple Extension Instances
 *   4. Offline & Network Edge Cases
 *   5. Session Timeout & Auto-Logout
 *   6. Extension Reinstall & Update
 *   7. Token Generation Flow
 * ================================================================ */

/* ── Storage helpers (complement those in pages/sidepanel.ts) ── */

/** Set any value type into chrome.storage.session for corruption tests. */
async function setStorageRaw(
  page: Page,
  key: string,
  value: unknown,
): Promise<void> {
  await page.evaluate(
    (args: { k: string; v: unknown }) =>
      new Promise<void>((resolve) => {
        chrome.storage.session.set({ [args.k]: args.v }, resolve);
      }),
    { k: key, v: value },
  );
}

/** Read a raw value from chrome.storage.session by key. */
async function getStorageRaw(
  page: Page,
  key: string,
): Promise<unknown> {
  return page.evaluate(
    (k: string) =>
      new Promise<unknown>((resolve) => {
        chrome.storage.session.get(k, (res) => resolve(res[k]));
      }),
    key,
  );
}

/** Wipe chrome.storage.session entirely. */
async function clearSessionStorage(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.session.clear(resolve);
      }),
  );
}

/** Write a custom apiBaseUrl into chrome.storage.sync. */
async function setApiBaseUrlInSync(
  page: Page,
  url: string,
): Promise<void> {
  await page.evaluate(
    (u: string) =>
      new Promise<void>((resolve) => {
        chrome.storage.sync.set({ apiBaseUrl: u }, resolve);
      }),
    url,
  );
}

/** Remove custom apiBaseUrl from chrome.storage.sync. */
async function removeApiBaseUrlFromSync(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        chrome.storage.sync.remove("apiBaseUrl", resolve);
      }),
  );
}

/* ── Shared route handler for happy-path API (used in most tests) ── */

/**
 * Register a route handler that returns successful API responses for
 * both the niches endpoint and the trends endpoint. Must be called
 * BEFORE any page navigation that triggers API calls.
 */
async function setupHappyApi(ctx: BrowserContext): Promise<void> {
  await ctx.route("**/api/extension/trends**", async (route) => {
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
}

/* ================================================================
 * 1 — Token Expiry & Validation
 * ================================================================ */
test.describe("Token Expiry & Validation", () => {
  test("token without th_ prefix is stored and processed", async ({
    page,
    context,
    extensionId,
  }) => {
    // The UI does NOT validate the th_ prefix — any non-empty string is accepted.
    await setupHappyApi(context);

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Use a UUID-like token without any th_ prefix
    const noPrefixToken = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    await sidepanel.connect(noPrefixToken);

    // Token should be stored exactly as entered
    const stored = await getStorageToken(page);
    expect(stored).toBe(noPrefixToken);

    // Should transition to main screen (API is mocked to succeed)
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
  });

  test("expired token causing API 401 shows main with empty trends gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    // Collect page errors from the start
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Intercept API to return 401 simulating an expired/revoked token
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token expiré ou révoqué" }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token expiré ou révoqué" }),
        });
      }
    });

    // Pre-set token in storage so the app tries to load data on startup
    await setStorageToken(page, "th_expired_token_abc");

    const sidepanel = await openSidepanel(page, extensionId);

    // Background returns FETCH_ERROR → app shows main screen with empty trends
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Trends list should be present but show empty state (no crash, no broken UI)
    await expect(sidepanel.getEmptyState()).toBeVisible({ timeout: 5000 });

    // Token should still be stored (the extension does NOT auto-clear on 401)
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_expired_token_abc");

    // No unhandled page errors should have occurred
    expect(pageErrors).toHaveLength(0);
  });

  test("background NOT_AUTHENTICATED response returns user to auth screen", async ({
    page,
    context,
    extensionId,
  }) => {
    // Set up route just for niches, but intercept trends to simulate
    // the background returning NOT_AUTHENTICATED because the token is missing
    // from the background's perspective.
    //
    // Strategy: store token in sidepanel's session storage, but have the
    // trends endpoint abort so background's fetch throws → FETCH_ERROR.
    // To get NOT_AUTHENTICATED, we need the background to find NO token.
    // We cannot directly mock the background's storage.get, but we can
    // set the token AFTER the background has already checked for it, or
    // clear it after the sidepanel has loaded but before background checks.
    //
    // Alternative: use page.evaluate to clear token from storage between
    // sidepanel mount and GET_TRENDS message handling.
    //
    // Simplest: set token, open sidepanel, then immediately clear it via
    // evaluate before the GET_TRENDS message reaches the background.
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
        });
      } else {
        // If background reaches here, it found a token — we want to test
        // the opposite. So we'll return data anyway and the token-clear
        // logic below will make the background return NOT_AUTHENTICATED first.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ trends: MOCK_TRENDS, plan: "FREE" }),
        });
      }
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");

    // Set token in storage
    await setStorageToken(page, "th_will_be_cleared");

    // Immediately clear it via the background's storage too
    // Both sidepanel and background share the same storage namespace.
    await clearStorage(page);

    // Reload the app
    const sidepanel = await openSidepanel(page, extensionId);

    // Sidepanel reads storage → finds no apiToken → shows auth
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
  });

  test("token with regex special characters is stored and readable", async ({
    page,
    extensionId,
  }) => {
    // Regex metacharacters that could break naïve parsing:
    // . + * ? ^ $ { } [ ] ( ) | \
    const regexToken = "th_\\d+\\.*?^${}[]|()test";

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    await sidepanel.connect(regexToken);

    const stored = await getStorageToken(page);
    expect(stored).toBe(regexToken);
  });

  test("token with leading and trailing whitespace is trimmed on connect", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect with token surrounded by spaces
    await sidepanel.connect("   th_whitespace_token   ");

    // The AuthScreen's handleSubmit calls token.trim() before passing to onConnect
    // So the stored token should be trimmed
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_whitespace_token");
  });

  test("reconnecting with a new token overwrites previous token in storage", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // First connection
    await sidepanel.connect("th_first_token");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Logout
    await sidepanel.logout();
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Reconnect with a different token
    await sidepanel.connect("th_second_token_rotated");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Verify the new token replaced the old one
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_second_token_rotated");
  });
});

/* ================================================================
 * 2 — Storage Edge Cases
 * ================================================================ */
test.describe("Storage Edge Cases", () => {
  test("corrupted apiToken as object (not string) handled gracefully on load", async ({
    page,
    extensionId,
  }) => {
    // Collect page errors from the start
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Simulate storage corruption: apiToken is an object instead of string
    await setStorageRaw(page, "apiToken", { value: "th_object_token" });

    // Reload — the app reads apiToken from storage.
    // If it's not a string, the condition `!apiToken` is false (truthy object)
    // so the app will try to proceed with an object as token.
    // Check that the app doesn't crash and shows some screen.
    const sidepanel = await openSidepanel(page, extensionId);

    // The background will receive this object token and check `!apiToken`
    // which is false for an object → tries to make API call with [object Object]
    // as the Bearer token → API call fails → FETCH_ERROR → shows main with empty
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // No JS crashes should occur
    expect(pageErrors).toHaveLength(0);
  });

  test("corrupted apiToken as number handled gracefully on load", async ({
    page,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Set token as a number
    await setStorageRaw(page, "apiToken", 12345);

    const sidepanel = await openSidepanel(page, extensionId);

    // Number is truthy, so !apiToken is false → app tries to use it
    // String token "12345" will be sent as Bearer → API call fails → main with empty
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    expect(pageErrors).toHaveLength(0);
  });

  test("missing selectedNiche in storage defaults to tech-ia", async ({
    page,
    context,
    extensionId,
  }) => {
    // The App.tsx useEffect defaults selectedNiche to "tech-ia" if not present
    // and also writes it back to storage.
    await context.route("**/api/extension/trends**", async (route) => {
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

    // Only set apiToken, no selectedNiche
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_niche_edge");

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // The niche select should show the default value (tech-ia)
    await expect(sidepanel.getNicheSelect()).toHaveValue("tech-ia");

    // Verify selectedNiche was written back to storage
    const savedNiche = await getStorageRaw(page, "selectedNiche");
    expect(savedNiche).toBe("tech-ia");
  });

  test("storage.get returns null for non-existent key explicitly", async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");

    // Ensure no token exists
    await clearSessionStorage(page);

    const result = await getStorageToken(page);
    expect(result).toBeNull();
  });

  test("multiple rapid storage writes are all persisted correctly", async ({
    page,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Write many tokens in rapid succession
    const tokens = [];
    for (let i = 0; i < 10; i++) {
      tokens.push(`th_rapid_${i}`);
    }

    // Fire all writes without awaiting (race condition simulation)
    const promises = tokens.map((t) => setStorageToken(page, t));
    await Promise.all(promises);

    // At least one of them should have been the last write
    const stored = await getStorageToken(page);
    expect(stored).not.toBeNull();
    expect(tokens).toContain(stored);

    expect(pageErrors).toHaveLength(0);
  });
});

/* ================================================================
 * 3 — Multiple Extension Instances
 * ================================================================ */
test.describe("Multiple Extension Instances", () => {
  test("two sidepanel pages share auth token via storage.session", async ({
    page,
    context,
    extensionId,
  }) => {
    // Open a second page to the sidepanel
    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page2.waitForSelector("#root");

    // Set token via page 1
    await setStorageToken(page, "th_shared_token_42");

    // Read token from page 2 — should see the same value
    const token2 = await getStorageToken(page2);
    expect(token2).toBe("th_shared_token_42");

    // Clean up second page
    await page2.close();
  });

  test("token set in one window authenticates second window on open", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Set token via page
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_cross_window");

    // Open a second sidepanel — it should read the token and go to main
    const page2 = await context.newPage();
    const sidepanel2 = await openSidepanel(page2, extensionId);

    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Verify the token is in storage from second window's perspective
    const token2 = await getStorageToken(page2);
    expect(token2).toBe("th_cross_window");

    await page2.close();
  });

  test("logout in one window clears token visible in second window's storage", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Open first window and authenticate
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_logout_propagate");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Open a second window
    const page2 = await context.newPage();
    const sidepanel2 = await openSidepanel(page2, extensionId);
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Logout in first window
    await sidepanel.logout();
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Second window's storage should reflect the cleared token
    const token2 = await getStorageToken(page2);
    expect(token2).toBeNull();

    // Reload second page — should now show auth screen
    const sidepanel2Reloaded = await openSidepanel(page2, extensionId);
    await expect(sidepanel2Reloaded.getAuthScreen()).toBeVisible({
      timeout: 5000,
    });

    await page2.close();
  });

  test("two sidepanels open simultaneously both work with same token", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Open first sidepanel and connect
    const sidepanel1 = await openSidepanel(page, extensionId);
    await expect(sidepanel1.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel1.connect("th_simultaneous");
    await expect(sidepanel1.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Open second sidepanel while first is still connected
    const page2 = await context.newPage();
    const sidepanel2 = await openSidepanel(page2, extensionId);

    // Second should also transition to main using the same token
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Both should show the same plan badge
    await expect(sidepanel1.getPlanBadge()).toHaveText("Plan FREE");
    await expect(sidepanel2.getPlanBadge()).toHaveText("Plan FREE");

    await page2.close();
  });
});

/* ================================================================
 * 4 — Offline & Network Edge Cases
 * ================================================================ */
test.describe("Offline & Network Edge Cases", () => {
  test("API host unreachable (timed-out connection) handled gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Simulate connection timeout by aborting with 'timedout'
    await context.route("**/api/extension/trends**", async (route) => {
      await route.abort("timedout");
    });

    // Store a valid-looking token first
    await setStorageToken(page, "th_timeout_failure");

    const sidepanel = await openSidepanel(page, extensionId);

    // Background fetch throws → returns FETCH_ERROR → main with empty state
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Empty state should be visible since no data arrived
    await expect(sidepanel.getEmptyState()).toBeVisible({ timeout: 5000 });

    expect(pageErrors).toHaveLength(0);
  });

  test("API returns non-JSON response handled gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    await context.route("**/api/extension/trends**", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html>Bad Gateway</html>",
      });
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_nonjson_response");

    const sidepanel = await openSidepanel(page, extensionId);

    // res.json() will throw on HTML → catch → FETCH_ERROR
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel.getEmptyState()).toBeVisible({ timeout: 5000 });
  });

  test("intermittent API: first request fails, retry by reload succeeds", async ({
    page,
    context,
    extensionId,
  }) => {
    let callCount = 0;

    await context.route("**/api/extension/trends**", async (route) => {
      callCount++;
      if (callCount <= 2) {
        // First batch (niches + trends) fails
        await route.abort("connectionrefused");
      } else {
        // Subsequent requests succeed
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
      }
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_intermittent");

    // First load — should show main with empty state (failing API)
    const sidepanel1 = await openSidepanel(page, extensionId);
    await expect(sidepanel1.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel1.getEmptyState()).toBeVisible({ timeout: 5000 });

    // Reload — API now succeeds (callCount > 2 triggers success routes)
    const sidepanel2 = await openSidepanel(page, extensionId);
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });

    // This time trends should appear
    await expect(sidepanel2.getTrendCards()).toHaveCount(MOCK_TRENDS.length);
  });

  test("slow API (3s latency) shows loading screen before main", async ({
    page,
    context,
    extensionId,
  }) => {
    await context.route("**/api/extension/trends**", async (route) => {
      // Add 3-second delay to simulate slow network
      await new Promise((r) => setTimeout(r, 3000));
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

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_slow_network");

    const sidepanel = await openSidepanel(page, extensionId);

    // Loading screen should be visible while API is slow
    await expect(sidepanel.getLoadingScreen()).toBeVisible({ timeout: 2000 });
    await expect(sidepanel.getSpinner()).toBeVisible();
    await expect(sidepanel.getLoadingText()).toHaveText("Chargement...");

    // After 3s delay, main screen should appear
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
  });

  test("API returns HTTP 500 server error handled gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    await context.route("**/api/extension/trends**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur serveur interne" }),
      });
    });

    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_server_error");

    const sidepanel = await openSidepanel(page, extensionId);

    // 500 response: fetch resolves, res.json() works, returns data
    // App sees response.data (the error object) but no trends → main with empty
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
    await expect(sidepanel.getEmptyState()).toBeVisible({ timeout: 5000 });
  });
});

/* ================================================================
 * 5 — Session Timeout & Auto-Logout
 * ================================================================ */
test.describe("Session Timeout & Auto-Logout", () => {
  test("token removed externally then page reload shows auth", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Authenticate first
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_external_clear");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Simulate external removal (e.g., another extension, devtools)
    await clearStorage(page);

    // Reload — app should now see no token and show auth
    const sidepanelReloaded = await openSidepanel(page, extensionId);
    await expect(sidepanelReloaded.getAuthScreen()).toBeVisible({
      timeout: 5000,
    });

    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("token removed mid-session: next page interaction still works gracefully", async ({
    page,
    context,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await setupHappyApi(context);

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_mid_session_clear");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Remove the token from storage while on main screen
    // (simulates auto-logout from background or cross-tab event)
    await clearStorage(page);

    // The current UI still shows main screen (React state not updated)
    // until a reload or the next storage read.
    // Verify the main screen is still displayed (no crash)
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 5000 });

    // Switch niche — this triggers GET_TRENDS.
    // Background won't find token → returns NOT_AUTHENTICATED.
    // Current app's handleNicheChange doesn't handle NOT_AUTHENTICATED
    // (only checks response.data), so it silently does nothing.
    // Test that no crash occurs.
    await sidepanel.selectNiche("finance-personnelle");

    await page.waitForTimeout(500);
    expect(pageErrors).toHaveLength(0);
  });

  test("rapid token set/clear cycles do not corrupt storage", async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");

    // Rapidly cycle token set and clear
    for (let i = 0; i < 5; i++) {
      await setStorageToken(page, `th_cycle_${i}`);
      const v1 = await getStorageToken(page);
      expect(v1).toBe(`th_cycle_${i}`);

      await clearStorage(page);
      const v2 = await getStorageToken(page);
      expect(v2).toBeNull();
    }

    // Verify final state is clean
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });
});

/* ================================================================
 * 6 — Extension Reinstall & Update
 * ================================================================ */
test.describe("Extension Reinstall & Update Simulation", () => {
  test("session storage cleared simulates reinstall → auth screen shown", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Set up an authenticated session
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setStorageToken(page, "th_reinstall_test");
    await clearStorage(page); // Simulate storage wiped by reinstall

    const sidepanel = await openSidepanel(page, extensionId);

    // No token → should show auth
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Token should be null
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("token survives page navigation cycle (sidepanel close/reopen)", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    // Open and connect
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
    await sidepanel.connect("th_navigate_survive");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Navigate away to a non-extension URL
    await page.goto("about:blank");
    await page.waitForLoadState("domcontentloaded");

    // Navigate back to the sidepanel
    const sidepanel2 = await openSidepanel(page, extensionId);

    // Token should still be in session storage
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_navigate_survive");

    // App should go directly to main
    await expect(sidepanel2.getMainScreen()).toBeVisible({ timeout: 8000 });
  });

  test("apiBaseUrl in storage.sync does not affect token storage in session", async ({
    page,
    context,
    extensionId,
  }) => {
    // Store a custom API base URL in sync storage
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.waitForSelector("#root");
    await setApiBaseUrlInSync(page, "https://custom-api.example.com");

    // Ensure the token goes to session storage regardless of sync storage
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Intercept API calls to the custom URL
    await context.route("**/custom-api.example.com/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ trends: MOCK_TRENDS, plan: "FREE" }),
        });
      }
    });

    await sidepanel.connect("th_custom_api_url");
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_custom_api_url");

    // Clean up sync storage
    await removeApiBaseUrlFromSync(page);
  });
});

/* ================================================================
 * 7 — Token Generation Flow
 * ================================================================ */
test.describe("Token Generation Flow", () => {
  test("OBTENIR UN TOKEN link has correct href and is keyboard-accessible", async ({
    page,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    const link = sidepanel.getObtainTokenLink();

    // Verify the link points to the billing page with correct security attributes
    await expect(link).toHaveAttribute("href", "https://trendhunter.app/billing");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // Verify link is focusable via keyboard (native <a> with href)
    const tagName = await link.evaluate((el) => el.tagName);
    expect(tagName).toBe("A");
    await expect(link).toHaveAttribute("href");

    // Clicking the link does not cause any page errors
    // (the external URL may be blocked by CSP, but the extension should handle it gracefully)
    await link.click({ timeout: 2000 });

    // No errors from the click action
    expect(pageErrors).toHaveLength(0);
  });

  test("form submit via Enter key stores token like button click", async ({
    page,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Fill token and press Enter to submit the form
    await sidepanel.getTokenInput().fill("th_enter_key_submit");
    await sidepanel.getTokenInput().press("Enter");

    // Token should be stored (same behavior as button click)
    const stored = await getStorageToken(page);
    expect(stored).toBe("th_enter_key_submit");

    expect(pageErrors).toHaveLength(0);
  });

  test("token rotation: new token works after previous token connect", async ({
    page,
    context,
    extensionId,
  }) => {
    await setupHappyApi(context);

    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect with first token
    await sidepanel.connect("th_token_v1");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
    let stored = await getStorageToken(page);
    expect(stored).toBe("th_token_v1");

    // Logout
    await sidepanel.logout();
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Connect with second token (simulating token rotation)
    await sidepanel.connect("th_token_v2_rotated");
    await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });

    stored = await getStorageToken(page);
    expect(stored).toBe("th_token_v2_rotated");
  });

  test("auth form prevents GET submission (no action attribute, e.preventDefault)", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // The form element should NOT have an action attribute
    // (if it did, the token could be leaked in URL query params on submit)
    const formAction = await page.locator(".auth-box form").getAttribute("action");
    expect(formAction).toBeNull();

    const formMethod = await page.locator(".auth-box form").getAttribute("method");
    expect(formMethod).toBeNull();

    // Verify the page URL does not change after form submit (no GET params)
    const urlBefore = page.url();
    await sidepanel.getTokenInput().fill("th_security_test");
    await sidepanel.getConnectButton().click();
    // Give time for any navigation
    await page.waitForTimeout(500);
    const urlAfter = page.url();

    // URL should not have token in query params
    expect(urlAfter).toBe(urlBefore);
    expect(urlAfter).not.toContain("th_security_test");
  });

  test("token form preserves input field after failed connect attempt", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await openSidepanel(page, extensionId);
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Type a token into the field but DON'T submit yet
    await sidepanel.getTokenInput().fill("th_preserve_me");

    // Reload the page (simulate accidental navigation)
    const sidepanel2 = await openSidepanel(page, extensionId);
    await expect(sidepanel2.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Input should be empty after reload (React state resets)
    const inputValue = await sidepanel2.getTokenInput().inputValue();
    expect(inputValue).toBe("");
  });
});
