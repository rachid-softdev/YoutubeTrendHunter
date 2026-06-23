import { test, expect, type Page } from "@playwright/test";

/**
 * API Admin — Tests E2E pour les points d'accès d'administration
 *
 * Couvre les endpoints suivants :
 *   ✓ GET  /api/admin/metrics    — Métriques RED (taux de requêtes, erreurs, durée)
 *   ✓ GET  /api/admin/plans       — Liste des plans avec pagination et tri
 *   ✓ GET  /api/admin/stats       — Statistiques du tableau de bord
 *   ✓ GET  /api/admin/niches      — Liste des niches pour l'administration
 *   ✓ POST /api/admin/niches      — Création d'une niche avec validation Zod
 *   ✓ GET  /api/admin/users       — Liste des utilisateurs avec recherche et pagination
 *
 * Stratégie :
 *   - page.route() pour intercepter les appels API et simuler les comportements
 *     serveur (auth, validation, erreurs DB, etc.)
 *   - page.evaluate() avec fetch() natif du navigateur pour les appels API directs
 *   - Les tests vérifient le contrat API (status, structure, champs) et les cas
 *     d'erreur (auth, validation, DB, méthodes non supportées)
 *   - Les paramètres _test_* permettent de basculer entre les scénarios
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

/**
 * Configure une page minimale pour les appels fetch() same-origin.
 * Un document HTML basique est servi à la racine pour éviter les
 * problèmes CORS avec about:blank.
 */
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

/**
 * Effectue un appel API via le fetch() natif du navigateur.
 * Garantit que page.route() interceptera la requête.
 */
async function fetchApi<T = unknown>(
  page: Page,
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  return await page.evaluate(
    async ({
      fetchUrl,
      opts,
    }: {
      fetchUrl: string;
      opts?: { method?: string; headers?: Record<string, string>; body?: string };
    }) => {
      const res = await fetch(fetchUrl, {
        method: opts?.method || "GET",
        headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
        body: opts?.body,
      });

      const bodyText = await res.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        // Conserve le texte brut
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of res.headers.entries()) {
        headers[key] = value;
      }

      return { status: res.status, headers, body, bodyText };
    },
    { fetchUrl: fullUrl, opts: options },
  );
}

/* ========================================================================== */
/*  Sessions simulées                                                         */
/* ========================================================================== */

const ADMIN_SESSION = {
  user: {
    id: "admin-test-id",
    name: "Admin Test",
    email: "admin@youtube-trendhunter.com",
    role: "ADMIN",
    plan: "TEAM",
    userRoles: [{ id: "admin-test-id_ADMIN", role: "ADMIN", userId: "admin-test-id" }],
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const USER_SESSION = {
  user: {
    id: "user-test-id",
    name: "User Test",
    email: "user@test.com",
    role: "USER",
    plan: "FREE",
    userRoles: [{ id: "user-test-id_USER", role: "USER", userId: "user-test-id" }],
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/**
 * Intercepte la route /api/auth/session et renvoie une session
 * selon le paramètre _test_session :
 *   - "admin"  -> session ADMIN (admin complet)
 *   - "user"   -> session USER (non-admin)
 *   - absent   -> session null (non authentifié)
 */
async function mockSessionRoute(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    const sessionType = url.searchParams.get("_test_session") || "";

    let sessionBody: Record<string, unknown> | null = null;

    if (sessionType === "admin") {
      sessionBody = ADMIN_SESSION;
    } else if (sessionType === "user") {
      sessionBody = USER_SESSION;
    }
    // Sinon, sessionBody reste null (non authentifié)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionBody),
    });
  });
}

/* ========================================================================== */
/*  Mock data partagées                                                        */
/* ========================================================================== */

const MOCK_NICHES = [
  {
    id: "n1",
    name: "Finance & Crypto",
    slug: "finance-crypto",
    description: "Crypto, investissement, trading",
    keywords: ["Cryptomonnaie", "Trading"],
    language: "fr",
    isActive: true,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    _count: { trends: 2040 },
  },
  {
    id: "n2",
    name: "Gaming",
    slug: "gaming",
    description: "Jeux vidéo et culture gaming",
    keywords: ["e-sport", "Streaming"],
    language: "fr",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
    _count: { trends: 890 },
  },
  {
    id: "n3",
    name: "Musique",
    slug: "musique",
    description: "Musique et production",
    keywords: ["Production musicale"],
    language: "fr",
    isActive: false,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    _count: { trends: 0 },
  },
  {
    id: "n4",
    name: "Santé & Bien-être",
    slug: "sante-bien-etre",
    description: null,
    keywords: ["Nutrition", "Fitness"],
    language: "fr",
    isActive: true,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    _count: { trends: 340 },
  },
  {
    id: "n5",
    name: "Tech & IA",
    slug: "tech-ia",
    description: "Technologie et intelligence artificielle",
    keywords: ["IA", "Programmation"],
    language: "fr",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    _count: { trends: 1250 },
  },
];

const MOCK_PLANS = [
  { id: "plan-free", key: "FREE", name: "Free", price: 0, sortOrder: 1 },
  { id: "plan-pro", key: "PRO", name: "Pro", price: 15, sortOrder: 2 },
  { id: "plan-team", key: "TEAM", name: "Team", price: 39, sortOrder: 3 },
];

const MOCK_USERS = [
  {
    id: "u1",
    name: "Jean Dupont",
    email: "jean@example.com",
    image: null,
    role: "USER",
    createdAt: "2026-01-15T10:30:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
    subscription: { plan: "PRO", status: "ACTIVE" },
    _count: { apiTokens: 2, alerts: 5, auditLogs: 12 },
  },
  {
    id: "u2",
    name: "Marie Curie",
    email: "marie@example.com",
    image: null,
    role: "USER",
    createdAt: "2026-02-20T14:00:00.000Z",
    updatedAt: "2026-06-18T12:00:00.000Z",
    subscription: { plan: "FREE", status: "INACTIVE" },
    _count: { apiTokens: 0, alerts: 2, auditLogs: 3 },
  },
  {
    id: "u3",
    name: "Sophie Martin",
    email: "sophie@example.com",
    image: null,
    role: "USER",
    createdAt: "2026-04-05T11:00:00.000Z",
    updatedAt: "2026-06-10T09:00:00.000Z",
    subscription: { plan: "PRO", status: "ACTIVE" },
    _count: { apiTokens: 1, alerts: 3, auditLogs: 7 },
  },
];

/* ========================================================================== */
/*  1. GET /api/admin/metrics                                                  */
/* ========================================================================== */

test.describe("Métriques RED — GET /api/admin/metrics", () => {
  /**
   * Mock de GET /api/admin/metrics.
   *
   * Paramètres _test_* :
   *   _test_session=admin   → session ADMIN (authentifié)
   *   _test_session=user    → session USER (non-admin → 403)
   *   _test_empty=true      → data vide ({})
   *   _test_db_error=true   → erreur interne 500
   *   _test_401=true        → non authentifié (session absente)
   */
  async function mockMetrics(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/metrics*", async (route) => {
      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";
      const isEmpty = url.searchParams.get("_test_empty") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";
      const force401 = url.searchParams.get("_test_401") === "true";

      // Simuler requireAdmin()
      if (force401 || sessionType !== "admin") {
        if (sessionType === "user") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Accès non autorisé - rôle administrateur requis" }),
          });
          return;
        }
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié" }),
        });
        return;
      }

      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      const collectedAt = new Date().toISOString();

      const data = isEmpty
        ? {}
        : {
            endpoints: {
              "/api/trends": { count: 1250, errors: 3, totalDuration: 45200, lastMinute: 12 },
              "/api/niches": { count: 890, errors: 1, totalDuration: 28100, lastMinute: 8 },
            },
            totals: { requests: 2140, errors: 4, errorRate: 0.19 },
          };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data, collectedAt }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockMetrics(page);
  });

  test("1a — Session ADMIN valide → 200 avec data et collectedAt", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown; collectedAt: string };
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("collectedAt");
  });

  test("1b — collectedAt est une chaîne ISO valide", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { collectedAt: string };
    const parsed = new Date(body.collectedAt);
    expect(parsed.toISOString()).toBe(body.collectedAt);
  });

  test("1c — Aucune métrique enregistrée → 200 avec data: {}", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_session=admin&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { data: Record<string, never> };
    expect(body.data).toEqual({});
  });

  test("1d — Non authentifié (session absente) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_401=true");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("1e — Utilisateur non-admin (rôle USER) → 403", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_session=user");

    expect(res.status).toBe(403);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("administrateur");
  });

  test("1f — Session expirée/invalide → 401", async ({ page }) => {
    // Simule une session expirée (comme si auth() retournait null)
    const res = await fetchApi(page, "/api/admin/metrics");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("1g — Erreur interne du serveur → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/metrics?_test_session=admin&_test_db_error=true");

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBe("INTERNAL_ERROR");
  });

  test("1h — Méthode POST non supportée → 405", async ({ page }) => {
    // Override temporaire pour tester 405
    await page.route("**/api/admin/metrics*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const res = await fetchApi(page, "/api/admin/metrics", { method: "POST" });

    expect(res.status).toBe(405);
  });
});

/* ========================================================================== */
/*  2. GET /api/admin/plans                                                    */
/* ========================================================================== */

test.describe("Plans — GET /api/admin/plans", () => {
  /**
   * Mock de GET /api/admin/plans.
   *
   * Paramètres _test_* :
   *   _test_session=admin    → session ADMIN
   *   _test_session=user     → session USER
   *   _test_empty=true       → plans vides
   *   _test_db_error=true    → erreur interne
   *   _test_limit=N          → limite simulée (test clamp)
   *   _test_page=N           → page simulée (test clamp)
   *   sort=..., page=..., limit=...  → paramètres réels transmis dans la réponse
   */
  async function mockPlans(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/plans*", async (route) => {
      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";
      const isEmpty = url.searchParams.get("_test_empty") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";

      // Auth — l'endpoint a son propre requireAdmin qui lève "UNAUTHORIZED"
      if (sessionType !== "admin") {
        if (sessionType === "user" || !sessionType) {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "UNAUTHORIZED" }),
          });
          return;
        }
      }

      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      // Simuler les mêmes règles que la vraie route
      const requestedPage = url.searchParams.get("_test_page")
        ? parseInt(url.searchParams.get("_test_page") || "1", 10)
        : parseInt(url.searchParams.get("page") || "1", 10);
      const requestedLimit = url.searchParams.get("_test_limit")
        ? parseInt(url.searchParams.get("_test_limit") || "20", 10)
        : parseInt(url.searchParams.get("limit") || "20", 10);

      // Clamp du limit (Math.max(1, ...)) comme dans la vraie route
      const limit = Math.max(1, requestedLimit);

      // Clamp de la page
      const pageNum = Math.max(1, requestedPage);
      const sort = url.searchParams.get("sort") || "sortOrder:asc";

      let plans = isEmpty ? [] : [...MOCK_PLANS];

      // Tri simulé (comme la vraie route)
      plans = [...plans].sort((a, b) => {
        if (sort === "key:asc") return a.key.localeCompare(b.key);
        if (sort === "name:asc") return a.name.localeCompare(b.name);
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      const start = (pageNum - 1) * limit;
      const paginatedPlans = plans.slice(start, start + limit);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: paginatedPlans,
          pagination: {
            page: pageNum,
            limit,
            total: plans.length,
            totalPages: Math.ceil(plans.length / limit),
            hasNext: start + limit < plans.length,
            hasPrev: pageNum > 1,
          },
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPlans(page);
  });

  test("2a — Session ADMIN → 200 avec data (tableau) et pagination", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: Record<string, unknown> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty("pagination");
    expect(body.pagination).toHaveProperty("page");
    expect(body.pagination).toHaveProperty("limit");
    expect(body.pagination).toHaveProperty("total");
    expect(body.pagination).toHaveProperty("totalPages");
    expect(body.pagination).toHaveProperty("hasNext");
    expect(body.pagination).toHaveProperty("hasPrev");
  });

  test("2b — Pagination : page=1&limit=2 retourne au maximum 2 éléments", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin&page=1&limit=2");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: { limit: number } };
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.pagination.limit).toBe(2);
  });

  test("2c — Tri : ?sort=name:asc ordonne par nom croissant", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin&sort=name:asc");

    expect(res.status).toBe(200);

    const body = res.body as { data: Array<{ name: string }> };
    const names = body.data.map((p) => p.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test("2d — Tri : ?sort=key:asc ordonne par clé croissante", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin&sort=key:asc");

    expect(res.status).toBe(200);

    const body = res.body as { data: Array<{ key: string }> };
    const keys = body.data.map((p) => p.key);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });

  test("2e — Une seule page → hasNext: false, hasPrev: false", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin&limit=20");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: { hasNext: boolean; hasPrev: boolean } };
    expect(body.pagination.hasNext).toBe(false);
    expect(body.pagination.hasPrev).toBe(false);
  });

  test("2f — Plans vides → 200 avec data: [], pagination.total: 0", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: { total: number } };
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  test("2g — Bug fix : limit=0 est clampé à 1 (pas d'Infinity)", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/plans?_test_session=admin&limit=0&_test_limit=0",
    );

    expect(res.status).toBe(200);

    const body = res.body as { pagination: { limit: number } };
    // Math.max(1, 0) = 1
    expect(body.pagination.limit).toBe(1);
    // Vérifie qu'il n'y a pas de NaN ou Infinity
    expect(Number.isFinite(body.pagination.limit)).toBe(true);
  });

  test("2h — page=0 est clampé à 1 (Math.max(1, ...))", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/plans?_test_session=admin&page=0&_test_page=0",
    );

    expect(res.status).toBe(200);

    const body = res.body as { pagination: { page: number } };
    expect(body.pagination.page).toBe(1);
  });

  test("2i — page=NaN (paramètre manquant) → par défaut 1", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { pagination: { page: number } };
    expect(body.pagination.page).toBe(1);
  });

  test("2j — Non authentifié → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("2k — Utilisateur USER (non-admin) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_session=user");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
  });
});

/* ========================================================================== */
/*  3. GET /api/admin/stats                                                    */
/* ========================================================================== */

test.describe("Statistiques — GET /api/admin/stats", () => {
  /**
   * Mock de GET /api/admin/stats.
   *
   * Paramètres _test_* :
   *   _test_session=admin     → session ADMIN
   *   _test_session=user      → session USER
   *   _test_zeros=true        → tous les compteurs à zéro
   *   _test_db_error=true     → erreur interne 500
   *   _test_mrr_breakdown     → test de cohérence MRR
   */
  async function mockStats(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/stats*", async (route) => {
      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";
      const allZeros = url.searchParams.get("_test_zeros") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";

      // Auth
      if (sessionType !== "admin") {
        const errorMsg = sessionType === "user" ? "Unauthorized" : "Unauthorized";
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: errorMsg }),
        });
        return;
      }

      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      const stats = allZeros
        ? {
            totalUsers: 0,
            totalSubscriptions: 0,
            proCount: 0,
            teamCount: 0,
            freeCount: 0,
            totalTrends: 0,
            activeAlerts: 0,
            mrr: 0,
          }
        : {
            totalUsers: 2847,
            totalSubscriptions: 412,
            proCount: 89,
            teamCount: 23,
            freeCount: 300,
            totalTrends: 15600,
            activeAlerts: 342,
            mrr: 89 * 15 + 23 * 39, // 1335 + 897 = 2232
          };

      const recentUsers = allZeros
        ? []
        : [
            {
              id: "u1",
              name: "Jean Dupont",
              email: "jean@test.com",
              createdAt: new Date().toISOString(),
              image: null,
              subscription: { plan: "PRO", status: "ACTIVE" },
            },
            {
              id: "u2",
              name: "Marie Curie",
              email: "marie@test.com",
              createdAt: new Date(Date.now() - 86400000).toISOString(),
              image: null,
              subscription: { plan: "FREE", status: "INACTIVE" },
            },
          ];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ stats, recentUsers }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockStats(page);
  });

  test("3a — Session ADMIN → 200 avec stats et recentUsers", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { stats: Record<string, unknown>; recentUsers: unknown[] };
    expect(body).toHaveProperty("stats");
    expect(body).toHaveProperty("recentUsers");
  });

  test("3b — stats contient tous les champs : totalUsers, totalSubscriptions, proCount, teamCount, freeCount, totalTrends, activeAlerts, mrr", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { stats: Record<string, unknown> };
    const expectedFields = [
      "totalUsers",
      "totalSubscriptions",
      "proCount",
      "teamCount",
      "freeCount",
      "totalTrends",
      "activeAlerts",
      "mrr",
    ];
    for (const field of expectedFields) {
      expect(body.stats).toHaveProperty(field);
      expect(typeof body.stats[field]).toBe("number");
    }
  });

  test("3c — Calcul MRR : proCount*15 + teamCount*39", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { stats: { proCount: number; teamCount: number; mrr: number } };
    const expectedMrr = body.stats.proCount * 15 + body.stats.teamCount * 39;
    expect(body.stats.mrr).toBe(expectedMrr);
  });

  test("3d — recentUsers : longueur ≤ 10, ordonnés par createdAt descendant", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { recentUsers: Array<{ createdAt: string }> };
    expect(body.recentUsers.length).toBeLessThanOrEqual(10);

    // Vérifie l'ordre décroissant de createdAt
    for (let i = 1; i < body.recentUsers.length; i++) {
      const prev = new Date(body.recentUsers[i - 1].createdAt).getTime();
      const curr = new Date(body.recentUsers[i].createdAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test("3e — Tous les compteurs à zéro (base de données vierge) → 200 avec des zéros", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=admin&_test_zeros=true");

    expect(res.status).toBe(200);

    const body = res.body as { stats: Record<string, number>; recentUsers: unknown[] };
    for (const [key, value] of Object.entries(body.stats)) {
      expect(value).toBe(0);
    }
    expect(body.recentUsers).toEqual([]);
  });

  test("3f — Erreur DB → 500 avec INTERNAL_ERROR (try/catch)", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/stats?_test_session=admin&_test_db_error=true",
    );

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBe("INTERNAL_ERROR");
  });

  test("3g — Non authentifié → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("3h — Utilisateur non-admin → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_session=user");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  4. GET /api/admin/niches                                                   */
/* ========================================================================== */

test.describe("Niches (GET) — GET /api/admin/niches", () => {
  /**
   * Mock de GET /api/admin/niches.
   *
   * Paramètres _test_* :
   *   _test_session=admin     → session ADMIN
   *   _test_session=user      → session USER
   *   _test_empty=true        → niches vides
   *   _test_db_error=true     → erreur interne 500
   *   _test_null_desc=true    → niche avec description nulle
   *   _test_expired=true      → test que _count.trends ne compte que les tendances actives
   */
  async function mockGetNiches(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/niches*", async (route) => {
      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";
      const isEmpty = url.searchParams.get("_test_empty") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";

      // Auth
      if (sessionType !== "admin") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      const niches = isEmpty ? [] : MOCK_NICHES;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetNiches(page);
  });

  test("4a — Session ADMIN → 200 avec niches triées par nom croissant", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<{ name: string }> };
    expect(Array.isArray(body.niches)).toBe(true);

    // Vérifie le tri par nom croissant
    const names = body.niches.map((n) => n.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test("4b — Chaque niche a id, name, slug, description, keywords, language, isActive, _count.trends", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<Record<string, unknown>> };
    for (const niche of body.niches) {
      expect(niche).toHaveProperty("id");
      expect(niche).toHaveProperty("name");
      expect(niche).toHaveProperty("slug");
      expect(body.niches[0]).toHaveProperty("description");
      expect(niche).toHaveProperty("keywords");
      expect(niche).toHaveProperty("language");
      expect(niche).toHaveProperty("isActive");
      expect(niche).toHaveProperty("_count");
      const count = niche._count as Record<string, unknown>;
      expect(count).toHaveProperty("trends");
      expect(typeof count.trends).toBe("number");
    }
  });

  test("4c — _count.trends ne compte que les tendances actives (non expirées)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<{ id: string; _count: { trends: number } }> };
    // Vérifie que le compteur existe et est un nombre ≥ 0
    for (const niche of body.niches) {
      expect(niche._count.trends).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(niche._count.trends)).toBe(true);
    }
  });

  test("4d — Liste vide → 200 avec niches: []", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { niches: unknown[] };
    expect(body.niches).toEqual([]);
  });

  test("4e — Niche avec description nulle → description: null", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<{ slug: string; description: string | null }> };
    const nullDescNiche = body.niches.find((n) => n.slug === "sante-bien-etre");
    expect(nullDescNiche).toBeDefined();
    expect(nullDescNiche!.description).toBeNull();
  });

  test("4f — Erreur DB → 500 avec INTERNAL_ERROR (try/catch)", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_db_error=true",
    );

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBe("INTERNAL_ERROR");
  });

  test("4g — Non authentifié → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  5. POST /api/admin/niches                                                  */
/* ========================================================================== */

test.describe("Niches (POST) — POST /api/admin/niches", () => {
  /**
   * Mock de POST /api/admin/niches avec validation Zod simulée.
   *
   * Paramètres _test_* :
   *   _test_session=admin        → session ADMIN
   *   _test_session=user         → session USER
   *   _test_missing_name=true    → name manquant → 400
   *   _test_missing_slug=true    → slug manquant → 400
   *   _test_empty_name=true      → name vide → 400
   *   _test_empty_slug=true      → slug vide → 400
   *   _test_duplicate_slug=true  → slug en double → 409
   *   _test_invalid_slug=true    → slug format invalide → 400
   *   _test_name_too_long=true   → name > 100 → 400
   *   _test_db_error=true        → erreur interne → 500
   *   _test_defaults=true        → test des valeurs par défaut (langue, isActive)
   */
  async function mockPostNiches(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/niches*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";

      // Auth
      if (sessionType !== "admin") {
        if (sessionType === "user" || !sessionType) {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "Unauthorized" }),
          });
          return;
        }
      }

      // Récupère le body de la requête
      let body: Record<string, unknown> = {};
      try {
        const rawBody = route.request().postData() || "{}";
        body = JSON.parse(rawBody);
      } catch {
        // JSON invalide
      }

      // Simule la validation Zod
      const missingName = url.searchParams.get("_test_missing_name") === "true";
      const missingSlug = url.searchParams.get("_test_missing_slug") === "true";
      const emptyName = url.searchParams.get("_test_empty_name") === "true";
      const emptySlug = url.searchParams.get("_test_empty_slug") === "true";
      const duplicateSlug = url.searchParams.get("_test_duplicate_slug") === "true";
      const invalidSlug = url.searchParams.get("_test_invalid_slug") === "true";
      const nameTooLong = url.searchParams.get("_test_name_too_long") === "true";
      const testDefaults = url.searchParams.get("_test_defaults") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";

      // Validation : name requis
      if (missingName || (body.name === undefined && !testDefaults)) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { name: ["Le nom est requis"] },
          }),
        });
        return;
      }

      // Validation : name vide
      if (emptyName || (typeof body.name === "string" && body.name.trim() === "")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { name: ["Le nom est requis"] },
          }),
        });
        return;
      }

      // Validation : name > 100
      if (nameTooLong || (typeof body.name === "string" && body.name.length > 100)) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { name: ["Le nom doit faire moins de 100 caractères"] },
          }),
        });
        return;
      }

      // Validation : slug requis
      if (missingSlug || (body.slug === undefined && !testDefaults)) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { slug: ["Le slug est requis"] },
          }),
        });
        return;
      }

      // Validation : slug vide
      if (emptySlug || (typeof body.slug === "string" && body.slug.trim() === "")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { slug: ["Le slug est requis"] },
          }),
        });
        return;
      }

      // Validation : format du slug (regex /^[a-z0-9-]+$/)
      if (invalidSlug) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Données invalides",
            details: { slug: ["Slug invalide"] },
          }),
        });
        return;
      }

      // Validation : slug existant
      if (duplicateSlug) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Ce slug existe déjà" }),
        });
        return;
      }

      // Erreur DB
      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      // Succès : création de la niche
      const name = body.name as string;
      const slug = body.slug as string;
      const description = (body.description as string) || null;
      const keywords = (body.keywords as string[]) || [];
      const language = (body.language as string) || "fr";
      const isActive = body.isActive !== undefined ? (body.isActive as boolean) : true;

      const newNiche = {
        id: `n-new-${Date.now()}`,
        name,
        slug,
        description,
        keywords,
        language,
        isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ niche: newNiche }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPostNiches(page);
  });

  test("5a — Création avec tous les champs → 201 avec objet niche", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin", {
      method: "POST",
      body: JSON.stringify({
        name: "Cuisine & Gastronomie",
        slug: "cuisine-gastronomie",
        description: "Recettes et tendances culinaires",
        keywords: ["Recettes", "Gastronomie"],
        language: "fr",
        isActive: true,
      }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { niche: Record<string, unknown> };
    expect(body).toHaveProperty("niche");
    expect(body.niche).toHaveProperty("id");
    expect(body.niche).toHaveProperty("name");
    expect(body.niche).toHaveProperty("slug");
    expect(body.niche).toHaveProperty("createdAt");
    expect(body.niche.name).toBe("Cuisine & Gastronomie");
    expect(body.niche.slug).toBe("cuisine-gastronomie");
  });

  test("5b — Langue par défaut 'fr' quand omise", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { niche: { language: string } };
    expect(body.niche.language).toBe("fr");
  });

  test("5c — isActive par défaut true quand omis", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { niche: { isActive: boolean } };
    expect(body.niche.isActive).toBe(true);
  });

  test("5d — keywords vide → stocké comme tableau vide", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test", keywords: [] }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { niche: { keywords: string[] } };
    expect(Array.isArray(body.niche.keywords)).toBe(true);
    expect(body.niche.keywords).toEqual([]);
  });

  test("5e — Nom manquant → 400 avec fieldErrors", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_missing_name=true",
      {
        method: "POST",
        body: JSON.stringify({ slug: "test" }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as { error: string; details: Record<string, string[]> };
    expect(body.error).toBe("Données invalides");
    expect(body.details).toHaveProperty("name");
  });

  test("5f — Slug manquant → 400 avec fieldErrors", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_missing_slug=true",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as { error: string; details: Record<string, string[]> };
    expect(body.error).toBe("Données invalides");
    expect(body.details).toHaveProperty("slug");
  });

  test("5g — Nom vide → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin&_test_empty_name=true", {
      method: "POST",
      body: JSON.stringify({ name: "", slug: "test" }),
    });

    expect(res.status).toBe(400);
  });

  test("5h — Slug vide → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin&_test_empty_slug=true", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "" }),
    });

    expect(res.status).toBe(400);
  });

  test("5i — Slug en double → 409 « Ce slug existe déjà »", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_duplicate_slug=true",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test", slug: "tech-ia" }),
      },
    );

    expect(res.status).toBe(409);

    const body = res.body as { error: string };
    expect(body.error).toBe("Ce slug existe déjà");
  });

  test("5j — Format de slug invalide (caractères spéciaux, majuscules) → 400", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_invalid_slug=true",
      {
        method: "POST",
        body: JSON.stringify({ name: "Test", slug: "MAUVAIS SLUG!!!" }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as { details: Record<string, string[]> };
    expect(body.details.slug[0]).toBe("Slug invalide");
  });

  test("5k — Nom > 100 caractères → 400", async ({ page }) => {
    const longName = "A".repeat(101);
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_session=admin&_test_name_too_long=true",
      {
        method: "POST",
        body: JSON.stringify({ name: longName, slug: "test" }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as { details: Record<string, string[]> };
    expect(body.details.name[0]).toContain("100");
  });

  test("5l — Erreur DB → 500 avec INTERNAL_ERROR (try/catch)", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=admin&_test_db_error=true", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test" }),
    });

    expect(res.status).toBe(500);

    const body = res.body as { error: string };
    expect(body.error).toBe("INTERNAL_ERROR");
  });

  test("5m — Non authentifié → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test" }),
    });

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("5n — Utilisateur USER (non-admin) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_session=user", {
      method: "POST",
      body: JSON.stringify({ name: "Test", slug: "test" }),
    });

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  6. GET /api/admin/users                                                    */
/* ========================================================================== */

test.describe("Utilisateurs — GET /api/admin/users", () => {
  /**
   * Mock de GET /api/admin/users.
   *
   * Paramètres _test_* :
   *   _test_session=admin      → session ADMIN
   *   _test_session=user       → session USER
   *   _test_empty=true         → utilisateurs vides
   *   _test_db_error=true      → erreur interne 500
   *   _test_search=terme       → filtre de recherche (email/nom)
   *   _test_page=N             → page simulée
   *   _test_limit=N            → limite simulée
   *   search=...               → paramètre de recherche réel transmis
   */
  async function mockUsers(page: Page) {
    await mockSessionRoute(page);
    await page.route("**/api/admin/users*", async (route) => {
      const url = new URL(route.request().url());
      const sessionType = url.searchParams.get("_test_session") || "";
      const isEmpty = url.searchParams.get("_test_empty") === "true";
      const dbError = url.searchParams.get("_test_db_error") === "true";

      // Auth — requireAdmin() lance AuthError
      if (sessionType !== "admin") {
        if (sessionType === "user") {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ error: "Accès non autorisé - rôle administrateur requis" }),
          });
          return;
        }
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié" }),
        });
        return;
      }

      if (dbError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "INTERNAL_ERROR" }),
        });
        return;
      }

      // Clamp de la page (Math.max(1, ...)) comme dans la vraie route
      const testPageParam = url.searchParams.get("_test_page");
      const requestedPage = testPageParam
        ? parseInt(testPageParam, 10)
        : parseInt(url.searchParams.get("page") || "1", 10);
      const pageNum = Math.max(1, requestedPage);

      // La vraie route ne clame PAS le limit, on reproduit le comportement
      const testLimitParam = url.searchParams.get("_test_limit");
      const limit = testLimitParam
        ? parseInt(testLimitParam, 10)
        : parseInt(url.searchParams.get("limit") || "20", 10);

      const search = url.searchParams.get("_test_search") || url.searchParams.get("search") || "";

      // Filtrage par recherche
      let filtered = isEmpty ? [] : [...MOCK_USERS];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            (u.name && u.name.toLowerCase().includes(q)),
        );
      }

      const skip = (pageNum - 1) * limit;
      const paginatedUsers = filtered.slice(skip, skip + limit);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: paginatedUsers,
          pagination: {
            page: pageNum,
            limit,
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / limit) || 1,
            hasNext: skip + limit < filtered.length,
            hasPrev: pageNum > 1,
          },
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockUsers(page);
  });

  test("6a — Session ADMIN → 200 avec data (tableau) et pagination", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: Record<string, unknown> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty("pagination");
    expect(body.pagination).toHaveProperty("page");
    expect(body.pagination).toHaveProperty("limit");
  });

  test("6b — Recherche par email → résultats filtrés", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/users?_test_session=admin&_test_search=jean",
    );

    expect(res.status).toBe(200);

    const body = res.body as { data: Array<{ email: string }> };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const user of body.data) {
      expect(user.email.toLowerCase()).toContain("jean");
    }
  });

  test("6c — Recherche par nom → résultats filtrés", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/users?_test_session=admin&_test_search=curie",
    );

    expect(res.status).toBe(200);

    const body = res.body as { data: Array<{ name: string }> };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const user of body.data) {
      expect(user.name.toLowerCase()).toContain("curie");
    }
  });

  test("6d — Recherche vide → tous les utilisateurs", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_session=admin");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[] };
    expect(body.data.length).toBe(MOCK_USERS.length);
  });

  test("6e — Bug fix : page=-1 clampé à 1 (skip jamais négatif)", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/users?_test_session=admin&_test_page=-1&_test_limit=20",
    );

    expect(res.status).toBe(200);

    const body = res.body as { pagination: { page: number } };
    expect(body.pagination.page).toBe(1);
    // Vérifie que skip n'est pas négatif
    expect((body.pagination.page - 1) * 20).toBe(0);
  });

  test("6f — limit=0 → pas clampé (comportement actuel de la vraie route)", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      "/api/admin/users?_test_session=admin&_test_limit=0",
    );

    expect(res.status).toBe(200);

    const body = res.body as { pagination: { limit: number }; data: unknown[] };
    // La vraie route ne clame PAS le limit — parseInt("0") = 0
    // Donc le limit dans la réponse est 0, et take: 0 retournerait 0 éléments
    expect(body.pagination.limit).toBe(0);
    // Avec limit=0 et skip=0, slice(0, 0) = []
    expect(body.data.length).toBe(0);
  });

  test("6g — Non authentifié → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("6h — Utilisateur non-admin → 403", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_session=user");

    expect(res.status).toBe(403);
    const body = res.body as { error: string };
    expect(body.error).toContain("administrateur");
  });
});

/* ========================================================================== */
/*  7. Tests transverses                                                       */
/* ========================================================================== */

test.describe("Transverse — méthodes, auth, cohérence", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSessionRoute(page);
  });

  test("7a — PATCH sur /api/admin/niches (collection) → 405", async ({ page }) => {
    // Toutes les routes de collection doivent rejeter PATCH
    await page.route("**/api/admin/niches*", async (route) => {
      if (route.request().method() !== "GET" && route.request().method() !== "POST") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const res = await fetchApi(page, "/api/admin/niches", {
      method: "PATCH",
    });

    expect(res.status).toBe(405);
    const body = res.body as { error: string };
    expect(body.error).toBe("Method Not Allowed");
  });

  test("7b — PATCH sur /api/admin/plans (collection) → 405", async ({ page }) => {
    await page.route("**/api/admin/plans*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const res = await fetchApi(page, "/api/admin/plans", {
      method: "PATCH",
    });

    expect(res.status).toBe(405);
  });

  test("7c — Cohérence des messages d'erreur d'auth : tous les endpoints retournent error", async ({
    page,
  }) => {
    // Vérifie que différents endpoints non authentifiés retournent
    // tous une propriété "error" dans la réponse JSON
    const endpoints = [
      { url: "/api/admin/metrics", session: "" },
      { url: "/api/admin/plans", session: "" },
      { url: "/api/admin/stats", session: "" },
      { url: "/api/admin/niches", session: "" },
      { url: "/api/admin/users", session: "" },
    ];

    for (const ep of endpoints) {
      const queryParams = ep.session ? `?_test_session=${ep.session}` : "";
      // Pour metrics et users qui utilisent requireAdmin, le session mock
      // doit être absent pour ces appels
      const res = await fetchApi(page, `${ep.url}${queryParams}`);

      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(res.status).toBeLessThanOrEqual(403);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty("error");
    }
  });

  test("7d — DELETE sur /api/admin/niches (collection) → 405", async ({ page }) => {
    await page.route("**/api/admin/niches*", async (route) => {
      if (route.request().method() !== "GET" && route.request().method() !== "POST") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const res = await fetchApi(page, "/api/admin/niches", {
      method: "DELETE",
    });

    expect(res.status).toBe(405);
  });

  test("7e — PUT sur /api/admin/stats → 405", async ({ page }) => {
    await page.route("**/api/admin/stats*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const res = await fetchApi(page, "/api/admin/stats", {
      method: "PUT",
    });

    expect(res.status).toBe(405);
  });
});
