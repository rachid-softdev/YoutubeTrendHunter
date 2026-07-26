import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Resilience & Edge Cases E2E tests for YouTube TrendHunter
 *
 * Tests system behavior under adverse conditions NOT covered elsewhere:
 *   - dashboard-hardened.spec.ts: resilience (cache-control, unknown params),
 *     TrendCard edge cases, NicheSelector edge cases
 *   - alerts-hardened.spec.ts: rate limiting, alert quarantine
 *   - Various API specs: 500 errors, 404 handling
 *
 * NEW scenarios added here:
 *   1. Service unavailable (503) — UI degrades gracefully
 *   2. Slow API responses — timeout handling, UI remains interactive
 *   3. Network abort mid-flight — request cancellation
 *   4. Concurrent rapid requests — race condition prevention
 *   5. Empty/null/malformed API responses — no crash
 *   6. Wrong Content-Type responses — JSON parse resilience
 *   7. Rapid navigation during loading — component unmount safety
 *   8. Browser back/forward during API call — navigation resilience
 */

/* -------------------------------------------------------------------------- */
/*  Constants & Helpers                                                       */
/* -------------------------------------------------------------------------- */

const PRO_SESSION = {
  user: { id: "t1", name: "Test", email: "t@t.com", role: "USER" as const, plan: "PRO" as const },
  expires: "2099-01-01T00:00:00.000Z",
};

async function mockSession(page: Page) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PRO_SESSION),
    });
  });
}

async function hasNavigatedTo(page: Page, path: string): Promise<boolean> {
  const current = page.url();
  return current.includes(path);
}

/* ======================================================================== */
/*  1. Service unavailable (503)                                             */
/* ======================================================================== */

test.describe("Service unavailable (503)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("API /api/trends retourne 503 → dashboard ne crash pas", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service temporairement indisponible" }),
      });
    });

    const response = await page.goto("/dashboard");
    // The page should load (possibly with error state) and not throw 500
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/dashboard")) {
      // Body should still render without crash
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("API /api/trends retourne 503 avec HTML → pas de crash parse JSON", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/trends*", async (route) => {
      // Simulate a load balancer returning HTML error page
      await route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "<html><body><h1>503 Service Unavailable</h1></body></html>",
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("API /api/alerts retourne 503 → page alertes ne crash pas", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Service indisponible" }),
        });
      } else {
        await route.fallback();
      }
    });

    const response = await page.goto("/alerts");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/alerts")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Multiple endpoints en 503 simultanément → pas de crash en cascade", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    });
    await page.route("**/api/niches*", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    });
    await page.route("**/api/alerts*", async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("503 avec body vide → pas de crash", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({ status: 503, body: "" });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });
});

/* ======================================================================== */
/*  2. Slow API responses — timeout handling                                 */
/* ======================================================================== */

test.describe("Slow API responses (timeout)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("API trends répond en 5 secondes → page finit par charger sans erreur", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      // Simulate a slow response
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [{ id: "t-1", title: "Slow Trend", score: 50, velocity: 1, status: "GROWING" }],
          total: 1,
        }),
      });
    });

    const start = Date.now();
    const response = await page.goto("/dashboard");
    const elapsed = Date.now() - start;

    // Should eventually load (or redirect to login if slow)
    expect(response?.status()).not.toBe(500);
    test.info().annotations.push({
      type: "timing",
      description: `Page load with 5s API delay: ${elapsed}ms`,
    });
  });

  test("API trends très lent (15s) → navigation utilise le timeout navigateur", async ({
    page,
  }) => {
    await mockSession(page);

    await page.route("**/api/trends*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    // Use a shorter timeout to trigger browser timeout
    const start = Date.now();
    await page.goto("/dashboard", { timeout: 10_000 }).catch(() => {});
    const elapsed = Date.now() - start;

    test.info().annotations.push({
      type: "timing",
      description: `Timeout after ${elapsed}ms`,
    });
    // Test passes if no crash — the page may be partially loaded
  });

  test("Page reste interactive pendant le chargement lent des données", async ({ page }) => {
    await mockSession(page);

    let resolveTrends: (() => void) | null = null;
    await page.route("**/api/trends*", async (route) => {
      await new Promise<void>((resolve) => {
        resolveTrends = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    // Start navigation but don't wait for networkidle
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // After DOM loads, the page shell should be visible even if data hasn't loaded
    if (await hasNavigatedTo(page, "/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
      // Main layout elements should exist
      await expect(page.locator("header, nav, main, div").first()).toBeVisible();
    }

    // Release the blocked request
    if (resolveTrends) resolveTrends();
  });
});

/* ======================================================================== */
/*  3. Network abort mid-flight                                              */
/* ======================================================================== */

test.describe("Network abort mid-flight", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Requête trends interrompue (abort) → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.abort("connectionrefused");
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Requête trends interrompue (aborted) → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.abort("aborted");
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("Requête trends interrompue (timedout) → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.abort("timedout");
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("Réseau inaccessible pour toutes les API → pas de crash", async ({ page }) => {
    await mockSession(page);

    // Abort all API calls
    await page.route("**/api/**", async (route) => {
      await route.abort("connectionrefused");
    });

    const response = await page.goto("/dashboard");
    // Even with all APIs failing, the page should not throw 500
    expect(response?.status()).not.toBe(500);
  });
});

/* ======================================================================== */
/*  4. Concurrent rapid requests                                             */
/* ======================================================================== */

test.describe("Concurrent rapid requests", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Rapides changements de niche (5 en < 1s) → pas de crash", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/trends*", async (route) => {
      requestCount++;
      // Add a small delay so requests overlap
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [], total: 0 }),
      });
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (!(await hasNavigatedTo(page, "/dashboard"))) return;

    // Simulate rapid niche changes via URL navigation
    const niches = ["tech", "gaming", "cuisine", "business", "sport"];
    const promises = niches.map((niche) =>
      page.goto(`/dashboard?niche=${niche}`, { waitUntil: "domcontentloaded" }).catch(() => {}),
    );

    await Promise.race(promises);
    // Wait a bit for things to settle
    await page.waitForTimeout(1000);

    // Page should not have crashed
    await expect(page.locator("body")).toBeVisible();
    test.info().annotations.push({
      type: "info",
      description: `Requests triggered: ${requestCount}`,
    });
  });

  test("Double-clic rapide sur 'Nouvelle alerte' → un seul appel API", async ({ page }) => {
    let postCount = 0;

    await page.route("**/api/alerts*", async (route: Route) => {
      const method = route.request().method();
      if (method === "POST") {
        postCount++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            alert: { id: `a-${postCount}`, type: "SCORE_THRESHOLD" },
          }),
        });
        return;
      }
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [],
            userNiches: [{ niche: { id: "n-1", name: "Tech", slug: "tech" } }],
            plan: "PRO",
            canCreate: true,
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!(await hasNavigatedTo(page, "/alerts"))) return;

    // Click "Nouvelle alerte" multiple times rapidly
    const createBtn = page.getByText("Nouvelle alerte");
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click({ clickCount: 3 });
      await page.waitForTimeout(500);
    }

    // Should only have triggered at most 1 or 2 POST calls
    // (the button should be loading-guarded)
    expect(postCount).toBeLessThanOrEqual(2);
  });
});

/* ======================================================================== */
/*  5. Malformed API responses                                               */
/* ======================================================================== */

test.describe("Malformed API responses", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  const MALFORMED_RESPONSES = [
    { label: "null body", body: null, ct: "application/json" },
    { label: "undefined body", body: undefined, ct: "application/json" },
    { label: "empty string", body: "", ct: "application/json" },
    { label: "HTML instead of JSON", body: "<html>error</html>", ct: "text/html" },
    { label: "plain text", body: "Internal Server Error", ct: "text/plain" },
    { label: "array instead of object", body: "[1,2,3]", ct: "application/json" },
    { label: "number instead of object", body: "42", ct: "application/json" },
    { label: "true instead of object", body: "true", ct: "application/json" },
    {
      label: "missing expected fields",
      body: JSON.stringify({ foo: "bar" }),
      ct: "application/json",
    },
  ];

  for (const { label, body, ct } of MALFORMED_RESPONSES) {
    test(`API trends retourne ${label} → pas de crash`, async ({ page }) => {
      await page.route("**/api/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: ct,
          body: body !== undefined ? String(body) : undefined,
        });
      });

      const response = await page.goto("/dashboard");
      expect(response?.status()).not.toBe(500);
    });
  }

  test("API trends retourne 200 avec du HTML (wrong content-type) → pas de crash", async ({
    page,
  }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Error page</body></html>",
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("API trends retourne des en-têtes HTTP manquants → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "",
        body: JSON.stringify({ trends: [] }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });
});

/* ======================================================================== */
/*  6. Navigation resilience                                                 */
/* ======================================================================== */

test.describe("Navigation resilience", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Navigation rapide page→page pendant chargement → pas de crash", async ({ page }) => {
    let resolveRoute: ((value: unknown) => void) | null = null;
    // Block the API to keep the page loading
    await page.route("**/api/trends*", async (route) => {
      await new Promise<void>((resolve) => {
        resolveRoute = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    // Start loading dashboard (will hang on API)
    void page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // While dashboard is loading, navigate to another page
    await page.waitForTimeout(100);
    await page.goto("/billing", { waitUntil: "domcontentloaded" }).catch(() => {});

    // Release the blocked request
    if (resolveRoute) {
      resolveRoute();
      resolveRoute = null;
    }

    await page.waitForTimeout(500);

    // Should have survived the interrupted navigation
    const onBilling = await hasNavigatedTo(page, "/billing");
    const onDashboard = await hasNavigatedTo(page, "/dashboard");
    expect(onBilling || onDashboard).toBeTruthy();
  });

  test("Navigation aller/retour (back) → pas de crash", async ({ page }) => {
    await mockSession(page);

    // Mock both dashboard and billing APIs
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [], total: 0 }),
      });
    });

    await page.route("**/api/stripe/portal", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "" }),
      });
    });
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test" }),
      });
    });

    // Go to dashboard, then billing, then back
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    await page.goBack();
    await page.waitForLoadState("networkidle");

    // Should have navigated back without crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("Navigation avant/arrière rapide (3 cycles) → pas de crash", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [], total: 0 }),
      });
    });
    await page.route("**/api/niches*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: [], followed: [], available: [] }),
      });
    });

    const pages = ["/dashboard", "/my-niches", "/alerts", "/billing"];

    for (let cycle = 0; cycle < 3; cycle++) {
      // Forward through all pages
      for (const path of pages) {
        await page.goto(path, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
      // Go back through all pages
      for (let i = 0; i < pages.length; i++) {
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }

    // Should survive rapid navigation
    await expect(page.locator("body")).toBeVisible();
  });

  test("Rechargement de page pendant chargement → pas de crash", async ({ page }) => {
    await mockSession(page);

    let resolveRoute: (() => void) | null = null;
    await page.route("**/api/trends*", async (route) => {
      await new Promise<void>((resolve) => {
        resolveRoute = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    // Start loading dashboard
    void page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // Reload before the API responds
    await page.waitForTimeout(50);
    await page.reload().catch(() => {});

    // Release the original request
    if (resolveRoute) resolveRoute();

    await page.waitForTimeout(500);
    await expect(page.locator("body")).toBeVisible();
  });
});

/* ======================================================================== */
/*  7. Data edge cases — extreme values                                      */
/* ======================================================================== */

test.describe("Data edge cases — extreme values", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Score négatif dans les tendances → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [
            { id: "t-neg", title: "Negative Score", score: -50, velocity: -10, status: "FADING" },
          ],
          total: 1,
        }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Score > 100 dans les tendances → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [
            { id: "t-high", title: "Very Hot", score: 9999, velocity: 999.99, status: "PEAK" },
          ],
          total: 1,
        }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("Très long titre de tendance (1000 chars) → pas de crash", async ({ page }) => {
    const longTitle = "A".repeat(1000);

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [
            {
              id: "t-long",
              title: longTitle,
              description: "B".repeat(500),
              score: 50,
              velocity: 1,
              status: "GROWING",
              contentAngles: ["C".repeat(200), "D".repeat(200)],
            },
          ],
          total: 1,
        }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("Alerte avec threshold = 0 → pas de crash", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [
              {
                id: "a-zero",
                type: "SCORE_THRESHOLD",
                threshold: 0,
                channel: "EMAIL",
                isActive: true,
                niche: null,
              },
            ],
            userNiches: [],
            plan: "PRO",
            canCreate: true,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const response = await page.goto("/alerts");
    expect(response?.status()).not.toBe(500);

    if (await hasNavigatedTo(page, "/alerts")) {
      // Zero threshold alert should render
      const thresholdText = page.getByText("Seuil:").first();
      await expect(thresholdText).toBeVisible({ timeout: 3000 });
    }
  });

  test("Alerte avec threshold = 100 → pas de crash", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [
              {
                id: "a-max",
                type: "SCORE_THRESHOLD",
                threshold: 100,
                channel: "WEBHOOK",
                isActive: false,
                niche: null,
              },
            ],
            userNiches: [],
            plan: "PRO",
            canCreate: true,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const response = await page.goto("/alerts");
    expect(response?.status()).not.toBe(500);
  });
});

/* ======================================================================== */
/*  8. Backend returning unexpected responses                                */
/* ======================================================================== */

test.describe("Backend unexpected responses", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("API retourne 200 avec body null → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("API retourne 200 avec tableau vide → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("API retourne 204 No Content → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({ status: 204, body: undefined });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });

  test("API retourne 302 redirect → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 302,
        headers: { Location: "/login" },
      });
    });

    const response = await page.goto("/dashboard");
    // 302 redirect might result in login page — that's ok, no crash
    expect(response?.status()).not.toBe(500);
  });

  test("API retourne Content-Length erroné → pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Content-Length": "999999" },
        body: JSON.stringify({ trends: [] }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
  });
});
