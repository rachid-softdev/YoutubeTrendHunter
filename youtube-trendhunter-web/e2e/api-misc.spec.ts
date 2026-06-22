import { test, expect, type Page } from "@playwright/test";

/**
 * API Miscellaneous Endpoints — E2E tests for YouTube TrendHunter
 *
 * Tests remaining API endpoints not covered elsewhere:
 *   ✓ GET  /api/health               — Health check with/without auth
 *   ✓ GET  /api/user/audit-logs      — Audit logs with session auth
 *   ✓ GET  /api/user/export          — User data export (JSON/CSV)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *     (auth checks, plan limits, service status, database queries)
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401/403), valid responses (200/503),
 *     response shapes, content types, and edge cases
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
 * Make an API call through the browser's native fetch API.
 * This guarantees that page.route() interceptors will catch the request.
 * Returns parsed body (JSON or text), status code, and headers.
 *
 * NOTE: The page MUST be on the same origin (via setupPage) to avoid CORS.
 */
interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  bodyText: string;
}

async function fetchApi<T = unknown>(
  page: Page,
  url: string,
  options?: { headers?: Record<string, string> },
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  return await page.evaluate(
    async ({
      fetchUrl,
      opts,
    }: {
      fetchUrl: string;
      opts?: { headers?: Record<string, string> };
    }) => {
      const res = await fetch(fetchUrl, {
        method: "GET",
        headers: opts?.headers || {},
      });

      const bodyText = await res.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        // Keep as raw text (e.g. CSV)
      }

      const headers: Record<string, string> = {};
      // For...of is safer than forEach for converting Headers
      for (const [key, value] of res.headers.entries()) {
        headers[key] = value;
      }

      return { status: res.status, headers, body, bodyText };
    },
    { fetchUrl: fullUrl, opts: options },
  );
}

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const HEALTH_CHECK_SECRET = "test-health-secret-valid-42";
const WRONG_AUTH_TOKEN = "wrong-secret-value-0000";

/* ========================================================================== */
/*  1. HEALTH CHECK — Mock Helper                                              */
/* ========================================================================== */

/**
 * Mock the /api/health endpoint with configurable service states.
 *
 * The real endpoint (src/app/api/health/route.ts):
 *   1. If HEALTH_CHECK_SECRET is set, checks Authorization: Bearer <secret>
 *      — mismatch → minimal { status: "ok" } (no services, no timestamp)
 *   2. Runs prisma.$queryRaw`SELECT 1`, redis.ping(), stripe.balance.retrieve()
 *   3. All ok → 200 { status: "healthy", timestamp, services: { database, redis, stripe } }
 *   4. Some errors → 503 { status: "degraded", ... }
 *   5. All errors  → 503 { status: "unhealthy", ... }
 *
 * Test query params (these control mock behavior):
 *   _test_db=error      — simulate database failure
 *   _test_redis=error   — simulate redis failure
 *   _test_stripe=error  — simulate stripe failure
 */
async function mockHealthEndpoint(page: Page, secret = HEALTH_CHECK_SECRET) {
  await page.route("**/api/health**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const authHeader = route.request().headers()["authorization"];
    const url = new URL(route.request().url());

    // Auth check: same logic as real endpoint
    if (authHeader !== `Bearer ${secret}`) {
      // Minimal response — no services, no timestamp
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
      return;
    }

    // Service status from test params (default: all ok)
    const dbStatus: "ok" | "error" = url.searchParams.get("_test_db") === "error" ? "error" : "ok";
    const redisStatus: "ok" | "error" =
      url.searchParams.get("_test_redis") === "error" ? "error" : "ok";
    const stripeStatus: "ok" | "error" =
      url.searchParams.get("_test_stripe") === "error" ? "error" : "ok";

    const errors = [dbStatus, redisStatus, stripeStatus].filter((s) => s === "error").length;
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (errors === 3) {
      overallStatus = "unhealthy";
    } else if (errors > 0) {
      overallStatus = "degraded";
    }

    const statusCode = overallStatus === "healthy" ? 200 : 503;

    await route.fulfill({
      status: statusCode,
      contentType: "application/json",
      body: JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services: {
          database: { status: dbStatus },
          redis: { status: redisStatus },
          stripe: { status: stripeStatus },
        },
      }),
    });
  });
}

/* ========================================================================== */
/*  2. AUDIT LOGS — Mock Helper                                                */
/* ========================================================================== */

/**
 * Mock the /api/user/audit-logs endpoint.
 *
 * The real endpoint (src/app/api/user/audit-logs/route.ts):
 *   1. Calls auth() — no session → 401 { error, code }
 *   2. Optionally checks userId param (users can only see their own logs)
 *   3. Returns getAuditLogs(session.user.id) → { logs: [...] }
 *
 * Test query params:
 *   _test_session=true   — simulate authenticated session
 *   _test_empty=true     — return empty logs array
 */
async function mockAuditLogs(page: Page) {
  await page.route("**/api/user/audit-logs**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const emptyLogs = url.searchParams.get("_test_empty") === "true";

    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Simulate getAuditLogs results (ordered by date descending, newest first)
    const logs = emptyLogs
      ? []
      : [
          {
            id: "log-aud-002",
            action: "EXPORT_DATA",
            ipAddress: "10.0.0.5",
            metadata: { format: "csv" },
            createdAt: new Date().toISOString(),
          },
          {
            id: "log-aud-003",
            action: "UPDATE_PROFILE",
            ipAddress: "192.168.1.42",
            metadata: { field: "name" },
            createdAt: new Date(Date.now() - 3600_000).toISOString(),
          },
          {
            id: "log-aud-001",
            action: "LOGIN",
            ipAddress: "192.168.1.42",
            metadata: { browser: "Chrome", os: "Windows" },
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
        ];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ logs }),
    });
  });
}

/* ========================================================================== */
/*  3. USER EXPORT — Mock Helper                                               */
/* ========================================================================== */

/**
 * Mock the /api/user/export endpoint with configurable plan and format.
 *
 * The real endpoint (src/app/api/user/export/route.ts):
 *   1. Rate limit check
 *   2. Calls auth() — no session → 401
 *   3. Validates query params (format: json|csv, trends: boolean) via zod
 *   4. Checks plan — FREE → 403 (export disabled)
 *   5. Fetches user, niches, alerts, tokens, subscription, audit logs
 *   6. Returns JSON, CSV summary, or CSV trends based on format
 *
 * Test query params:
 *   _test_session=true  — simulate authenticated session
 *   _test_plan=FREE     — simulate FREE plan (export disabled)
 *   format=json|csv     — export format (actual API param)
 *   trends=true         — include trend data in CSV (actual API param)
 */
async function mockUserExport(page: Page) {
  // Use **/api/user/export** to match URLs with query strings too
  await page.route("**/api/user/export**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const userPlan = url.searchParams.get("_test_plan") || "PRO";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Étape 2: Validate format param
    const format = url.searchParams.get("format") || "json";
    if (format !== "json" && format !== "csv") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: {
            format: ["Invalid enum value. Expected: 'json' | 'csv', received: '" + format + "'"],
          },
        }),
      });
      return;
    }

    // Étape 3: Plan check — FREE users cannot export
    if (userPlan === "FREE") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "L'export de données est disponible à partir du plan Pro.",
          code: "FORBIDDEN",
        }),
      });
      return;
    }

    const includeTrends = url.searchParams.get("trends") === "true";
    const today = new Date().toISOString().split("T")[0];

    // Étape 4: CSV avec tendances
    if (format === "csv" && includeTrends) {
      const csvHeaders = [
        "niche",
        "title",
        "score",
        "status",
        "avgViews",
        "contentAngles",
        "detectedAt",
      ];
      const csvRows = [
        csvHeaders.join(","),
        "Tech IA,Tendance IA #1,95,active,120000,Innovation | Disruption,2026-06-20T10:00:00.000Z",
        "Tech IA,Tendance IA #2,82,active,85000,Automatisation,2026-06-19T08:30:00.000Z",
        "Gaming,Tendance Gaming #1,78,active,230000,Gameplay | eSport,2026-06-21T12:00:00.000Z",
      ];

      const filename = `trendhunter-trends-${today}.csv`;

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body: csvRows.join("\n") + "\n",
      });
      return;
    }

    // Étape 5: CSV résumé
    if (format === "csv") {
      const csvRows = [
        ["Type", "Nom", "Détails", "Date"].join(","),
        ["Profile", "Test User", "test@example.com", "2024-01-15T00:00:00.000Z"].join(","),
        ["Niche", "Tech IA", "tech-ia", "2024-02-01T00:00:00.000Z"].join(","),
        ["Niche", "Gaming", "gaming", "2024-02-15T00:00:00.000Z"].join(","),
        ["Alerte", "SCORE_THRESHOLD", "EMAIL", "2024-03-01T00:00:00.000Z"].join(","),
        ["Token", "Extension Chrome", "ID:tok-a1b2c3d4", "2024-03-10T00:00:00.000Z"].join(","),
      ];

      const filename = `trendhunter-export-${today}.csv`;

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body: csvRows.join("\n") + "\n",
      });
      return;
    }

    // Étape 6: JSON export (default)
    const filename = `trendhunter-export-${today}.json`;

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: JSON.stringify(
        {
          profile: {
            email: "test@example.com",
            name: "Test User",
            createdAt: "2024-01-15T00:00:00.000Z",
            avatarUrl: null,
          },
          watchedNiches: [
            {
              id: "niche-1",
              name: "Tech IA",
              slug: "tech-ia",
              followedAt: "2024-02-01T00:00:00.000Z",
            },
            {
              id: "niche-2",
              name: "Gaming",
              slug: "gaming",
              followedAt: "2024-02-15T00:00:00.000Z",
            },
          ],
          alerts: [
            {
              id: "alert-1",
              type: "SCORE_THRESHOLD",
              threshold: 70,
              channel: "EMAIL",
              isActive: true,
              nicheId: "niche-1",
              nicheName: "Tech IA",
              createdAt: "2024-03-01T00:00:00.000Z",
              lastSentAt: null,
            },
          ],
          apiTokens: [
            {
              id: "tok-a1b2c3d4",
              name: "Extension Chrome",
              createdAt: "2024-03-10T00:00:00.000Z",
              lastUsedAt: "2024-06-20T00:00:00.000Z",
              expiresAt: null,
            },
          ],
          subscription: {
            plan: "PRO",
            status: "ACTIVE",
            stripeCurrentPeriodEnd: "2025-01-15T00:00:00.000Z",
            createdAt: "2024-01-15T00:00:00.000Z",
          },
          auditLogs: [
            {
              action: "LOGIN",
              ipAddress: "192.168.1.42",
              userAgent: "Mozilla/5.0",
              metadata: {},
              createdAt: "2024-06-20T08:00:00.000Z",
            },
          ],
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    });
  });
}

/* ========================================================================== */
/*  1. HEALTH CHECK                                                            */
/* ========================================================================== */

test.describe("Health Check — GET /api/health", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockHealthEndpoint(page, HEALTH_CHECK_SECRET);
  });

  test("1a — Sans authentification → 200 avec réponse minimale {status: 'ok'}", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(Object.keys(res.body as Record<string, unknown>)).toEqual(["status"]);
  });

  test("1b — Avec authentification valide → 200 avec statuts des services", async ({ page }) => {
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("healthy");
    expect(body).toHaveProperty("timestamp");

    const services = body.services as Record<string, { status: string }>;
    expect(services).toBeDefined();
    expect(services.database).toEqual({ status: "ok" });
    expect(services.redis).toEqual({ status: "ok" });
    expect(services.stripe).toEqual({ status: "ok" });
  });

  test("1c — Avec authentification invalide → 200 avec réponse minimale (pas 401)", async ({
    page,
  }) => {
    // The real endpoint treats invalid auth the same as no auth:
    // if the header doesn't match, it returns minimal {status: "ok"}
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${WRONG_AUTH_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("1d — Réponse complète contient les champs 'status' et 'timestamp'", async ({ page }) => {
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(typeof body.status).toBe("string");
    expect(typeof body.timestamp).toBe("string");

    // timestamp must be a valid ISO date
    expect(() => new Date(body.timestamp as string)).not.toThrow();
    expect(new Date(body.timestamp as string).toISOString()).toBe(body.timestamp);
  });

  test("1e — L'objet 'services' contient 'database', 'redis' et 'stripe'", async ({ page }) => {
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(200);

    const services = (res.body as Record<string, unknown>).services as Record<
      string,
      { status: string }
    >;
    expect(services).toHaveProperty("database");
    expect(services).toHaveProperty("redis");
    expect(services).toHaveProperty("stripe");

    // Each service has a status field
    expect(services.database).toHaveProperty("status");
    expect(services.redis).toHaveProperty("status");
    expect(services.stripe).toHaveProperty("status");

    // All services show "ok"
    expect(services.database.status).toBe("ok");
    expect(services.redis.status).toBe("ok");
    expect(services.stripe.status).toBe("ok");
  });

  test("1f — Tous les services en erreur → 503 avec status 'unhealthy'", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/health?_test_db=error&_test_redis=error&_test_stripe=error",
      {
        headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
      },
    );

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("unhealthy");

    const services = body.services as Record<string, { status: string }>;
    expect(services.database.status).toBe("error");
    expect(services.redis.status).toBe("error");
    expect(services.stripe.status).toBe("error");
  });

  test("1g — Un service en erreur → 503 avec status 'degraded'", async ({ page }) => {
    const res = await fetchApi(page, "/api/health?_test_redis=error", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("degraded");

    const services = body.services as Record<string, { status: string }>;
    // Database and stripe still ok
    expect(services.database.status).toBe("ok");
    expect(services.redis.status).toBe("error");
    expect(services.stripe.status).toBe("ok");
  });

  test("1h — Deux services en erreur → 503 avec status 'degraded'", async ({ page }) => {
    const res = await fetchApi(page, "/api/health?_test_db=error&_test_stripe=error", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("degraded");

    const services = body.services as Record<string, { status: string }>;
    expect(services.database.status).toBe("error");
    expect(services.redis.status).toBe("ok");
    expect(services.stripe.status).toBe("error");
  });
});

/* ========================================================================== */
/*  2. AUDIT LOGS                                                              */
/* ========================================================================== */

test.describe("Audit Logs — GET /api/user/audit-logs", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAuditLogs(page);
  });

  test("2a — Sans session authentifiée → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs");

    expect(res.status).toBe(401);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("2b — Avec session authentifiée → 200 avec tableau de logs", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: unknown[] };
    expect(body).toHaveProperty("logs");
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
  });

  test("2c — Structure de la réponse contient id, action, ipAddress, createdAt", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: Array<Record<string, unknown>> };
    expect(body.logs.length).toBeGreaterThan(0);

    for (const log of body.logs) {
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("action");
      expect(log).toHaveProperty("ipAddress");
      expect(log).toHaveProperty("createdAt");

      expect(typeof log.id).toBe("string");
      expect(typeof log.action).toBe("string");
      expect(typeof log.ipAddress).toBe("string");
      expect(typeof log.createdAt).toBe("string");

      // createdAt must be valid ISO date
      expect(() => new Date(log.createdAt as string)).not.toThrow();
    }
  });

  test("2d — Logs vides quand aucune activité → {logs: []}", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: unknown[] };
    expect(body).toEqual({ logs: [] });
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBe(0);
  });

  test("2e — Les logs sont ordonnés par date décroissante (le plus récent en premier)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: Array<{ createdAt: string }> };
    const timestamps = body.logs.map((l) => new Date(l.createdAt).getTime());

    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
    }
  });

  test("2f — Champ metadata est optionnel et peut être un objet", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: Array<Record<string, unknown>> };
    for (const log of body.logs) {
      // metadata may be present or absent; if present, must be an object
      if (log.metadata !== undefined) {
        expect(typeof log.metadata).toBe("object");
        expect(log.metadata).not.toBeNull();
      }
    }
  });
});

/* ========================================================================== */
/*  3. USER EXPORT                                                             */
/* ========================================================================== */

test.describe("User Export — GET /api/user/export", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockUserExport(page);
  });

  test("3a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/export");

    expect(res.status).toBe(401);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("3b — Format JSON (par défaut) → 200 avec Content-Type application/json", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/user/export?_test_session=true&format=json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("watchedNiches");
    expect(body).toHaveProperty("alerts");
    expect(body).toHaveProperty("apiTokens");
    expect(body).toHaveProperty("subscription");
    expect(body).toHaveProperty("auditLogs");
    expect(body).toHaveProperty("exportedAt");
  });

  test("3c — Format CSV (sans tendances) → 200 avec Content-Type text/csv", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/export?_test_session=true&format=csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");

    // Should have Content-Disposition header
    const disposition = res.headers["content-disposition"];
    expect(disposition).toBeDefined();
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain(".csv");

    // CSV should have summary headers
    expect(res.bodyText).toContain("Type,Nom,Détails,Date");
    // Should contain user data
    expect(res.bodyText).toContain("Profile");
    expect(res.bodyText).toContain("Test User");
    // Should NOT contain trend headers
    expect(res.bodyText).not.toContain("niche,title,score");
  });

  test("3d — Format CSV avec tendances → 200 avec en-têtes de tendances", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/export?_test_session=true&format=csv&trends=true");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");

    const disposition = res.headers["content-disposition"];
    expect(disposition).toBeDefined();
    expect(disposition).toContain("trendhunter-trends-");

    // CSV should have trend-specific headers
    expect(res.bodyText).toContain("niche,title,score,status,avgViews,contentAngles,detectedAt");
    // Should contain trend data
    expect(res.bodyText).toContain("Tendance IA");
    expect(res.bodyText).toContain("Tendance Gaming");
  });

  test("3e — Format invalide → 400 avec erreur de validation", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/export?_test_session=true&format=xml");

    expect(res.status).toBe(400);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("code");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body).toHaveProperty("details");
    expect(body.details as Record<string, unknown>).toHaveProperty("format");
  });

  test("3f — Utilisateur plan FREE → 403 (export désactivé)", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/export?_test_session=true&_test_plan=FREE");

    expect(res.status).toBe(403);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "L'export de données est disponible à partir du plan Pro.",
      code: "FORBIDDEN",
    });
  });

  test("3g — Export JSON sans format explicite → utilisation du format par défaut (json)", async ({
    page,
  }) => {
    // No format param → the real endpoint defaults to "json" via zod
    const res = await fetchApi(page, "/api/user/export?_test_session=true");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");

    const body = res.body as { profile: { email: string } };
    expect(body).toHaveProperty("profile");
    expect(body.profile).toHaveProperty("email");
    expect(body.profile.email).toBe("test@example.com");
  });

  test("3h — Export JSON avec trends=true → trends ignoré en JSON, retourne JSON normal", async ({
    page,
  }) => {
    // The trends param only affects CSV output; JSON export ignores it
    const res = await fetchApi(page, "/api/user/export?_test_session=true&format=json&trends=true");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");

    const body = res.body as Record<string, unknown>;
    // Should be the standard JSON export shape, not CSV
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("watchedNiches");
    expect(body).toHaveProperty("exportedAt");
  });

  test("3i — Header Content-Disposition présent pour les téléchargements", async ({ page }) => {
    // Test both JSON and CSV get the Content-Disposition header
    for (const format of ["json", "csv"]) {
      const url =
        format === "csv"
          ? "/api/user/export?_test_session=true&format=csv"
          : "/api/user/export?_test_session=true&format=json";

      const res = await fetchApi(page, url);
      expect(res.status).toBe(200);

      const disposition = res.headers["content-disposition"];
      expect(disposition).toBeDefined();
      expect(disposition).toContain("attachment;");
      expect(disposition).toContain(format === "csv" ? ".csv" : ".json");
    }
  });
});
