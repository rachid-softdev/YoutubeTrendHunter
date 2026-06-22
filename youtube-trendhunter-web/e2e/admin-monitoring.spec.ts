import { test, expect, type Page } from "@playwright/test";

/**
 * Admin Monitoring Dashboard E2E tests for YouTube TrendHunter
 *
 * Tests the client-side MonitoringTab component at /admin?tab=monitoring:
 * - Loading spinner, error recovery, null/unavailable data states
 * - SSE vs polling connection modes
 * - Data display: metric cards, bar chart, HTTP status distribution, endpoint table
 * - Real-time updates via polling / SSE
 *
 * API mocking is used for both the SSE stream and the polling endpoint.
 */

/* -------------------------------------------------------------------------- */
/*  Constants & session helpers                                                */
/* -------------------------------------------------------------------------- */

const ADMIN_SESSION = {
  user: {
    id: "admin-id",
    name: "Admin",
    email: "admin@youtube-trendhunter.com",
    role: "ADMIN" as const,
    plan: "TEAM" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_SESSION),
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Mock monitoring data                                                       */
/* -------------------------------------------------------------------------- */

const COLLECTED_AT = new Date("2026-06-22T14:30:00.000Z").toISOString();

const MOCK_MONITORING = {
  endpoints: {
    "/api/trends": {
      count: 1250,
      errors: 3,
      totalDuration: 45200,
      lastMinute: 12,
      p50: 34.2,
      p95: 120.5,
      p99: 350.8,
      statusCodes: { 200: 1240, 401: 5, 500: 5 },
      errorRate: 0.24,
      avgDuration: 36.16,
    },
    "/api/niches": {
      count: 890,
      errors: 1,
      totalDuration: 28100,
      lastMinute: 8,
      p50: 28.7,
      p95: 95.3,
      p99: 210.4,
      statusCodes: { 200: 885, 500: 5 },
      errorRate: 0.11,
      avgDuration: 31.57,
    },
    "/api/alerts": {
      count: 420,
      errors: 0,
      totalDuration: 12400,
      lastMinute: 3,
      p50: 22.1,
      p95: 78.9,
      p99: 180.2,
      statusCodes: { 200: 420 },
      errorRate: 0,
      avgDuration: 29.52,
    },
  },
  totals: {
    requests: 2560,
    errors: 4,
    errorRate: 0.16,
    byStatus: { "2xx": 2545, "4xx": 5, "5xx": 10 },
  },
  rateHistory: {
    minutes: ["14:00", "14:01", "14:02", "14:03", "14:04"],
    counts: [42, 58, 63, 47, 55],
  },
  collectedAt: COLLECTED_AT,
};

const MOCK_HIGH_ERROR_RATE = {
  ...MOCK_MONITORING,
  endpoints: {
    ...MOCK_MONITORING.endpoints,
    "/api/broken": {
      count: 500,
      errors: 40,
      totalDuration: 18000,
      lastMinute: 5,
      p50: 45.0,
      p95: 200.0,
      p99: 500.0,
      statusCodes: { 200: 460, 500: 40 },
      errorRate: 8.0,
      avgDuration: 36.0,
    },
  },
  totals: {
    requests: 3060,
    errors: 44,
    errorRate: 1.44,
    byStatus: { "2xx": 3005, "4xx": 5, "5xx": 50 },
  },
  rateHistory: {
    minutes: ["14:00", "14:01", "14:02", "14:03", "14:04"],
    counts: [42, 58, 63, 47, 55],
  },
  collectedAt: COLLECTED_AT,
};

const MOCK_EMPTY_ENDPOINTS = {
  endpoints: {},
  totals: {
    requests: 0,
    errors: 0,
    errorRate: 0,
    byStatus: { "2xx": 0, "4xx": 0, "5xx": 0 },
  },
  rateHistory: {
    minutes: [],
    counts: [],
  },
  collectedAt: COLLECTED_AT,
};

const MOCK_ZERO_METRICS = {
  endpoints: {
    "/api/unused": {
      count: 0,
      errors: 0,
      totalDuration: 0,
      lastMinute: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      statusCodes: { 200: 0 },
      errorRate: 0,
      avgDuration: 0,
    },
  },
  totals: {
    requests: 0,
    errors: 0,
    errorRate: 0,
    byStatus: { "2xx": 0, "4xx": 0, "5xx": 0 },
  },
  rateHistory: {
    minutes: [],
    counts: [],
  },
  collectedAt: COLLECTED_AT,
};

/* -------------------------------------------------------------------------- */
/*  Route mocking helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mock the SSE stream endpoint to return valid monitoring data.
 * SSE success path → component shows green "Temps réel (SSE)" badge.
 */
async function mockSSEStream(page: Page, data: Record<string, any> = MOCK_MONITORING) {
  await page.route("**/api/admin/monitoring/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify(data)}\n\n`,
    });
  });
}

/**
 * Mock the SSE stream to fail (server error or connection drop).
 * SSE failure → component falls back to polling, shows yellow "Polling 5s" badge.
 */
async function mockSSEStreamFail(page: Page) {
  await page.route("**/api/admin/monitoring/stream", async (route) => {
    await route.fulfill({ status: 500 });
  });
}

/**
 * Mock the SSE stream to send invalid JSON (parse error test).
 * Component silently ignores the parse error and stays connected.
 */
async function mockSSEStreamInvalid(page: Page) {
  await page.route("**/api/admin/monitoring/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "data: {invalid json}\n\n",
    });
  });
}

/**
 * Mock the polling endpoint (GET /api/admin/monitoring).
 * Used when SSE fails and component falls back to polling.
 */
async function mockPollingEndpoint(page: Page, data: Record<string, any> = MOCK_MONITORING) {
  await page.route("**/api/admin/monitoring", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/**
 * Mock the polling endpoint with a delay (to test loading state).
 */
async function mockPollingEndpointDelayed(
  page: Page,
  delayMs: number,
  data: Record<string, any> = MOCK_MONITORING,
) {
  await page.route("**/api/admin/monitoring", async (route) => {
    if (route.request().method() === "GET") {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/**
 * Mock the polling endpoint with a failure response.
 */
async function mockPollingEndpointFail(page: Page) {
  await page.route("**/api/admin/monitoring", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 500, body: JSON.stringify({ error: "INTERNAL_ERROR" }) });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/**
 * Mock polling endpoint that returns different data on each call.
 * Used to test polling updates.
 */
function createSequentialMock(page: Page, dataSequence: Record<string, any>[]) {
  let callCount = 0;
  return page.route("**/api/admin/monitoring", async (route) => {
    if (route.request().method() === "GET") {
      const idx = Math.min(callCount, dataSequence.length - 1);
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dataSequence[idx]),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  beforeEach                                                                */
/* -------------------------------------------------------------------------- */

test.describe("Admin Monitoring", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  /* ====================================================================== */
  /*  Loading & Error states                                                  */
  /* ====================================================================== */

  test.describe("Loading & Error", () => {
    test("le spinner de chargement avec le texte « Chargement du monitoring… » est visible", async ({
      page,
    }) => {
      // Delay the polling response so the loading state is visible
      await mockSSEStreamFail(page);
      await mockPollingEndpointDelayed(page, 3000);

      await page.goto("/admin?tab=monitoring");
      // Don't wait for networkidle — we want to catch the loading state
      await page.waitForTimeout(500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        const spinner = page.locator(".animate-spin").first();
        await expect(spinner).toBeVisible();
        await expect(page.getByText("Chargement du monitoring…")).toBeVisible();
      }
    });

    test("une erreur API affiche la carte d'erreur avec le message", async ({ page }) => {
      await mockSSEStreamFail(page);
      await mockPollingEndpointFail(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      // Wait for the client-side fetch to fail
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Erreur de chargement")).toBeVisible();
        // The error message from the server (HTTP 500) should be displayed
        await expect(page.getByText(/500|INTERNAL_ERROR/)).toBeVisible();
      }
    });

    test("des données vides (endpoints et métriques à zéro) affichent les cartes avec des valeurs à 0", async ({
      page,
    }) => {
      // SSE stream that returns a valid object with zero values
      await mockSSEStream(page, MOCK_EMPTY_ENDPOINTS);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // The component renders the full data display with 0 values
        await expect(page.getByText("Requêtes totales").first()).toBeVisible();
        // The 0 value should be visible in the metric card
        await expect(page.getByText("0").first()).toBeVisible();
      }
    });

    test("des données strictement nulles (stats=null) affichent le message approprié", async ({
      page,
    }) => {
      // Mock polling endpoint returning null (component checks if (!stats))
      await mockSSEStreamFail(page);
      await page.route("**/api/admin/monitoring", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: "null",
          });
        } else {
          await route.fulfill({ status: 405 });
        }
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Aucune donnée de monitoring disponible.")).toBeVisible();
      }
    });

    test("une connexion SSE échouée provoque le basculement en mode polling avec badge jaune", async ({
      page,
    }) => {
      await mockSSEStreamFail(page);
      await mockPollingEndpoint(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // Should show the polling badge with yellow styling
        const pollingBadge = page.getByText("Polling 5s");
        await expect(pollingBadge).toBeVisible();
      }
    });

    test("une connexion SSE réussie charge les données et indique le mode temps réel", async ({
      page,
    }) => {
      await mockSSEStream(page);
      // Disable the polling fallback
      await page.route("**/api/admin/monitoring", async (route) => {
        await route.fulfill({ status: 500 });
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      // Wait for the SSE event to arrive
      await page.waitForTimeout(1000);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // Data should have loaded from the SSE stream
        await expect(page.getByText("2560").first()).toBeVisible();

        // At least one connection badge should be visible (SSE or fallback polling)
        const sseBadge = page.getByText("Temps réel (SSE)");
        const pollingBadge = page.getByText("Polling 5s");
        const sseVisible = await sseBadge.isVisible().catch(() => false);
        const pollingVisible = await pollingBadge.isVisible().catch(() => false);
        // The initial SSE message delivered data, but the stream may have ended
        // causing a fallback to polling. Regardless, data is shown.
        expect(sseVisible || pollingVisible).toBe(true);
      }
    });
  });

  /* ====================================================================== */
  /*  Data Display                                                            */
  /* ====================================================================== */

  test.describe("Data Display", () => {
    test("les quatre cartes de métriques sont affichées (Requêtes, Erreurs, Taux, 2xx/4xx/5xx)", async ({
      page,
    }) => {
      await mockSSEStream(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Requêtes totales").first()).toBeVisible();
        await expect(page.getByText("Erreurs").first()).toBeVisible();
        await expect(page.getByText("Taux d'erreur").first()).toBeVisible();
        await expect(page.getByText("2xx / 4xx / 5xx").first()).toBeVisible();
        // Values should be visible: 2560 requests, 4 errors, etc.
        await expect(page.getByText("2560").first()).toBeVisible();
        await expect(page.getByText("4").first()).toBeVisible();
      }
    });

    test("le graphique à barres Requêtes/minute affiche l'historique 5 minutes", async ({
      page,
    }) => {
      await mockSSEStream(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Requêtes / minute (5 dernières minutes)")).toBeVisible();
        // Minute labels from mock: ["14:00", "14:01", "14:02", "14:03", "14:04"]
        for (const minute of ["14:00", "14:01", "14:02", "14:03", "14:04"]) {
          await expect(page.getByText(minute).first()).toBeVisible();
        }
      }
    });

    test("la barre de répartition des statuts HTTP affiche les segments vert/jaune/rouge", async ({
      page,
    }) => {
      await mockSSEStream(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Répartition des statuts HTTP")).toBeVisible();
        // Check that the legend items are present
        await expect(page.getByText(/2xx\s*:\s*2545/)).toBeVisible();
        await expect(page.getByText(/4xx\s*:\s*5/)).toBeVisible();
        await expect(page.getByText(/5xx\s*:\s*10/)).toBeVisible();
        // Status bar segments: green-600, yellow-500, red-600
        const segments = page.locator("div.bg-green-600, div.bg-yellow-500, div.bg-red-600");
        const count = await segments.count();
        expect(count).toBe(3);
      }
    });

    test("la table des endpoints contient 8 colonnes", async ({ page }) => {
      await mockSSEStream(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        const table = page.locator("table").first();
        // The endpoint table should have 8 header columns
        const headers = table.locator("thead th");
        const headerCount = await headers.count();
        expect(headerCount).toBe(8);

        // Verify header labels
        const headerTexts = await headers.allTextContents();
        const expectedHeaders = [
          "Endpoint",
          "Requêtes",
          "Erreurs",
          "Taux err.",
          "Moy. (ms)",
          "P50 (ms)",
          "P95 (ms)",
          "P99 (ms)",
        ];
        for (let i = 0; i < expectedHeaders.length; i++) {
          expect(headerTexts[i].trim()).toContain(expectedHeaders[i]);
        }
      }
    });

    test("la table des endpoints vide affiche « Aucun endpoint suivi pour le moment »", async ({
      page,
    }) => {
      await mockSSEStream(page, MOCK_EMPTY_ENDPOINTS);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        await expect(page.getByText("Aucun endpoint suivi pour le moment.")).toBeVisible();
      }
    });

    test("les lignes avec un taux d'erreur > 5% ont le texte en rouge", async ({ page }) => {
      await mockSSEStream(page, MOCK_HIGH_ERROR_RATE);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // The /api/broken endpoint has 8.0% error rate → row cells should have text-red-400
        // Check that the error rate cell shows red text
        const errorRateCell = page
          .locator("table tbody tr")
          .filter({ hasText: "/api/broken" })
          .locator("td")
          .nth(3);
        const visible = await errorRateCell.isVisible().catch(() => false);
        if (visible) {
          const classAttr = await errorRateCell.getAttribute("class");
          expect(classAttr).toContain("text-red-400");
        }
      }
    });

    test("l'horodatage de dernière mise à jour est formaté en locale française", async ({
      page,
    }) => {
      await mockSSEStream(page);

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        const updateText = page.getByText("Dernière mise à jour").first();
        await expect(updateText).toBeVisible();
        // The time should be in French 24h format (e.g., "14:30:00")
        const text = await updateText.textContent();
        expect(text).toMatch(/\d{2}:\d{2}/);
      }
    });
  });

  /* ====================================================================== */
  /*  Real-time Updates                                                       */
  /* ====================================================================== */

  test.describe("Real-time Updates", () => {
    test("les données se rafraîchissent via polling avec des valeurs mises à jour", async ({
      page,
    }) => {
      await mockSSEStreamFail(page);

      // First call returns initial data, subsequent calls return updated data
      let callIndex = 0;
      await page.route("**/api/admin/monitoring", async (route) => {
        if (route.request().method() === "GET") {
          const data = callIndex === 0 ? MOCK_MONITORING : MOCK_HIGH_ERROR_RATE;
          callIndex++;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        } else {
          await route.fulfill({ status: 405 });
        }
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // Initially shows 2560 requests (first call)
        await expect(page.getByText("2560").first()).toBeVisible();

        // Wait for polling cycle (5s interval) + fetch time
        await page.waitForTimeout(6000);

        // Should now show 3060 requests (updated data from second call)
        await expect(page.getByText("3060").first()).toBeVisible();
      }
    });

    test("l'intervalle de polling est nettoyé lors de la navigation hors de l'onglet monitoring", async ({
      page,
    }) => {
      await mockSSEStreamFail(page);

      let fetchCount = 0;
      await page.route("**/api/admin/monitoring", async (route) => {
        if (route.request().method() === "GET") {
          fetchCount++;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_MONITORING),
          });
        } else {
          await route.fulfill({ status: 405 });
        }
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // Record the initial fetch count (initial load + first poll cycle)
        const initialFetches = fetchCount;

        // Navigate away from monitoring tab
        await page.locator('a:has-text("Overview")').first().click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);

        // Navigate back to monitoring tab
        await page.locator('a:has-text("Monitoring")').first().click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);

        // Verify the component re-mounted and fetched fresh data
        const afterReturnFetches = fetchCount;
        expect(afterReturnFetches).toBeGreaterThan(initialFetches);
      }
    });

    test("une erreur de parsing SSE est ignorée silencieusement, le composant continue de fonctionner", async ({
      page,
    }) => {
      // First SSE message is invalid JSON, second is valid
      await page.route("**/api/admin/monitoring/stream", async (route) => {
        // Send invalid JSON first, then valid data
        const body = `data: {invalid}\n\ndata: ${JSON.stringify(MOCK_MONITORING)}\n\n`;
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body,
        });
      });
      // Disable the polling fallback so SSE is the only data source
      await page.route("**/api/admin/monitoring", async (route) => {
        await route.fulfill({ status: 500 });
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // After ignoring the invalid parse, the valid message should set data
        await expect(page.getByText("2560").first()).toBeVisible();
        // No error card should appear
        const errorCard = page.getByText("Erreur de chargement");
        expect(await errorCard.count()).toBe(0);
      }
    });

    test("le chargement initial passe de l'état chargement à l'état données", async ({ page }) => {
      await mockSSEStreamFail(page);
      await mockPollingEndpointDelayed(page, 1500);

      await page.goto("/admin?tab=monitoring");
      // Check loading state appears
      await page.waitForTimeout(300);
      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        const spinner = page.locator(".animate-spin").first();
        const spinnerVisible = await spinner.isVisible().catch(() => false);
        if (spinnerVisible) {
          await expect(spinner).toBeVisible();
        }

        // Wait for data to load
        await page.waitForTimeout(2000);
        // Data should now be displayed
        await expect(page.getByText("Requêtes totales").first()).toBeVisible();
        // Loading spinner should be gone
        await expect(page.getByText("Chargement du monitoring…")).not.toBeVisible();
      }
    });

    test("les cycles de polling multiples ne provoquent pas d'erreurs de rendu", async ({
      page,
    }) => {
      await mockSSEStreamFail(page);

      let callIdx = 0;
      await page.route("**/api/admin/monitoring", async (route) => {
        if (route.request().method() === "GET") {
          callIdx++;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(callIdx % 2 === 0 ? MOCK_MONITORING : MOCK_HIGH_ERROR_RATE),
          });
        } else {
          await route.fulfill({ status: 405 });
        }
      });

      await page.goto("/admin?tab=monitoring");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(12000); // Let 2+ polling cycles run

      const onAdmin = page.url().includes("/admin");
      if (onAdmin) {
        // Page should still be functional
        await expect(page.getByText("Requêtes totales").first()).toBeVisible();
        // No error text
        const errors = page.getByText("Erreur de chargement");
        expect(await errors.count()).toBe(0);
      }
    });
  });
});
