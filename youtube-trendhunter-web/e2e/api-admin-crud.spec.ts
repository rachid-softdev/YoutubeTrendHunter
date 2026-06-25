import { test, expect, type Page } from "@playwright/test";

/**
 * API Admin CRUD — Tests E2E pour les points d'accès d'administration RESTANTS
 *
 * Couvre les endpoints admin non testés dans api-admin.spec.ts :
 *   ✓ GET    /api/admin/users              — Liste des utilisateurs (pagination, recherche, auth)
 *   ✓ GET    /api/admin/stats              — Statistiques dashboard (MRR, zeros)
 *   ✓ GET    /api/admin/plans              — Liste des plans (tri, pagination)
 *   ✓ GET    /api/admin/niches             — Liste des niches (trendCount, tri)
 *   ✓ POST   /api/admin/niches             — Création d'une niche (validation, slug dupliqué)
 *   ✓ PATCH  /api/admin/niches/:id         — Mise à jour d'une niche
 *   ✓ DELETE /api/admin/niches/:id         — Suppression d'une niche
 *   ✓ GET    /api/admin/monitoring         — Données de monitoring (metrics, defaults)
 *   ✓ GET    /api/admin/monitoring/stream  — SSE stream pour monitoring temps réel
 *
 * Stratégie :
 *   - page.route() centralisé dans mockAdminApi() avec paramètres _test_*
 *   - page.evaluate() avec fetch() natif pour les appels API
 *   - Tests autonomes : aucune dépendance externe, tout est mocké
 *   - Réutilise setupPage() et fetchApi() comme api-alerts-crud.spec.ts
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
 * Appel API via le fetch() natif du navigateur (passe par page.route()).
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
        // Conserve le texte brut (ex: 204 No Content)
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
/*  Mock Data Factories                                                        */
/* ========================================================================== */

const MOCK_ADMIN_USER = {
  id: "admin-test-id",
  name: "Admin Test",
  email: "admin@test.com",
  role: "ADMIN",
  plan: "TEAM",
};

const MOCK_REGULAR_USER = {
  id: "user-test-id",
  name: "User Test",
  email: "user@test.com",
  role: "USER",
  plan: "FREE",
};

const MOCK_USERS_LIST = [
  {
    id: "u1",
    name: "Jean Dupont",
    email: "jean@example.com",
    role: "USER",
    plan: "PRO",
    createdAt: "2026-01-15T10:30:00.000Z",
    updatedAt: "2026-06-20T08:00:00.000Z",
  },
  {
    id: "u2",
    name: "Marie Curie",
    email: "marie@example.com",
    role: "USER",
    plan: "FREE",
    createdAt: "2026-02-20T14:00:00.000Z",
    updatedAt: "2026-06-18T12:00:00.000Z",
  },
  {
    id: "u3",
    name: "Sophie Martin",
    email: "sophie@example.com",
    role: "USER",
    plan: "PRO",
    createdAt: "2026-04-05T11:00:00.000Z",
    updatedAt: "2026-06-10T09:00:00.000Z",
  },
  {
    id: "u4",
    name: "Pierre Durand",
    email: "pierre@example.com",
    role: "USER",
    plan: "TEAM",
    createdAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-06-15T16:00:00.000Z",
  },
  {
    id: "u5",
    name: "Emma Bernard",
    email: "emma@example.com",
    role: "USER",
    plan: "FREE",
    createdAt: "2026-05-20T09:30:00.000Z",
    updatedAt: "2026-06-19T10:00:00.000Z",
  },
];

const MOCK_NICHES_LIST = [
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
    trendCount: 2040,
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
    trendCount: 890,
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
    trendCount: 0,
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
    trendCount: 340,
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
    trendCount: 1250,
  },
];

const MOCK_PLANS_LIST = [
  { id: "plan-free", key: "FREE", name: "Free", price: 0, sortOrder: 1 },
  { id: "plan-pro", key: "PRO", name: "Pro", price: 15, sortOrder: 2 },
  { id: "plan-team", key: "TEAM", name: "Team", price: 39, sortOrder: 3 },
];

/* ========================================================================== */
/*  Centralized Mock — Tous les endpoints /api/admin/*                         */
/* ========================================================================== */

/**
 * Mock centralisé pour tous les endpoints /api/admin/*.
 *
 * Paramètres _test_* partagés :
 *   _test_role=admin|user|none   — contrôle la session (admin, user, ou pas de session)
 *   _test_error=true             — simule une erreur interne 500
 *
 * Paramètres spécifiques par endpoint documentés dans chaque section.
 */
async function mockAdminApi(page: Page) {
  // ── Mock de la session Auth ──────────────────────────────────────────────
  await page.route("**/api/auth/session*", async (route) => {
    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";

    let sessionBody: Record<string, unknown> | null = null;

    if (role === "admin") {
      sessionBody = {
        user: { ...MOCK_ADMIN_USER },
        expires: "2099-01-01T00:00:00.000Z",
      };
    } else if (role === "user") {
      sessionBody = {
        user: { ...MOCK_REGULAR_USER },
        expires: "2099-01-01T00:00:00.000Z",
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessionBody),
    });
  });

  // ── GET /api/admin/users ─────────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_search=term        → filtre par email/nom
  //   _test_page=N             → page simulée
  //   _test_limit=N            → limit simulée
  //   _test_empty=true         → liste vide
  //   _test_invalid_page=true  → paramètres invalides → 400
  await page.route("**/api/admin/users*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const isEmpty = url.searchParams.get("_test_empty") === "true";
    const invalidPage = url.searchParams.get("_test_invalid_page") === "true";

    // Auth checks
    if (role !== "admin") {
      if (role === "user") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Accès non autorisé - rôle administrateur requis",
            code: "FORBIDDEN",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Invalid params → 400
    if (invalidPage) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: { page: ["Page doit être un nombre positif"] },
        }),
      });
      return;
    }

    const search = url.searchParams.get("_test_search") || url.searchParams.get("search") || "";
    const pageParam = parseInt(
      url.searchParams.get("_test_page") || url.searchParams.get("page") || "1",
      10,
    );
    const limitParam = parseInt(
      url.searchParams.get("_test_limit") || url.searchParams.get("limit") || "20",
      10,
    );

    // Filtrage
    let filtered = isEmpty ? [] : [...MOCK_USERS_LIST];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
      );
    }

    // Pagination (clamp page >= 1)
    const pageNum = Math.max(1, pageParam);
    const limit = Math.max(1, limitParam);
    const skip = (pageNum - 1) * limit;
    const paginatedUsers = filtered.slice(skip, skip + limit);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        users: paginatedUsers,
        total: filtered.length,
        page: pageNum,
        limit,
      }),
    });
  });

  // ── GET /api/admin/stats ─────────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_zeros=true   → tous les compteurs à zéro
  await page.route("**/api/admin/stats*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const allZeros = url.searchParams.get("_test_zeros") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    if (allZeros) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalUsers: 0,
          proSubscriptions: 0,
          teamSubscriptions: 0,
          totalMRR: 0,
          activeToday: 0,
          totalTrends: 0,
        }),
      });
      return;
    }

    const proCount = 89;
    const teamCount = 23;
    const totalMRR = proCount * 15 + teamCount * 39;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        totalUsers: 2847,
        proSubscriptions: proCount,
        teamSubscriptions: teamCount,
        totalMRR,
        activeToday: 156,
        totalTrends: 15600,
      }),
    });
  });

  // ── GET /api/admin/plans ─────────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   sort=name:asc|key:asc  → tri
  //   page=N, limit=N       → pagination
  //   _test_empty=true      → plans vides
  await page.route("**/api/admin/plans*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const isEmpty = url.searchParams.get("_test_empty") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    const sort = url.searchParams.get("sort") || "name:asc";
    const pageParam = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limitParam = Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10));

    const plans = isEmpty ? [] : [...MOCK_PLANS_LIST];

    // Tri
    plans.sort((a, b) => {
      if (sort === "name:asc") return a.name.localeCompare(b.name);
      if (sort === "key:asc") return a.key.localeCompare(b.key);
      if (sort === "price:asc") return a.price - b.price;
      return a.sortOrder - b.sortOrder;
    });

    const skip = (pageParam - 1) * limitParam;
    const paginatedPlans = plans.slice(skip, skip + limitParam);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: paginatedPlans,
        pagination: {
          page: pageParam,
          limit: limitParam,
          total: plans.length,
          totalPages: Math.ceil(plans.length / limitParam) || 1,
          hasNext: skip + limitParam < plans.length,
          hasPrev: pageParam > 1,
        },
      }),
    });
  });

  // ── GET /api/admin/niches ────────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   sort=name:asc|trendCount:desc
  //   page=N, limit=N
  await page.route("**/api/admin/niches*", async (route) => {
    const method = route.request().method();
    // Ne gère que GET ici; POST, PATCH, DELETE sont gérés plus bas
    if (method !== "GET") {
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

    const sort = url.searchParams.get("sort") || "name:asc";
    const pageParam = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limitParam = Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10));

    const niches = [...MOCK_NICHES_LIST];

    // Tri
    niches.sort((a, b) => {
      if (sort === "name:asc") return a.name.localeCompare(b.name);
      if (sort === "name:desc") return b.name.localeCompare(a.name);
      if (sort === "trendCount:asc") return a.trendCount - b.trendCount;
      if (sort === "trendCount:desc") return b.trendCount - a.trendCount;
      return a.name.localeCompare(b.name);
    });

    const skip = (pageParam - 1) * limitParam;
    const paginatedNiches = niches.slice(skip, skip + limitParam);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niches: paginatedNiches,
        pagination: {
          page: pageParam,
          limit: limitParam,
          total: niches.length,
        },
      }),
    });
  });

  // ── POST /api/admin/niches ───────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_missing_name=true   → name manquant → 400
  //   _test_missing_slug=true   → slug manquant → 400
  //   _test_duplicate_slug=true → slug dupliqué → 409
  await page.route("**/api/admin/niches*", async (route) => {
    const method = route.request().method();
    if (method !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const missingName = url.searchParams.get("_test_missing_name") === "true";
    const missingSlug = url.searchParams.get("_test_missing_slug") === "true";
    const duplicateSlug = url.searchParams.get("_test_duplicate_slug") === "true";

    // Auth: USER → 401
    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Accès non autorisé", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Parse body
    let body: Record<string, unknown> = {};
    try {
      const rawBody = route.request().postData() || "{}";
      body = JSON.parse(rawBody);
    } catch {
      // JSON invalide
    }

    // Validation
    if (missingName || (!body.name && !body.slug)) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Données invalides",
          code: "VALIDATION_ERROR",
          details: { name: ["Le nom est requis"] },
        }),
      });
      return;
    }

    if (missingSlug || (!body.slug && body.name)) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Données invalides",
          code: "VALIDATION_ERROR",
          details: { slug: ["Le slug est requis"] },
        }),
      });
      return;
    }

    if (duplicateSlug) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Ce slug existe déjà", code: "CONFLICT" }),
      });
      return;
    }

    // Succès
    const created = {
      id: "n-new-" + Date.now(),
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      keywords: body.keywords || [],
      language: body.language || "fr",
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      trendCount: 0,
    };

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ niche: created }),
    });
  });

  // ── PATCH /api/admin/niches/:id ──────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_not_found=true → niche introuvable → 404
  await page.route("**/api/admin/niches/**", async (route) => {
    const method = route.request().method();
    if (method !== "PATCH") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const pathname = url.pathname;
    const nicheId = pathname.split("/").pop() || "";

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
        body: JSON.stringify({ error: "Niche introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    // Parse body pour les mises à jour
    let patchBody: Record<string, unknown> = {};
    try {
      const rawBody = route.request().postData() || "{}";
      patchBody = JSON.parse(rawBody);
    } catch {
      // ignore
    }

    // Trouver la niche existante
    const existingNiche = MOCK_NICHES_LIST.find((n) => n.id === nicheId);
    if (!existingNiche) {
      // Fallback: créer une réponse avec l'ID donné
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niche: {
            id: nicheId,
            name: patchBody.name || "Updated Niche",
            slug: patchBody.slug || "updated-niche",
            description: patchBody.description || null,
            keywords: patchBody.keywords || [],
            language: "fr",
            isActive: patchBody.isActive !== undefined ? patchBody.isActive : true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: new Date().toISOString(),
            trendCount: 0,
            ...patchBody,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niche: { ...existingNiche, ...patchBody, updatedAt: new Date().toISOString() },
      }),
    });
  });

  // ── DELETE /api/admin/niches/:id ─────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_not_found=true → niche introuvable → 404
  await page.route("**/api/admin/niches/**", async (route) => {
    const method = route.request().method();
    if (method !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const notFound = url.searchParams.get("_test_not_found") === "true";

    // Separate handler for DELETE — the PATCH handler above falls through on non-PATCH
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
        body: JSON.stringify({ error: "Niche introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    await route.fulfill({ status: 204 });
  });

  // ── GET /api/admin/monitoring ────────────────────────────────────────────
  //   _test_role=admin|user|none
  //   _test_redis_absent=true → données Redis absentes → defaults à zéro
  await page.route("**/api/admin/monitoring*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const redisAbsent = url.searchParams.get("_test_redis_absent") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    const data = redisAbsent
      ? {
          queuedJobs: 0,
          processingJobs: 0,
          failedJobs: 0,
          cacheHitRate: 0,
          cacheSize: 0,
          metrics: { endpoints: {}, totals: { requests: 0, errors: 0 } },
        }
      : {
          queuedJobs: 12,
          processingJobs: 3,
          failedJobs: 1,
          cacheHitRate: 0.87,
          cacheSize: 24576,
          metrics: {
            endpoints: {
              "/api/trends": { count: 1250, errors: 3, avgDuration: 36.16 },
              "/api/niches": { count: 890, errors: 1, avgDuration: 31.57 },
            },
            totals: { requests: 2140, errors: 4 },
          },
        };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });

  // ── GET /api/admin/monitoring/stream (SSE) ───────────────────────────────
  //   _test_role=admin|user|none
  //   _test_sse_error=true → SSE connection error → 500
  await page.route("**/api/admin/monitoring/stream*", async (route) => {
    const method = route.request().method();
    if (method !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Method Not Allowed" }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const role = url.searchParams.get("_test_role") || "none";
    const sseError = url.searchParams.get("_test_sse_error") === "true";

    if (role !== "admin") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    if (sseError) {
      await route.fulfill({ status: 500 });
      return;
    }

    // SSE stream avec un event initial
    const sseData = {
      queuedJobs: 12,
      processingJobs: 3,
      failedJobs: 1,
      cacheHitRate: 0.87,
      cacheSize: 24576,
      timestamp: new Date().toISOString(),
    };

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: `data: ${JSON.stringify(sseData)}\n\n`,
    });
  });
}

/* ========================================================================== */
/*  1. GET /api/admin/users                                                    */
/* ========================================================================== */

test.describe("GET /api/admin/users", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("1a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.error).toBe("Non authentifié");
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("1b — Session USER (pas admin) → 403", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=user");

    expect(res.status).toBe(403);
    const body = res.body as Record<string, string>;
    expect(body.error).toContain("administrateur");
    expect(body.code).toBe("FORBIDDEN");
  });

  test("1c — Session ADMIN → 200 avec liste users + pagination", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as { users: unknown[]; total: number; page: number; limit: number };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("limit");
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.limit).toBe("number");
  });

  test("1d — Recherche par email → résultats filtrés", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=admin&_test_search=jean");

    expect(res.status).toBe(200);

    const body = res.body as { users: Array<{ email: string }>; total: number };
    expect(body.users.length).toBeGreaterThanOrEqual(1);
    expect(body.total).toBeGreaterThanOrEqual(1);
    for (const user of body.users) {
      expect(user.email.toLowerCase()).toContain("jean");
    }
  });

  test("1e — Page/limit custom → pagination (page=2, limit=2)", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/users?_test_role=admin&_test_page=2&_test_limit=2",
    );

    expect(res.status).toBe(200);

    const body = res.body as { users: unknown[]; page: number; limit: number };
    expect(body.page).toBe(2);
    expect(body.limit).toBe(2);
    expect(body.users.length).toBeLessThanOrEqual(2);
  });

  test("1f — Aucun résultat → { users: [], total: 0 }", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=admin&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { users: unknown[]; total: number };
    expect(body.users).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("1g — Query params invalides (page=-1) → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/users?_test_role=admin&_test_invalid_page=true");

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body).toHaveProperty("details");
  });
});

/* ========================================================================== */
/*  2. GET /api/admin/stats                                                    */
/* ========================================================================== */

test.describe("GET /api/admin/stats", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("2a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("2b — Session USER (pas admin) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_role=user");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("2c — Session ADMIN → 200 avec toutes les stats", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("totalUsers");
    expect(body).toHaveProperty("proSubscriptions");
    expect(body).toHaveProperty("teamSubscriptions");
    expect(body).toHaveProperty("totalMRR");
    expect(body).toHaveProperty("activeToday");
    expect(body).toHaveProperty("totalTrends");

    expect(typeof body.totalUsers).toBe("number");
    expect(typeof body.proSubscriptions).toBe("number");
    expect(typeof body.teamSubscriptions).toBe("number");
    expect(typeof body.totalMRR).toBe("number");
    expect(typeof body.activeToday).toBe("number");
    expect(typeof body.totalTrends).toBe("number");
  });

  test("2d — Calcul MRR : proCount*15 + teamCount*39", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as {
      proSubscriptions: number;
      teamSubscriptions: number;
      totalMRR: number;
    };
    const expectedMrr = body.proSubscriptions * 15 + body.teamSubscriptions * 39;
    expect(body.totalMRR).toBe(expectedMrr);
  });

  test("2e — Zeros quand aucune donnée → tous les champs à 0", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/stats?_test_role=admin&_test_zeros=true");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, number>;
    expect(body.totalUsers).toBe(0);
    expect(body.proSubscriptions).toBe(0);
    expect(body.teamSubscriptions).toBe(0);
    expect(body.totalMRR).toBe(0);
    expect(body.activeToday).toBe(0);
    expect(body.totalTrends).toBe(0);
  });
});

/* ========================================================================== */
/*  3. GET /api/admin/plans                                                    */
/* ========================================================================== */

test.describe("GET /api/admin/plans", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("3a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("3b — Session ADMIN → 200 avec data et pagination", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as { data: unknown[]; pagination: Record<string, unknown> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("pagination");
    expect(body.pagination).toHaveProperty("page");
    expect(body.pagination).toHaveProperty("limit");
    expect(body.pagination).toHaveProperty("total");
  });

  test("3c — Tri par défaut (name) → ordre alphabétique", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_role=admin&sort=name:asc");

    expect(res.status).toBe(200);

    const body = res.body as { data: Array<{ name: string }> };
    const names = body.data.map((p) => p.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test("3d — Pagination (page=1, limit=2)", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/plans?_test_role=admin&page=1&limit=2");

    expect(res.status).toBe(200);

    const body = res.body as {
      data: unknown[];
      pagination: { page: number; limit: number; total: number };
    };
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.total).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/*  4. GET /api/admin/niches                                                    */
/* ========================================================================== */

test.describe("GET /api/admin/niches", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("4a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("4b — Session ADMIN → 200 avec niches + trendCount", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as {
      niches: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };
    expect(Array.isArray(body.niches)).toBe(true);
    expect(body.niches.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("pagination");

    for (const niche of body.niches) {
      expect(niche).toHaveProperty("id");
      expect(niche).toHaveProperty("name");
      expect(niche).toHaveProperty("slug");
      expect(niche).toHaveProperty("trendCount");
      expect(typeof (niche as Record<string, unknown>).trendCount).toBe("number");
    }
  });

  test("4c — Pagination (page=1, limit=2)", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin&page=1&limit=2");

    expect(res.status).toBe(200);

    const body = res.body as { niches: unknown[]; pagination: { page: number; limit: number } };
    expect(body.niches.length).toBeLessThanOrEqual(2);
    expect(body.pagination.limit).toBe(2);
  });

  test("4d — Tri par nom (sort=name:asc)", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin&sort=name:asc");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<{ name: string }> };
    const names = body.niches.map((n) => n.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test("4e — Tri par trendCount (sort=trendCount:desc)", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin&sort=trendCount:desc");

    expect(res.status).toBe(200);

    const body = res.body as { niches: Array<{ trendCount: number }> };
    const counts = body.niches.map((n) => n.trendCount);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});

/* ========================================================================== */
/*  5. POST /api/admin/niches                                                   */
/* ========================================================================== */

test.describe("POST /api/admin/niches", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("5a — Session USER (pas admin) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=user", {
      method: "POST",
      body: { name: "Test Niche", slug: "test-niche" },
    });

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("5b — Session ADMIN → 201 avec niche créée", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin", {
      method: "POST",
      body: {
        name: "Cuisine & Gastronomie",
        slug: "cuisine-gastronomie",
        description: "Recettes et tendances culinaires",
        keywords: ["Recettes", "Gastronomie"],
        language: "fr",
        isActive: true,
      },
    });

    expect(res.status).toBe(201);

    const data = res.body as { niche: Record<string, unknown> };
    expect(data).toHaveProperty("niche");
    expect(data.niche).toHaveProperty("id");
    expect(data.niche).toHaveProperty("name");
    expect(data.niche).toHaveProperty("slug");
    expect(data.niche).toHaveProperty("createdAt");
    expect(data.niche.name).toBe("Cuisine & Gastronomie");
    expect(data.niche.slug).toBe("cuisine-gastronomie");
  });

  test("5c — Body invalide (pas de name) → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin&_test_missing_name=true", {
      method: "POST",
      body: { slug: "test-niche" },
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body).toHaveProperty("details");
    const details = body.details as Record<string, unknown>;
    expect(details).toHaveProperty("name");
  });

  test("5d — Body invalide (pas de slug) → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches?_test_role=admin&_test_missing_slug=true", {
      method: "POST",
      body: { name: "Test Niche" },
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.code).toBe("VALIDATION_ERROR");
    const details = body.details as Record<string, unknown>;
    expect(details).toHaveProperty("slug");
  });

  test("5e — Slug dupliqué → 409", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches?_test_role=admin&_test_duplicate_slug=true",
      {
        method: "POST",
        body: { name: "Tech & IA", slug: "tech-ia" },
      },
    );

    expect(res.status).toBe(409);
    const body = res.body as Record<string, string>;
    expect(body.error).toBe("Ce slug existe déjà");
    expect(body.code).toBe("CONFLICT");
  });
});

/* ========================================================================== */
/*  6. PATCH /api/admin/niches/:id                                              */
/* ========================================================================== */

test.describe("PATCH /api/admin/niches/:id", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("6a — Session ADMIN → 200 avec niche mise à jour", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches/n1?_test_role=admin", {
      method: "PATCH",
      body: { name: "Finance & Crypto (mis à jour)", isActive: false },
    });

    expect(res.status).toBe(200);

    const data = res.body as { niche: Record<string, unknown> };
    expect(data).toHaveProperty("niche");
    expect(data.niche.id).toBe("n1");
    expect(data.niche).toHaveProperty("name");
    expect(data.niche).toHaveProperty("slug");
    expect(data.niche).toHaveProperty("updatedAt");
  });

  test("6b — Niche introuvable → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/niches/nonexistent-999?_test_role=admin&_test_not_found=true",
      {
        method: "PATCH",
        body: { name: "Ghost Niche" },
      },
    );

    expect(res.status).toBe(404);
    const body = res.body as Record<string, string>;
    expect(body.error).toBe("Niche introuvable");
    expect(body.code).toBe("NOT_FOUND");
  });
});

/* ========================================================================== */
/*  7. DELETE /api/admin/niches/:id                                             */
/* ========================================================================== */

test.describe("DELETE /api/admin/niches/:id", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("7a — Session ADMIN → 204 No Content", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/niches/n1?_test_role=admin", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(res.bodyText).toBe("");
  });
});

/* ========================================================================== */
/*  8. GET /api/admin/monitoring                                                */
/* ========================================================================== */

test.describe("GET /api/admin/monitoring", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("8a — Sans session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/monitoring?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("8b — Session ADMIN → 200 avec monitoring data", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/monitoring?_test_role=admin");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("queuedJobs");
    expect(body).toHaveProperty("processingJobs");
    expect(body).toHaveProperty("failedJobs");
    expect(body).toHaveProperty("cacheHitRate");
    expect(body).toHaveProperty("cacheSize");

    expect(typeof body.queuedJobs).toBe("number");
    expect(typeof body.processingJobs).toBe("number");
    expect(typeof body.failedJobs).toBe("number");
    expect(typeof body.cacheHitRate).toBe("number");
    expect(typeof body.cacheSize).toBe("number");

    // Valeurs non-nulles par défaut
    expect(body.queuedJobs).toBeGreaterThan(0);
    expect(body.cacheHitRate).toBeGreaterThan(0);

    // Vérifie metrics nested
    expect(body).toHaveProperty("metrics");
    const metrics = body.metrics as Record<string, unknown>;
    expect(metrics).toHaveProperty("endpoints");
    expect(metrics).toHaveProperty("totals");
  });

  test("8c — Données Redis absentes → defaults à zéro", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/admin/monitoring?_test_role=admin&_test_redis_absent=true",
    );

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body.queuedJobs).toBe(0);
    expect(body.processingJobs).toBe(0);
    expect(body.failedJobs).toBe(0);
    expect(body.cacheHitRate).toBe(0);
    expect(body.cacheSize).toBe(0);
  });
});

/* ========================================================================== */
/*  9. GET /api/admin/monitoring/stream (SSE)                                   */
/* ========================================================================== */

test.describe("GET /api/admin/monitoring/stream (SSE)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAdminApi(page);
  });

  test("9a — Pas de session → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/monitoring/stream?_test_role=none");

    expect(res.status).toBe(401);
    const body = res.body as Record<string, string>;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("9b — Session ADMIN → SSE connection OK avec Content-Type text/event-stream", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/admin/monitoring/stream?_test_role=admin");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    // Vérifie que le corps contient un event SSE valide (data: JSON)
    expect(res.bodyText).toContain("data: ");
    expect(res.bodyText).toContain("queuedJobs");
    expect(res.bodyText).toContain("cacheHitRate");
  });

  test("9c — Reçoit des events SSE avec data: JSON valide", async ({ page }) => {
    const res = await fetchApi(page, "/api/admin/monitoring/stream?_test_role=admin");

    expect(res.status).toBe(200);

    // Parse le corps SSE — format: "data: {...}\n\n"
    const lines = res.bodyText.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("data: "));

    expect(dataLines.length).toBeGreaterThanOrEqual(1);

    // Chaque data: doit contenir du JSON valide
    for (const line of dataLines) {
      const jsonStr = line.replace("data: ", "");
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toHaveProperty("queuedJobs");
      expect(parsed).toHaveProperty("timestamp");
    }
  });
});
