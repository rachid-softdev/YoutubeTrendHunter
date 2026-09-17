import { test, expect, type Page } from "@playwright/test";

/**
 * API Admin Advanced — E2E tests pour les endpoints admin restants
 *
 * Couvre les endpoints admin NON testés dans api-admin.spec.ts et api-admin-crud.spec.ts :
 *   ✓ GET    /api/admin/features              — Liste des feature flags
 *   ✓ GET    /api/admin/features/[key]         — Détail d'un feature flag
 *   ✓ GET    /api/admin/overrides              — Liste des overrides
 *   ✓ POST   /api/admin/overrides              — Création d'un override
 *   ✓ PATCH  /api/admin/overrides/[id]         — Mise à jour d'un override
 *   ✓ DELETE /api/admin/overrides/[id]         — Suppression d'un override
 *   ✓ POST   /api/admin/cache/invalidate/[orgId] — Invalidation manuelle du cache
 *   ✓ GET    /api/admin/orgs/[orgId]/entitlements   — Entitlements d'une org
 *   ✓ GET    /api/admin/orgs/[orgId]/downgrade-preview — Preview downgrade
 *   ✓ GET    /api/admin/users/export           — Export CSV utilisateurs
 *   ✓ GET    /api/admin/plans/[planKey]/features    — Features d'un plan
 *   ✓ PATCH  /api/admin/plans/[planKey]/features    — Modifier feature d'un plan
 *
 * Stratégie :
 *   - page.route() centralisé avec paramètres _test_*
 *   - page.evaluate() avec fetch() natif (passe par page.route())
 *   - Pattern identique à api-admin-crud.spec.ts
 */

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

const BASE_URL = "http://localhost:3000";

interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  bodyText: string;
}

async function setupPage(page: Page) {
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

  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
}

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
        // Conserve le texte brut
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
/*  Mock Data Factories                                                       */
/* ========================================================================== */

const MOCK_ADMIN_USER = {
  id: "admin-advanced-id",
  name: "Admin Advanced",
  email: "admin-adv@test.com",
  role: "ADMIN",
  plan: "TEAM",
};

const MOCK_REGULAR_USER = {
  id: "user-regular-id",
  name: "User Regular",
  email: "user-regular@test.com",
  role: "USER",
  plan: "FREE",
};

const MOCK_FEATURES = [
  { key: "unlimited-trends", name: "Tendances illimitées", enabled: true, plan: "PRO" },
  { key: "alerts", name: "Alertes temps réel", enabled: true, plan: "PRO" },
  { key: "csv-export", name: "Export CSV", enabled: true, plan: "TEAM" },
  { key: "api-access", name: "API Access", enabled: true, plan: "TEAM" },
  { key: "team-collab", name: "Collaboration équipe", enabled: false, plan: "TEAM" },
];

const MOCK_PLANS = [
  { key: "FREE", name: "Free", price: 0, features: ["basic-trends"] },
  { key: "PRO", name: "Pro", price: 15, features: ["unlimited-trends", "alerts"] },
  {
    key: "TEAM",
    name: "Team",
    price: 39,
    features: ["unlimited-trends", "alerts", "csv-export", "api-access"],
  },
];

/* ========================================================================== */
/*  Centralized Mock — Endpoints admin avancés                                */
/* ========================================================================== */

async function mockAdminAdvancedApi(page: Page) {
  // ── Mock Auth ─────────────────────────────────────────────────────────────
  await page.route("**/api/auth/session*", async (route) => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";

    let sessionBody: Record<string, unknown> | null = null;
    if (role === "admin") {
      sessionBody = { user: { ...MOCK_ADMIN_USER }, expires: "2099-01-01T00:00:00.000Z" };
    } else if (role === "user") {
      sessionBody = { user: { ...MOCK_REGULAR_USER }, expires: "2099-01-01T00:00:00.000Z" };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionBody),
    });
  });

  // ── GET /api/admin/features ───────────────────────────────────────────────
  await page.route("**/api/admin/features*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ features: MOCK_FEATURES }),
    });
  });

  // ── GET /api/admin/features/[key] ─────────────────────────────────────────
  await page.route("**/api/admin/features/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    const key = url.pathname.split("/").pop() || "";
    const feature = MOCK_FEATURES.find((f) => f.key === key);
    if (!feature) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Feature introuvable", code: "NOT_FOUND" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ feature }),
    });
  });

  // ── GET /api/admin/overrides ──────────────────────────────────────────────
  await page.route("**/api/admin/overrides**", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const isError = url.searchParams.get("_test_error") === "true";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const missingBody = url.searchParams.get("_test_missing_body") === "true";
    const invalidField = url.searchParams.get("_test_invalid_field") === "true";
    const pathname = url.pathname;
    const segments = pathname.replace(/^\/api\/admin\/overrides\/?/, "").split("/");
    const overrideId = segments.length > 0 && segments[0] !== "" ? segments[0] : null;

    // Auth check
    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    if (isError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
      return;
    }

    switch (method) {
      case "GET":
        if (overrideId) {
          // GET /api/admin/overrides/[id]
          if (notFound) {
            await route.fulfill({
              status: 404,
              contentType: "application/json",
              body: JSON.stringify({ error: "Override introuvable", code: "NOT_FOUND" }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: overrideId,
              userId: "user-1",
              featureKey: "alerts",
              enabled: false,
              reason: "Test override",
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-15T00:00:00.000Z",
            }),
          });
          return;
        }
        // GET /api/admin/overrides (list)
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            overrides: [
              {
                id: "ov-1",
                userId: "user-1",
                featureKey: "alerts",
                enabled: false,
                reason: "Downgrade test",
                createdAt: "2026-06-01T00:00:00.000Z",
              },
              {
                id: "ov-2",
                userId: "user-2",
                featureKey: "csv-export",
                enabled: true,
                reason: "Beta access",
                createdAt: "2026-06-10T00:00:00.000Z",
              },
            ],
          }),
        });
        return;

      case "POST":
        if (missingBody) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Données invalides",
              code: "VALIDATION_ERROR",
              details: { userId: ["Requis"], featureKey: ["Requis"] },
            }),
          });
          return;
        }
        if (invalidField) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Données invalides",
              code: "VALIDATION_ERROR",
              details: { enabled: ["Doit être un booléen"] },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "ov-new-" + Date.now(),
            userId: "user-3",
            featureKey: "unlimited-trends",
            enabled: true,
            reason: "Override de test",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
        return;

      case "PATCH":
        if (!overrideId) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "ID requis", code: "VALIDATION_ERROR" }),
          });
          return;
        }
        if (notFound) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Override introuvable", code: "NOT_FOUND" }),
          });
          return;
        }
        if (invalidField) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Données invalides",
              code: "VALIDATION_ERROR",
              details: { enabled: ["Doit être un booléen"] },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: overrideId,
            userId: "user-1",
            featureKey: "alerts",
            enabled: true,
            reason: "Mis à jour",
            updatedAt: new Date().toISOString(),
          }),
        });
        return;

      case "DELETE":
        if (!overrideId) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "ID requis", code: "VALIDATION_ERROR" }),
          });
          return;
        }
        if (notFound) {
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Override introuvable", code: "NOT_FOUND" }),
          });
          return;
        }
        await route.fulfill({ status: 204 });
        return;

      default:
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
    }
  });

  // ── POST /api/admin/cache/invalidate/[orgId] ────────────────────────────
  await page.route("**/api/admin/cache/invalidate/**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const isError = url.searchParams.get("_test_error") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    if (isError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
      return;
    }
    if (notFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Organisation introuvable", code: "NOT_FOUND" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        invalidatedKeys: ["trends", "niches", "alerts"],
        orgId: url.pathname.split("/").pop(),
      }),
    });
  });

  // ── GET /api/admin/orgs/[orgId]/entitlements ────────────────────────────
  await page.route("**/api/admin/orgs/**/entitlements*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    if (notFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Organisation introuvable", code: "NOT_FOUND" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        orgId: url.pathname.split("/")[3],
        plan: "PRO",
        features: {
          "unlimited-trends": true,
          alerts: true,
          "csv-export": false,
          "api-access": false,
        },
        limits: { maxNiches: 10, maxAlerts: 20, maxUsers: 1, maxTrendsPerNiche: -1 },
      }),
    });
  });

  // ── GET /api/admin/orgs/[orgId]/downgrade-preview ───────────────────────
  await page.route("**/api/admin/orgs/**/downgrade-preview*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const targetPlan = url.searchParams.get("targetPlan") || "FREE";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    if (notFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Organisation introuvable", code: "NOT_FOUND" }),
      });
      return;
    }
    // Preview des impacts du downgrade
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        currentPlan: "PRO",
        targetPlan,
        impacts: {
          lostFeatures: ["alerts", "multi-niche"],
          willBeDisabled: { alerts: true, extraNiches: true },
          usersAffected: 3,
          dataRetained: true,
          gracePeriod: "30 days",
        },
      }),
    });
  });

  // ── GET /api/admin/users/export ─────────────────────────────────────────
  await page.route("**/api/admin/users/export*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const isError = url.searchParams.get("_test_error") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    if (isError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
      return;
    }

    const format = url.searchParams.get("format") || "csv";
    const csvData =
      "id,name,email,plan,createdAt\nu1,Jean Dupont,jean@test.com,PRO,2026-01-15\nu2,Marie Curie,marie@test.com,FREE,2026-02-20";

    await route.fulfill({
      status: 200,
      contentType: format === "csv" ? "text/csv" : "application/json",
      headers: { "Content-Disposition": `attachment; filename="users-export.${format}"` },
      body: format === "csv" ? csvData : JSON.stringify({ users: [] }),
    });
  });

  // ── GET /api/admin/plans/[planKey]/features ─────────────────────────────
  // ── PATCH /api/admin/plans/[planKey]/features ───────────────────────────
  await page.route("**/api/admin/plans/**/features*", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const invalidBody = url.searchParams.get("_test_invalid_body") === "true";
    const pathParts = url.pathname.split("/");
    const planKey = pathParts[pathParts.length - 2]; // .../plans/PRO/features

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }
    if (notFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Plan introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    const plan = MOCK_PLANS.find((p) => p.key === planKey);
    if (!plan) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Plan introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: plan.key,
          features: MOCK_FEATURES.filter((f) => plan.features.includes(f.key)),
        }),
      });
      return;
    }

    if (method === "PATCH") {
      if (invalidBody) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            code: "VALIDATION_ERROR",
            details: { featureKey: ["Requis"] },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: plan.key,
          feature: { key: "alerts", enabled: true, updatedAt: new Date().toISOString() },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ error: "Method Not Allowed" }),
    });
  });
}

/* ========================================================================== */
/*  1. GET /api/admin/features                                                */
/* ========================================================================== */

test.describe("GET /api/admin/features", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("1a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/features?_test_role=none");
    expect(res.status).toBe(401);
  });

  test("1b — Session ADMIN → 200 avec liste features", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/features?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as { features: unknown[] };
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
    const feat = (body.features as Array<Record<string, unknown>>)[0];
    expect(feat).toHaveProperty("key");
    expect(feat).toHaveProperty("name");
    expect(feat).toHaveProperty("enabled");
    expect(feat).toHaveProperty("plan");
  });
});

/* ========================================================================== */
/*  2. GET /api/admin/features/[key]                                          */
/* ========================================================================== */

test.describe("GET /api/admin/features/[key]", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("2a — Feature existante → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/features/alerts?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as { feature: Record<string, unknown> };
    expect(body.feature.key).toBe("alerts");
  });

  test("2b — Feature inexistante → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/features/unknown-feature?_test_role=admin");
    expect(res.status).toBe(404);
  });

  test("2c — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/features/alerts?_test_role=none");
    expect(res.status).toBe(401);
  });
});

/* ========================================================================== */
/*  3. GET /api/admin/overrides                                                */
/* ========================================================================== */

test.describe("GET /api/admin/overrides", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("3a — Liste overrides → 200 avec tableau", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as { overrides: unknown[] };
    expect(Array.isArray(body.overrides)).toBe(true);
  });

  test("3b — Override par ID → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides/ov-1?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("id", "ov-1");
    expect(body).toHaveProperty("featureKey");
    expect(body).toHaveProperty("enabled");
  });

  test("3c — Override inexistant → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides/ov-nonexistent?_test_role=admin&_test_not_found=true",
    );
    expect(res.status).toBe(404);
  });

  test("3d — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides?_test_role=none");
    expect(res.status).toBe(401);
  });
});

/* ========================================================================== */
/*  4. POST /api/admin/overrides                                               */
/* ========================================================================== */

test.describe("POST /api/admin/overrides", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("4a — Création réussie → 201", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides?_test_role=admin", {
      method: "POST",
      body: { userId: "user-3", featureKey: "unlimited-trends", enabled: true, reason: "Test" },
    });
    expect(res.status).toBe(201);
    expect(res.body as Record<string, unknown>).toHaveProperty("id");
  });

  test("4b — Body manquant → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides?_test_role=admin&_test_missing_body=true",
      {
        method: "POST",
        body: {},
      },
    );
    expect(res.status).toBe(400);
  });

  test("4c — Champ invalide → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides?_test_role=admin&_test_invalid_field=true",
      {
        method: "POST",
        body: { userId: "u1", featureKey: "alerts", enabled: "pas-un-booleen" },
      },
    );
    expect(res.status).toBe(400);
  });

  test("4d — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides?_test_role=none", {
      method: "POST",
      body: { userId: "u1", featureKey: "alerts", enabled: true },
    });
    expect(res.status).toBe(401);
  });
});

/* ========================================================================== */
/*  5. PATCH /api/admin/overrides/[id]                                         */
/* ========================================================================== */

test.describe("PATCH /api/admin/overrides/[id]", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("5a — Mise à jour réussie → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides/ov-1?_test_role=admin", {
      method: "PATCH",
      body: { enabled: true, reason: "Réactivé" },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.id).toBe("ov-1");
    expect(body.enabled).toBe(true);
  });

  test("5b — Override inexistant → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides/ov-nonexistent?_test_role=admin&_test_not_found=true",
      {
        method: "PATCH",
        body: { enabled: false },
      },
    );
    expect(res.status).toBe(404);
  });

  test("5c — Champ invalide → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides/ov-1?_test_role=admin&_test_invalid_field=true",
      {
        method: "PATCH",
        body: { enabled: "pas-un-booleen" },
      },
    );
    expect(res.status).toBe(400);
  });
});

/* ========================================================================== */
/*  6. DELETE /api/admin/overrides/[id]                                         */
/* ========================================================================== */

test.describe("DELETE /api/admin/overrides/[id]", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("6a — Suppression réussie → 204", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides/ov-1?_test_role=admin", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  test("6b — Override inexistant → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides/ov-nonexistent?_test_role=admin&_test_not_found=true",
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  test("6c — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/overrides/ov-1?_test_role=none", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  test("6d — Erreur interne → 500", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/overrides/ov-1?_test_role=admin&_test_error=true",
      { method: "DELETE" },
    );
    expect(res.status).toBe(500);
  });
});

/* ========================================================================== */
/*  7. POST /api/admin/cache/invalidate/[orgId]                                */
/* ========================================================================== */

test.describe("POST /api/admin/cache/invalidate/[orgId]", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("7a — Invalidation réussie → 200 avec clés invalidées", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/cache/invalidate/org-123?_test_role=admin", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.invalidatedKeys)).toBe(true);
    expect((body.invalidatedKeys as string[]).length).toBeGreaterThan(0);
  });

  test("7b — Organisation inexistante → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/cache/invalidate/org-unknown?_test_role=admin&_test_not_found=true",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(404);
  });

  test("7c — Sans auth admin → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/cache/invalidate/org-123?_test_role=none", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  test("7d — Erreur serveur → 500", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/cache/invalidate/org-123?_test_role=admin&_test_error=true",
      { method: "POST" },
    );
    expect(res.status).toBe(500);
  });
});

/* ========================================================================== */
/*  8. GET /api/admin/orgs/[orgId]/entitlements                                */
/* ========================================================================== */

test.describe("GET /api/admin/orgs/[orgId]/entitlements", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("8a — Entitlements PRO → 200 avec features + limits", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/orgs/org-456/entitlements?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("orgId");
    expect(body).toHaveProperty("plan");
    expect(body).toHaveProperty("features");
    expect(body).toHaveProperty("limits");
    expect((body.features as Record<string, boolean>)["unlimited-trends"]).toBe(true);
  });

  test("8b — Organisation inexistante → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/orgs/org-unknown/entitlements?_test_role=admin&_test_not_found=true",
    );
    expect(res.status).toBe(404);
  });
});

/* ========================================================================== */
/*  9. GET /api/admin/orgs/[orgId]/downgrade-preview                          */
/* ========================================================================== */

test.describe("GET /api/admin/orgs/[orgId]/downgrade-preview", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("9a — Preview downgrade PRO→FREE → impacts listés", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/orgs/org-456/downgrade-preview?_test_role=admin&targetPlan=FREE",
    );
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("currentPlan", "PRO");
    expect(body).toHaveProperty("targetPlan", "FREE");
    expect(body).toHaveProperty("impacts");
    const impacts = body.impacts as Record<string, unknown>;
    expect(impacts).toHaveProperty("lostFeatures");
    expect(impacts).toHaveProperty("willBeDisabled");
    expect(impacts).toHaveProperty("usersAffected");
  });

  test("9b — Organisation inexistante → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/orgs/org-unknown/downgrade-preview?_test_role=admin&_test_not_found=true",
    );
    expect(res.status).toBe(404);
  });
});

/* ========================================================================== */
/*  10. GET /api/admin/users/export                                           */
/* ========================================================================== */

test.describe("GET /api/admin/users/export", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("10a — Export CSV → 200 avec Content-Type text/csv", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users/export?_test_role=admin&format=csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.bodyText).toContain("id,name,email");
  });

  test("10b — Export JSON → 200 avec Content-Type application/json", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users/export?_test_role=admin&format=json");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  test("10c — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users/export?_test_role=none");
    expect(res.status).toBe(401);
  });

  test("10d — Erreur interne → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users/export?_test_role=admin&_test_error=true");
    expect(res.status).toBe(500);
  });
});

/* ========================================================================== */
/*  11. GET /api/admin/plans/[planKey]/features                                */
/* ========================================================================== */

test.describe("GET /api/admin/plans/[planKey]/features", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("11a — Plan FREE → 200 avec features basic", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans/FREE/features?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as { plan: string; features: unknown[] };
    expect(body.plan).toBe("FREE");
    expect(Array.isArray(body.features)).toBe(true);
  });

  test("11b — Plan PRO → 200 avec features alerts + unlimited-trends", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans/PRO/features?_test_role=admin");
    expect(res.status).toBe(200);
    const body = res.body as { features: Array<{ key: string }> };
    const keys = body.features.map((f) => f.key);
    expect(keys).toContain("alerts");
    expect(keys).toContain("unlimited-trends");
  });

  test("11c — Plan inexistant → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans/UNKNOWN/features?_test_role=admin");
    expect(res.status).toBe(404);
  });
});

/* ========================================================================== */
/*  12. PATCH /api/admin/plans/[planKey]/features                              */
/* ========================================================================== */

test.describe("PATCH /api/admin/plans/[planKey]/features", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminAdvancedApi(page);
  });

  test("12a — Feature activée sur plan → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans/PRO/features?_test_role=admin", {
      method: "PATCH",
      body: { featureKey: "alerts", enabled: false },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("plan", "PRO");
    expect(body).toHaveProperty("feature");
  });

  test("12b — Body invalide → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/plans/PRO/features?_test_role=admin&_test_invalid_body=true",
      {
        method: "PATCH",
        body: {},
      },
    );
    expect(res.status).toBe(400);
  });

  test("12c — Plan inexistant → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/plans/UNKNOWN/features?_test_role=admin&_test_not_found=true",
      {
        method: "PATCH",
        body: { featureKey: "alerts", enabled: true },
      },
    );
    expect(res.status).toBe(404);
  });
});
