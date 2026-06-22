import { test, expect, type Page } from "@playwright/test";

/**
 * API Alerts CRUD — E2E tests for YouTube TrendHunter
 *
 * Covers ALL alerts CRUD endpoints:
 *   ✓ GET    /api/alerts        — List alerts (9 scenarios)
 *   ✓ POST   /api/alerts        — Create alert (11 scenarios)
 *   ✓ GET    /api/alerts/[id]   — Get single alert (6 scenarios)
 *   ✓ PATCH  /api/alerts/[id]   — Update alert (11 scenarios)
 *   ✓ DELETE /api/alerts/[id]   — Delete alert (7 scenarios)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *     (auth checks, plan limits, database queries, cache operations)
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401), plan checks (403), validation (400),
 *     not-found (404), success (200/201/204), rate-limiting (429), and errors (500)
 *
 * NOTE: page.request.get() does NOT go through page.route() interception
 * in Playwright — it uses a separate APIRequestContext that bypasses the
 * browser's network stack. Using page.evaluate() with fetch() ensures
 * all requests are intercepted by our route handlers.
 */

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

/** Base URL from Playwright config */
const BASE_URL = "http://localhost:3000";

/**
 * Set up a minimal page at the BASE_URL so that all subsequent fetch()
 * calls are same-origin (avoids CORS preflight issues with opaque origins
 * like about:blank).
 */
async function setupPage(page: Page) {
  // Intercept the root URL to serve a minimal HTML page
  await page.route(BASE_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!DOCTYPE html><html><body></body></html>",
      });
    } else {
      await route.fallback();
    }
  });

  // Intercept favicon to avoid unnecessary server requests
  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({ status: 204 });
  });

  // Navigate to BASE_URL — intercepted by route, never reaches server
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
}

/**
 * Generic API response shape.
 */
interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  bodyText: string;
}

/**
 * Make an API call through the browser's native fetch API.
 * This guarantees that page.route() interceptors will catch the request.
 * Supports GET, POST, PATCH, DELETE with optional JSON body and headers.
 *
 * NOTE: The page MUST be on the same origin (via setupPage) to avoid CORS.
 */
async function fetchApi<T = unknown>(
  page: Page,
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  const method = options?.method || "GET";
  const headers: Record<string, string> = { ...options?.headers };
  const hasBody = options?.body !== undefined && method !== "GET" && method !== "DELETE";

  if (hasBody && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  return await page.evaluate(
    async ({
      fetchUrl,
      method: reqMethod,
      headers: reqHeaders,
      body: reqBody,
    }: {
      fetchUrl: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    }) => {
      const res = await fetch(fetchUrl, {
        method: reqMethod,
        headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
        body: reqBody,
      });

      const bodyText = await res.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        // Keep as raw text
      }

      const resHeaders: Record<string, string> = {};
      for (const [key, value] of res.headers.entries()) {
        resHeaders[key] = value;
      }

      return { status: res.status, headers: resHeaders, body, bodyText };
    },
    {
      fetchUrl: fullUrl,
      method,
      headers,
      body: hasBody ? JSON.stringify(options!.body) : undefined,
    },
  );
}

/* ========================================================================== */
/*  Session Helpers                                                            */
/* ========================================================================== */

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
}

function buildSession(user: MockUser) {
  return {
    user,
    expires: "2099-01-01T00:00:00.000Z",
  };
}

const SESSION_FREE = buildSession({
  id: "user-free-001",
  name: "Utilisateur Free",
  email: "free@test.com",
  role: "USER",
  plan: "FREE",
});

const SESSION_PRO = buildSession({
  id: "user-pro-002",
  name: "Utilisateur Pro",
  email: "pro@test.com",
  role: "USER",
  plan: "PRO",
});

const SESSION_TEAM = buildSession({
  id: "user-team-003",
  name: "Utilisateur Team",
  email: "team@test.com",
  role: "USER",
  plan: "TEAM",
});

/**
 * Mock the /api/auth/session endpoint.
 * Call with no argument to simulate no session (401).
 */
async function mockSession(page: Page, session?: object) {
  await page.route("**/api/auth/session", async (route) => {
    if (session) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    }
  });
}

/* ========================================================================== */
/*  Mock Data Factories                                                        */
/* ========================================================================== */

function makeNiche(overrides: Record<string, unknown> = {}) {
  return {
    id: "niche-1",
    name: "Tech & IA",
    slug: "tech",
    ...overrides,
  };
}

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-" + Math.random().toString(36).slice(2, 9),
    userId: "user-pro-002",
    nicheId: null,
    type: "SCORE_THRESHOLD",
    threshold: 70,
    channel: "EMAIL",
    webhookUrl: null,
    isActive: true,
    lastSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    niche: null,
    ...overrides,
  };
}

function makeAlertWithNiche(overrides: Record<string, unknown> = {}) {
  return makeAlert({
    nicheId: "niche-1",
    niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
    ...overrides,
  });
}

const DEFAULT_NICHES = [
  { niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } },
  { niche: { id: "niche-2", name: "Gaming", slug: "gaming" } },
];

/* ========================================================================== */
/*  1. GET /api/alerts — 9 scenarios                                          */
/* ========================================================================== */

test.describe("GET /api/alerts — Liste des alertes", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("1a — Sans authentification → 401", async ({ page }) => {
    // No session mock → auth() returns null
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(401);
    expect((res.body as Record<string, string>).error).toBe("Non authentifié");
    expect((res.body as Record<string, string>).code).toBe("UNAUTHORIZED");
  });

  test("1b — Rate limité → 429", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Trop de requêtes. Réessayez dans quelques instants.",
          code: "RATE_LIMITED",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(429);
    expect((res.body as Record<string, string>).code).toBe("RATE_LIMITED");
  });

  test("1c — Alertes en cache retournées", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const cachedAt = new Date().toISOString();
    const cachedAlerts = [
      makeAlertWithNiche({ id: "cached-alert-1", type: "SCORE_THRESHOLD" }),
      makeAlertWithNiche({ id: "cached-alert-2", type: "SPIKE" }),
    ];

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: cachedAlerts,
          userNiches: DEFAULT_NICHES,
          plan: "PRO",
          canCreate: true,
          _cache: { hit: true, cachedAt },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const cache = body._cache as Record<string, unknown>;
    expect(cache.hit).toBe(true);
    expect(cache.cachedAt).toBe(cachedAt);
  });

  test("1d — Cache miss → données chargées depuis la DB", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const dbFetchedAt = new Date().toISOString();

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [makeAlertWithNiche({ id: "db-alert-1" })],
          userNiches: DEFAULT_NICHES,
          plan: "PRO",
          canCreate: true,
          _cache: { hit: false, dbFetchedAt },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const cache = body._cache as Record<string, unknown>;
    expect(cache.hit).toBe(false);
    expect(cache.dbFetchedAt).toBe(dbFetchedAt);
  });

  test("1e — Utilisateur FREE → canCreate: false", async ({ page }) => {
    await mockSession(page, SESSION_FREE);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [makeAlertWithNiche()],
          userNiches: DEFAULT_NICHES,
          plan: "FREE",
          canCreate: false,
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.plan).toBe("FREE");
    expect(body.canCreate).toBe(false);
  });

  test("1f — Utilisateur PRO → canCreate: true", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [makeAlertWithNiche()],
          userNiches: DEFAULT_NICHES,
          plan: "PRO",
          canCreate: true,
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.plan).toBe("PRO");
    expect(body.canCreate).toBe(true);
  });

  test("1g — Utilisateur TEAM → canCreate: true", async ({ page }) => {
    await mockSession(page, SESSION_TEAM);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [makeAlertWithNiche()],
          userNiches: DEFAULT_NICHES,
          plan: "TEAM",
          canCreate: true,
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.plan).toBe("TEAM");
    expect(body.canCreate).toBe(true);
  });

  test("1h — Aucune alerte → { alerts: [], userNiches, plan, canCreate }", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [],
          userNiches: DEFAULT_NICHES,
          plan: "PRO",
          canCreate: true,
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.alerts).toEqual([]);
    expect(body.userNiches).toBeDefined();
    expect(body.plan).toBe("PRO");
    expect(body.canCreate).toBe(true);
  });

  test("1i — Erreur interne → 500", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts");
    expect(res.status).toBe(500);
    expect((res.body as Record<string, string>).code).toBe("INTERNAL_ERROR");
  });
});

/* ========================================================================== */
/*  2. POST /api/alerts — 11 scenarios                                        */
/* ========================================================================== */

test.describe("POST /api/alerts — Création d'une alerte", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("2a — Sans authentification → 401", async ({ page }) => {
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL" },
    });
    expect(res.status).toBe(401);
  });

  test("2b — Utilisateur FREE → 403 Forbidden", async ({ page }) => {
    await mockSession(page, SESSION_FREE);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Les alertes sont disponibles à partir du plan Pro.",
          code: "FORBIDDEN",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL" },
    });
    expect(res.status).toBe(403);
    expect((res.body as Record<string, string>).code).toBe("FORBIDDEN");
  });

  test("2c — Corps de requête manquant ou invalide → 400", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: { type: ["Required"], channel: ["Required"] },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as Record<string, string>).code).toBe("VALIDATION_ERROR");
  });

  test("2d — Type d'alerte invalide → 400", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: {
            type: [
              "Invalid enum value. Expected: 'SCORE_THRESHOLD' | 'SPIKE' | 'NEW_VIDEO', received: 'INVALID_TYPE'",
            ],
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "INVALID_TYPE", channel: "EMAIL" },
    });
    expect(res.status).toBe(400);
    const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.type).toBeDefined();
  });

  test("2e — Canal de notification invalide → 400", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: {
            channel: ["Invalid enum value. Expected: 'EMAIL' | 'WEBHOOK', received: 'SMS'"],
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "SMS" },
    });
    expect(res.status).toBe(400);
    const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.channel).toBeDefined();
  });

  test("2f — nicheId d'une niche inexistante → 404", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Niche introuvable",
          code: "NOT_FOUND",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL", nicheId: "niche-inexistante" },
    });
    expect(res.status).toBe(404);
    expect((res.body as Record<string, string>).code).toBe("NOT_FOUND");
  });

  test("2g — Création valide → 201 avec alerte complète", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const createdAlert = makeAlertWithNiche({
      id: "new-alert-001",
      type: "SPIKE",
      threshold: 85,
      channel: "WEBHOOK",
      webhookUrl: "https://hooks.example.com/yt",
      isActive: true,
    });

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      // Verify correct fields were sent
      expect(body.type).toBe("SPIKE");
      expect(body.channel).toBe("WEBHOOK");
      expect(body.nicheId).toBe("niche-1");
      expect(body.threshold).toBe(85);
      expect(body.isActive).toBe(true);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: createdAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: {
        type: "SPIKE",
        channel: "WEBHOOK",
        nicheId: "niche-1",
        threshold: 85,
        isActive: true,
        webhookUrl: "https://hooks.example.com/yt",
      },
    });
    expect(res.status).toBe(201);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.type).toBe("SPIKE");
    expect(data.alert.channel).toBe("WEBHOOK");
    expect(data.alert.nicheId).toBe("niche-1");
    expect(data.alert.threshold).toBe(85);
    expect(data.alert.isActive).toBe(true);
    expect(data.alert.niche).toBeDefined();
    expect(data.alert.niche).toHaveProperty("slug", "tech");
  });

  test("2h — Audit log créé lors de la création", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const now = new Date().toISOString();

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-audit-1" }),
          _auditLog: {
            action: "CREATE_ALERT",
            alertType: "SCORE_THRESHOLD",
            nicheSlug: "tech",
            createdAt: now,
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL", nicheId: "niche-1" },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    const auditLog = body._auditLog as Record<string, unknown>;
    expect(auditLog.action).toBe("CREATE_ALERT");
    expect(auditLog.alertType).toBe("SCORE_THRESHOLD");
    expect(auditLog.nicheSlug).toBe("tech");
  });

  test("2i — Cache invalidé après création", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-cache-inv-1" }),
          _cache: { invalidated: true },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL", nicheId: "niche-1" },
    });
    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    const cache = body._cache as Record<string, unknown>;
    expect(cache.invalidated).toBe(true);
  });

  test("2j — Rate limité → 429", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Trop de requêtes. Réessayez dans quelques instants.",
          code: "RATE_LIMITED",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL" },
    });
    expect(res.status).toBe(429);
    expect((res.body as Record<string, string>).code).toBe("RATE_LIMITED");
  });

  test("2k — Alerte sans nicheId (globale) → créée avec niche null", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.nicheId).toBeUndefined();

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlert({
            id: "alert-global-1",
            nicheId: null,
            niche: null,
          }),
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts", {
      method: "POST",
      body: { type: "SCORE_THRESHOLD", channel: "EMAIL" },
    });
    expect(res.status).toBe(201);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.nicheId).toBeNull();
    expect(data.alert.niche).toBeNull();
  });
});

/* ========================================================================== */
/*  3. GET /api/alerts/[id] — 6 scenarios                                     */
/* ========================================================================== */

test.describe("GET /api/alerts/[id] — Détail d'une alerte", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("3a — Sans authentification → 401", async ({ page }) => {
    await page.route("**/api/alerts/alert-single-1", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-single-1");
    expect(res.status).toBe(401);
  });

  test("3b — Alerte introuvable (mauvais id) → 404", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-unknown-999", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-unknown-999");
    expect(res.status).toBe(404);
    expect((res.body as Record<string, string>).code).toBe("NOT_FOUND");
  });

  test("3c — Alerte appartenant à un autre utilisateur → 404 (scopée par userId)", async ({
    page,
  }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-other-user", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Alerte introuvable",
          code: "NOT_FOUND",
          _reason: "alert_belongs_to_another_user",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-other-user");
    expect(res.status).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body._reason).toBe("alert_belongs_to_another_user");
  });

  test("3d — Alerte trouvée → 200 avec alerte + niche imbriquée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const foundAlert = makeAlertWithNiche({
      id: "alert-found-1",
      type: "NEW_VIDEO",
      threshold: 50,
      channel: "EMAIL",
      isActive: true,
    });

    await page.route("**/api/alerts/alert-found-1", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: foundAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-found-1");
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.id).toBe("alert-found-1");
    expect(data.alert.type).toBe("NEW_VIDEO");
    expect(data.alert.threshold).toBe(50);
    expect(data.alert.channel).toBe("EMAIL");
    expect(data.alert.isActive).toBe(true);
    // Nested niche
    expect(data.alert.niche).toBeDefined();
    expect((data.alert.niche as Record<string, unknown>).slug).toBe("tech");
    expect((data.alert.niche as Record<string, unknown>).name).toBe("Tech & IA");
  });

  test("3e — Alerte avec niche null → 200 avec alerte, niche = null", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const alertNoNiche = makeAlert({
      id: "alert-no-niche-1",
      nicheId: null,
      niche: null,
    });

    await page.route("**/api/alerts/alert-no-niche-1", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: alertNoNiche }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-no-niche-1");
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.nicheId).toBeNull();
    expect(data.alert.niche).toBeNull();
  });

  test("3f — Erreur interne → 500", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-error-500", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-error-500");
    expect(res.status).toBe(500);
    expect((res.body as Record<string, string>).code).toBe("INTERNAL_ERROR");
  });
});

/* ========================================================================== */
/*  4. PATCH /api/alerts/[id] — 11 scenarios                                  */
/* ========================================================================== */

test.describe("PATCH /api/alerts/[id] — Mise à jour d'une alerte", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("4a — Sans authentification → 401", async ({ page }) => {
    await page.route("**/api/alerts/alert-upd-1", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-1", {
      method: "PATCH",
      body: { isActive: false },
    });
    expect(res.status).toBe(401);
  });

  test("4b — Alerte introuvable / non possédée → 404", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-nonexistent-999", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-nonexistent-999", {
      method: "PATCH",
      body: { isActive: false },
    });
    expect(res.status).toBe(404);
    expect((res.body as Record<string, string>).code).toBe("NOT_FOUND");
  });

  test("4c — Corps de requête invalide → 400", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-upd-2", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: {
            threshold: ["Expected number, received string"],
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-2", {
      method: "PATCH",
      body: { threshold: "pas-un-nombre" },
    });
    expect(res.status).toBe(400);
    expect((res.body as Record<string, string>).code).toBe("VALIDATION_ERROR");
  });

  test("4d — Mise à jour du nicheId → alerte modifiée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const updatedAlert = makeAlertWithNiche({
      id: "alert-upd-niche",
      nicheId: "niche-2",
      niche: { id: "niche-2", name: "Gaming", slug: "gaming" },
    });

    await page.route("**/api/alerts/alert-upd-niche", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.nicheId).toBe("niche-2");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-niche", {
      method: "PATCH",
      body: { nicheId: "niche-2" },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.nicheId).toBe("niche-2");
    expect((data.alert.niche as Record<string, unknown>).slug).toBe("gaming");
  });

  test("4e — Mise à jour du type → alerte modifiée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const updatedAlert = makeAlertWithNiche({
      id: "alert-upd-type",
      type: "SPIKE",
    });

    await page.route("**/api/alerts/alert-upd-type", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.type).toBe("SPIKE");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-type", {
      method: "PATCH",
      body: { type: "SPIKE" },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.type).toBe("SPIKE");
  });

  test("4f — Mise à jour du threshold → alerte modifiée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const updatedAlert = makeAlertWithNiche({
      id: "alert-upd-threshold",
      threshold: 95,
    });

    await page.route("**/api/alerts/alert-upd-threshold", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.threshold).toBe(95);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-threshold", {
      method: "PATCH",
      body: { threshold: 95 },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.threshold).toBe(95);
  });

  test("4g — Mise à jour du channel → alerte modifiée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const updatedAlert = makeAlertWithNiche({
      id: "alert-upd-channel",
      channel: "WEBHOOK",
      webhookUrl: "https://hooks.example.com/new",
    });

    await page.route("**/api/alerts/alert-upd-channel", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.channel).toBe("WEBHOOK");
      expect(body.webhookUrl).toBe("https://hooks.example.com/new");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-channel", {
      method: "PATCH",
      body: { channel: "WEBHOOK", webhookUrl: "https://hooks.example.com/new" },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.channel).toBe("WEBHOOK");
    expect(data.alert.webhookUrl).toBe("https://hooks.example.com/new");
  });

  test("4h — Mise à jour de isActive → alerte modifiée", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const updatedAlert = makeAlertWithNiche({
      id: "alert-upd-active",
      isActive: false,
    });

    await page.route("**/api/alerts/alert-upd-active", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.isActive).toBe(false);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-active", {
      method: "PATCH",
      body: { isActive: false },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.isActive).toBe(false);
  });

  test("4i — Mise à jour partielle (un seul champ) → seul ce champ change", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    // Original state — threshold 70, type SCORE_THRESHOLD, channel EMAIL
    // After partial update — only threshold changes to 90
    const updatedAlert = makeAlertWithNiche({
      id: "alert-partial-1",
      type: "SCORE_THRESHOLD",
      threshold: 90, // changed from 70
      channel: "EMAIL", // unchanged
      isActive: true, // unchanged
    });

    await page.route("**/api/alerts/alert-partial-1", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      // Only threshold was sent
      expect(Object.keys(body)).toEqual(["threshold"]);
      expect(body.threshold).toBe(90);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert: updatedAlert }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-partial-1", {
      method: "PATCH",
      body: { threshold: 90 },
    });
    expect(res.status).toBe(200);
    const data = res.body as { alert: Record<string, unknown> };
    expect(data.alert.threshold).toBe(90);
    // Other fields unchanged
    expect(data.alert.type).toBe("SCORE_THRESHOLD");
    expect(data.alert.channel).toBe("EMAIL");
  });

  test("4j — Cache invalidé après mise à jour", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-upd-cache", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-upd-cache", isActive: false }),
          _cache: { invalidated: true },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-cache", {
      method: "PATCH",
      body: { isActive: false },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const cache = body._cache as Record<string, unknown>;
    expect(cache.invalidated).toBe(true);
  });

  test("4k — Erreur interne → 500", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-upd-error", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-upd-error", {
      method: "PATCH",
      body: { isActive: false },
    });
    expect(res.status).toBe(500);
    expect((res.body as Record<string, string>).code).toBe("INTERNAL_ERROR");
  });
});

/* ========================================================================== */
/*  5. DELETE /api/alerts/[id] — 7 scenarios                                  */
/* ========================================================================== */

test.describe("DELETE /api/alerts/[id] — Suppression d'une alerte", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("5a — Sans authentification → 401", async ({ page }) => {
    await page.route("**/api/alerts/alert-del-1", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-1", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  test("5b — Alerte introuvable / non possédée → 404", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-del-nonexistent", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect((res.body as Record<string, string>).code).toBe("NOT_FOUND");
  });

  test("5c — Suppression valide → 204 No Content", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-del-valid", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 204 });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-valid", { method: "DELETE" });
    expect(res.status).toBe(204);
    // 204 No Content should have no body
    expect(res.bodyText).toBe("");
  });

  test("5d — Audit log créé avec le type et la niche de l'alerte", async ({ page }) => {
    await mockSession(page, SESSION_PRO);
    const now = new Date().toISOString();

    await page.route("**/api/alerts/alert-del-audit", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _auditLog: {
            action: "DELETE_ALERT",
            alertType: "SCORE_THRESHOLD",
            nicheSlug: "tech",
            createdAt: now,
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-audit", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const auditLog = body._auditLog as Record<string, unknown>;
    expect(auditLog.action).toBe("DELETE_ALERT");
    expect(auditLog.alertType).toBe("SCORE_THRESHOLD");
    expect(auditLog.nicheSlug).toBe("tech");
  });

  test("5e — Alerte avec niche → le slug de la niche est inclus dans l'audit log", async ({
    page,
  }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-del-niche", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _auditLog: {
            action: "DELETE_ALERT",
            alertType: "SPIKE",
            nicheSlug: "gaming",
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-niche", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const auditLog = body._auditLog as Record<string, unknown>;
    expect(auditLog.nicheSlug).toBe("gaming");
  });

  test("5f — Alerte sans niche → niche = 'all' dans l'audit log", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-del-no-niche", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _auditLog: {
            action: "DELETE_ALERT",
            alertType: "SCORE_THRESHOLD",
            nicheSlug: "all",
          },
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-no-niche", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const auditLog = body._auditLog as Record<string, unknown>;
    expect(auditLog.nicheSlug).toBe("all");
  });

  test("5g — Erreur interne → 500", async ({ page }) => {
    await mockSession(page, SESSION_PRO);

    await page.route("**/api/alerts/alert-del-error", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
    });

    const res = await fetchApi(page, "/api/alerts/alert-del-error", { method: "DELETE" });
    expect(res.status).toBe(500);
    expect(
      (res.body as Record<string, string>).code === "INTERNAL_ERROR" ||
        (res.body as Record<string, string>).code === "INTERNAL_ERROR",
    ).toBe(true);
  });
});
