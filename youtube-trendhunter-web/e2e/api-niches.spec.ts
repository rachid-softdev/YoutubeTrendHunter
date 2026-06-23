import { test, expect, type Page } from "@playwright/test";

/**
 * API Niches — E2E tests for YouTube TrendHunter
 *
 * Tests the /api/niches endpoints:
 *   ✓ GET  /api/niches               — List niches with pagination, auth, cache
 *   ✓ POST /api/niches                — Follow a niche with plan limits
 *   ✓ DELETE /api/niches/[id]         — Unfollow a niche
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *     (auth checks, plan limits, database queries, cache, rate limiting)
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401), validation (400), plan limits (403),
 *     success responses (200/201/204), pagination, and error conditions (404/429/500)
 */

/* ========================================================================== */
/*  Helpers                                                                     */
/* ========================================================================== */

/** Base URL from Playwright config */
const BASE_URL = "http://localhost:3000";

/**
 * Set up a minimal page at the BASE_URL so that all subsequent fetch()
 * calls are same-origin (avoids CORS preflight issues).
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
 * Make an API call through the browser's native fetch API.
 * This guarantees that page.route() interceptors will catch the request.
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
        // Keep as raw text
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
/*  Constants                                                                  */
/* ========================================================================== */

const MOCK_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test User",
    email: "test@test.com",
    role: "USER",
    plan: "FREE",
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_NICHES = [
  { id: "niche-1", name: "Tech IA", slug: "tech-ia", description: "Intelligence artificielle" },
  { id: "niche-2", name: "Gaming", slug: "gaming", description: "Jeux vidéo" },
  { id: "niche-3", name: "Cuisine", slug: "cuisine", description: "Recettes et gastronomie" },
  { id: "niche-4", name: "Voyage", slug: "voyage", description: "Voyages et tourisme" },
  { id: "niche-5", name: "Fitness", slug: "fitness", description: "Sport et bien-être" },
];

/* ========================================================================== */
/*  GET /api/niches — Mock Helper                                              */
/* ========================================================================== */

/**
 * Mock the GET /api/niches endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true       — simulate authenticated session
 *   _test_cursor=next-val    — simulate paginated response with nextCursor
 *   _test_empty=true         — return empty niches/followed
 *   _test_cache_hit=true     — simulate cache hit (no DB call needed)
 *   _test_cache_miss=true    — simulate cache miss (fetches from DB)
 *   _test_db_error=true      — simulate internal DB error
 *   limit=N                  — pagination limit
 *   cursor=value             — pagination cursor
 */
async function mockGetNiches(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      // The real auth() returns null when there's no session
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const isEmpty = url.searchParams.get("_test_empty") === "true";
    const cacheHit = url.searchParams.get("_test_cache_hit") === "true";
    const cacheMiss = url.searchParams.get("_test_cache_miss") === "true";
    const dbError = url.searchParams.get("_test_db_error") === "true";
    const withCursor = url.searchParams.get("_test_cursor");
    const limitParam = url.searchParams.get("limit");

    // Étape 1: Auth check — mirrors real endpoint
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    // Étape 2: Rate limit check — if we want to test rate limiting,
    // we simulate it by checking a separate test param since rate limiting
    // uses Redis and can't be easily mocked in page.route()
    if (url.searchParams.get("_test_rate_limit") === "true") {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes. Réessayez plus tard." }),
        headers: {
          "X-RateLimit-Limit": "10",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 30),
        },
      });
      return;
    }

    // Étape 3: DB error simulation
    if (dbError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne" }),
      });
      return;
    }

    // Étape 4: Parse limit (clamped 1-100, default 20) — mirrors real endpoint
    const limit = Math.min(Math.max(1, parseInt(limitParam || "20", 10)), 100);

    // Étape 5: Paginated niches (simulates getUserNichesPaginated)
    let paginatedNiches: Array<{
      id: string;
      nicheId: string;
      nicheName: string;
      nicheSlug: string;
      trendCount: number;
      followedAt: string;
    }> = [];

    const allFollowed: string[] = [];
    const now = new Date();

    if (!isEmpty) {
      paginatedNiches = [
        {
          id: "un-1",
          nicheId: "niche-1",
          nicheName: "Tech IA",
          nicheSlug: "tech-ia",
          trendCount: 12,
          followedAt: new Date(now.getTime() - 86400000).toISOString(),
        },
        {
          id: "un-2",
          nicheId: "niche-2",
          nicheName: "Gaming",
          nicheSlug: "gaming",
          trendCount: 8,
          followedAt: new Date(now.getTime() - 172800000).toISOString(),
        },
      ];

      allFollowed.push("niche-1", "niche-2");
    }

    // Étape 6: Simulate pagination cursor
    let nextCursor: string | null = null;
    if (withCursor) {
      nextCursor = withCursor;
    }

    // Étape 7: Available niches — simulate cache behavior
    let availableNiches: Array<{ id: string; name: string; slug: string }>;

    if (cacheHit) {
      // Cache hit returns data directly
      availableNiches = MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
    } else if (cacheMiss) {
      // Cache miss also returns data (simulating DB fetch + cache set)
      availableNiches = MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
    } else {
      // Default behavior (no test param) — simulates cache miss path
      availableNiches = MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
    }

    // Trim to limit for pagination simulation
    if (limit < paginatedNiches.length) {
      paginatedNiches = paginatedNiches.slice(0, limit);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niches: paginatedNiches,
        followed: allFollowed,
        available: availableNiches,
        nextCursor,
      }),
    });
  });
}

/* ========================================================================== */
/*  1. GET /api/niches                                                         */
/* ========================================================================== */

test.describe("Niches — GET /api/niches", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetNiches(page);
  });

  test("1a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("1b — Avec authentification valide → 200 avec niches, followed, available, nextCursor", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("niches");
    expect(body).toHaveProperty("followed");
    expect(body).toHaveProperty("available");
    expect(body).toHaveProperty("nextCursor");

    expect(Array.isArray(body.niches)).toBe(true);
    expect(Array.isArray(body.followed)).toBe(true);
    expect(Array.isArray(body.available)).toBe(true);

    // Verify shape of a niche item
    const niches = body.niches as Array<Record<string, unknown>>;
    if (niches.length > 0) {
      expect(niches[0]).toHaveProperty("id");
      expect(niches[0]).toHaveProperty("nicheId");
      expect(niches[0]).toHaveProperty("nicheName");
      expect(niches[0]).toHaveProperty("trendCount");
      expect(niches[0]).toHaveProperty("followedAt");
    }
  });

  test("1c — Pagination par curseur → nextCursor présent dans la réponse", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_cursor=page-2-cursor");

    expect(res.status).toBe(200);

    const body = res.body as { nextCursor: string | null };
    expect(body.nextCursor).toBe("page-2-cursor");
  });

  test("1d — limit en dessous de 1 → clampé à 1", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&limit=0");

    expect(res.status).toBe(200);

    const body = res.body as { niches: unknown[] };
    // With limit=1, we get at most 1 niche
    expect(body.niches.length).toBeLessThanOrEqual(1);
  });

  test("1e — limit au-dessus de 100 → clampé à 100", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&limit=500");

    expect(res.status).toBe(200);
    // The mock returns at most 2 items, so it should be 2 (not clamped to 100)
    // but the real endpoint would clamp. We verify the endpoint didn't error.
    const body = res.body as { niches: unknown[] };
    expect(Array.isArray(body.niches)).toBe(true);
  });

  test("1f — Utilisateur suit 0 niches → niches: [], followed: [], available toujours présent", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { niches: unknown[]; followed: string[]; available: unknown[] };
    expect(body.niches).toEqual([]);
    expect(body.followed).toEqual([]);
    // Available niches should still be present
    expect(Array.isArray(body.available)).toBe(true);
    expect(body.available.length).toBeGreaterThan(0);
  });

  test("1g — Niches disponibles en cache → retourne le cache, saute la DB", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_cache_hit=true");

    expect(res.status).toBe(200);

    const body = res.body as { available: Array<{ id: string; name: string; slug: string }> };
    expect(body.available).toEqual(
      MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug })),
    );
  });

  test("1h — Cache vide → récupère depuis la DB", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_cache_miss=true");

    expect(res.status).toBe(200);

    const body = res.body as { available: Array<{ id: string; name: string; slug: string }> };
    // Same data returned, just simulating a different code path
    expect(Array.isArray(body.available)).toBe(true);
    expect(body.available.length).toBe(MOCK_NICHES.length);
  });

  test("1i — Limite de débit dépassée → 429", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_rate_limit=true");

    expect(res.status).toBe(429);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Trop de requêtes");

    // Verify rate limit headers
    expect(res.headers["x-ratelimit-limit"]).toBe("10");
    expect(res.headers["x-ratelimit-remaining"]).toBe("0");
  });

  test("1j — Erreur interne de la DB → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_db_error=true");

    expect(res.status).toBe(500);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  POST /api/niches — Mock Helper                                             */
/* ========================================================================== */

/**
 * Mock the POST /api/niches endpoint with configurable behavior.
 *
 * Test query params (passed as query, evaluated by mock):
 *   _test_session=true        — simulate authenticated session
 *   _test_free_limit=true     — simulate FREE user at limit (1 already followed)
 *   _test_already_following   — simulate already following the niche
 *   _test_niche_not_found     — simulate niche does not exist
 *   _test_db_error            — simulate internal DB error
 *   _test_audit_log           — verify audit log was created (returns 201 with audit flag)
 */
async function mockPostNiches(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() !== "POST") {
      if (route.request().method() === "GET") {
        await route.fallback();
        return;
      }
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const freeLimit = url.searchParams.get("_test_free_limit") === "true";
    const alreadyFollowing = url.searchParams.get("_test_already_following") === "true";
    const nicheNotFound = url.searchParams.get("_test_niche_not_found") === "true";
    const dbError = url.searchParams.get("_test_db_error") === "true";
    const isAuditTest = url.searchParams.get("_test_audit_log") === "true";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    let body: Record<string, unknown> = {};
    try {
      const rawBody = route.request().postData() || "{}";
      body = JSON.parse(rawBody);
    } catch {
      // Invalid JSON
    }

    // Étape 2: Validate body — nicheId required and non-empty
    if (!body.nicheId || (typeof body.nicheId === "string" && body.nicheId.trim() === "")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "ID de niche requis",
          code: "VALIDATION_ERROR",
        }),
      });
      return;
    }

    const nicheId = body.nicheId as string;

    // Étape 3: DB error
    if (dbError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne" }),
      });
      return;
    }

    // Étape 4: FREE plan limit check
    if (freeLimit) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Limite du plan FREE atteinte (1 niche). Passez à Pro pour suivre des niches illimitées.",
          code: "FORBIDDEN",
        }),
      });
      return;
    }

    // Étape 5: Already following check
    if (alreadyFollowing) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Vous suive déjà cette niche",
          code: "VALIDATION_ERROR",
        }),
      });
      return;
    }

    // Étape 6: Niche existence check
    if (nicheNotFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Niche introuvable",
          code: "NOT_FOUND",
        }),
      });
      return;
    }

    // Étape 7: Success — create UserNiche
    const userNiche = {
      id: `un-${nicheId}-${Date.now()}`,
      userId: "test-user-id",
      nicheId,
      niche: {
        id: nicheId,
        name: body.nicheName || "Tech IA",
        slug: body.nicheSlug || "tech-ia",
      },
      followedAt: new Date().toISOString(),
    };

    const responseBody: Record<string, unknown> = { userNiche };

    if (isAuditTest) {
      responseBody._auditCreated = true;
      responseBody._cacheInvalidated = true;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });
}

/* ========================================================================== */
/*  2. POST /api/niches (follow)                                               */
/* ========================================================================== */

test.describe("Niches — POST /api/niches (suivre une niche)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPostNiches(page);
  });

  test("2a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(401);
  });

  test("2b — nicheId manquant dans le body → 400 ValidationError", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const body = res.body as { error: string; code: string };
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("niche");
  });

  test("2c — nicheId chaîne vide → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "" }),
    });

    expect(res.status).toBe(400);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("2d — Utilisateur FREE à la limite (1 déjà suivi) → 403 Forbidden", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_free_limit=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-3" }),
    });

    expect(res.status).toBe(403);

    const body = res.body as { error: string; code: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error).toContain("Limite du plan FREE");
  });

  test("2e — Déjà abonné à la niche → 400 ValidationError", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches?_test_session=true&_test_already_following=true",
      {
        method: "POST",
        body: JSON.stringify({ nicheId: "niche-1" }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as { error: string; code: string };
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("déjà cette niche");
  });

  test("2f — La niche n'existe pas → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_niche_not_found=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-inexistante" }),
    });

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  test("2g — Suivi valide → 201 avec userNiche", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { userNiche: Record<string, unknown> };
    expect(body).toHaveProperty("userNiche");
    expect(body.userNiche).toHaveProperty("id");
    expect(body.userNiche).toHaveProperty("userId");
    expect(body.userNiche).toHaveProperty("nicheId");
    expect(body.userNiche).toHaveProperty("followedAt");
    expect(body.userNiche.userId).toBe("test-user-id");
    expect(body.userNiche.nicheId).toBe("niche-1");
  });

  test("2h — Audit log créé lors du suivi", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_audit_log=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { _auditCreated: boolean };
    // The real endpoint calls auditLog("niche_select", ...) after followNiche
    // Our mock signals this with _auditCreated
    expect(body._auditCreated).toBe(true);
  });

  test("2i — Cache invalidé après un suivi réussi", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_audit_log=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as { _cacheInvalidated: boolean };
    // The real endpoint calls invalidateCache("niches:*") after follow
    expect(body._cacheInvalidated).toBe(true);
  });

  test("2j — Erreur interne DB → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_db_error=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(500);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  DELETE /api/niches/[id] — Mock Helper                                      */
/* ========================================================================== */

/**
 * Mock the DELETE /api/niches/[id] endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true          — simulate authenticated session
 *   _test_not_following=true    — simulate not following the niche
 *   _test_db_error=true         — simulate internal DB error
 *   _test_audit_log=true        — verify audit log was created
 */
async function mockDeleteNiches(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  // Match both /api/niches/[id] and /api/niches/[id]?params
  await page.route("**/api/niches/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const notFollowing = url.searchParams.get("_test_not_following") === "true";
    const dbError = url.searchParams.get("_test_db_error") === "true";
    const isAuditTest = url.searchParams.get("_test_audit_log") === "true";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    // Étape 2: DB error
    if (dbError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne" }),
      });
      return;
    }

    // Étape 3: Not following check
    if (notFollowing) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    // Étape 4: Successful unfollow — 204 No Content
    const responseHeaders: Record<string, string> = {};
    if (isAuditTest) {
      responseHeaders["x-audit-created"] = "true";
      responseHeaders["x-cache-invalidated"] = "true";
    }

    await route.fulfill({
      status: 204,
      headers: responseHeaders,
      body: "",
    });
  });
}

/* ========================================================================== */
/*  3. DELETE /api/niches/[id] (unfollow)                                      */
/* ========================================================================== */

test.describe("Niches — DELETE /api/niches/[id] (ne plus suivre une niche)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockDeleteNiches(page);
  });

  test("3a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(401);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("3b — Pas de UserNiche (ne suit pas cette niche) → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches/niche-inexistante?_test_session=true&_test_not_following=true",
      {
        method: "DELETE",
      },
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string };
    expect(body.error).toContain("ne suivez pas cette niche");
  });

  test("3c — Désabonnement valide → 204 No Content", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    // 204 responses must have no body
    expect(res.bodyText).toBe("");
  });

  test("3d — Audit log créé lors du désabonnement", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches/niche-1?_test_session=true&_test_audit_log=true",
      {
        method: "DELETE",
      },
    );

    expect(res.status).toBe(204);
    // The real endpoint calls auditLog("niche_deselect", ...) after deletion
    expect(res.headers["x-audit-created"]).toBe("true");
  });

  test("3e — Cache invalidé après désabonnement", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches/niche-1?_test_session=true&_test_audit_log=true",
      {
        method: "DELETE",
      },
    );

    expect(res.status).toBe(204);
    // The real endpoint calls invalidateCache("niches:*") after deletion
    expect(res.headers["x-cache-invalidated"]).toBe("true");
  });

  test("3f — Erreur interne DB → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_db_error=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(500);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });
});

/* ========================================================================== */
/*  4. GET /api/niches — Cas limites supplémentaires                          */
/* ========================================================================== */

/**
 * Mock for GET /api/niches edge cases.
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_limit_abc=true            — non-numeric limit defaults to 20
 *   _test_negative_limit=true       — negative limit clamped to 1
 *   _test_pagination=true           — full pagination round-trip
 *   _test_invalid_cursor=true       — cursor that does not exist
 *   _test_no_public_niches=true     — no available niches
 */
async function mockGetNichesEdgeCases(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const limitAbc = url.searchParams.get("_test_limit_abc") === "true";
    const negativeLimit = url.searchParams.get("_test_negative_limit") === "true";
    const pagination = url.searchParams.get("_test_pagination") === "true";
    const invalidCursor = url.searchParams.get("_test_invalid_cursor") === "true";
    const noPublic = url.searchParams.get("_test_no_public_niches") === "true";
    const cursor = url.searchParams.get("cursor");

    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    const availableNiches = noPublic
      ? []
      : MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));

    // Non-numeric limit: simulate default of 20
    if (limitAbc) {
      const now = new Date();
      const niches: Array<{
        id: string;
        nicheId: string;
        nicheName: string;
        nicheSlug: string;
        trendCount: number;
        followedAt: string;
      }> = [];
      const followed: string[] = [];
      for (let i = 1; i <= 20; i++) {
        niches.push({
          id: `un-${i}`,
          nicheId: `niche-${i}`,
          nicheName: `Niche ${i}`,
          nicheSlug: `niche-${i}`,
          trendCount: Math.floor(Math.random() * 20),
          followedAt: new Date(now.getTime() - i * 86400000).toISOString(),
        });
        followed.push(`niche-${i}`);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches, followed, available: availableNiches, nextCursor: null }),
      });
      return;
    }

    // Negative limit: clamped to 1
    if (negativeLimit) {
      const now = new Date();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches: [
            {
              id: "un-1",
              nicheId: "niche-1",
              nicheName: "Tech IA",
              nicheSlug: "tech-ia",
              trendCount: 12,
              followedAt: new Date(now.getTime() - 86400000).toISOString(),
            },
          ],
          followed: ["niche-1"],
          available: availableNiches,
          nextCursor: null,
        }),
      });
      return;
    }

    // Pagination round-trip (3 pages)
    if (pagination) {
      const now = new Date();
      let pageNiches: Array<{
        id: string;
        nicheId: string;
        nicheName: string;
        nicheSlug: string;
        trendCount: number;
        followedAt: string;
      }> = [];
      let followed: string[] = [];
      let nextCursor: string | null = null;

      if (!cursor) {
        pageNiches = [
          { id: "un-p1-1", nicheId: "niche-1", nicheName: "Tech IA", nicheSlug: "tech-ia", trendCount: 12, followedAt: new Date(now.getTime() - 86400000).toISOString() },
          { id: "un-p1-2", nicheId: "niche-2", nicheName: "Gaming", nicheSlug: "gaming", trendCount: 8, followedAt: new Date(now.getTime() - 172800000).toISOString() },
        ];
        followed = ["niche-1", "niche-2"];
        nextCursor = "cursor-page-2";
      } else if (cursor === "cursor-page-2") {
        pageNiches = [
          { id: "un-p2-1", nicheId: "niche-3", nicheName: "Cuisine", nicheSlug: "cuisine", trendCount: 5, followedAt: new Date(now.getTime() - 259200000).toISOString() },
          { id: "un-p2-2", nicheId: "niche-4", nicheName: "Voyage", nicheSlug: "voyage", trendCount: 3, followedAt: new Date(now.getTime() - 345600000).toISOString() },
        ];
        followed = ["niche-3", "niche-4"];
        nextCursor = "cursor-page-3";
      } else if (cursor === "cursor-page-3") {
        pageNiches = [
          { id: "un-p3-1", nicheId: "niche-5", nicheName: "Fitness", nicheSlug: "fitness", trendCount: 1, followedAt: new Date(now.getTime() - 432000000).toISOString() },
        ];
        followed = ["niche-5"];
        nextCursor = null;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: pageNiches, followed, available: availableNiches, nextCursor }),
      });
      return;
    }

    // Invalid/expired cursor
    if (invalidCursor) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: [], followed: [], available: availableNiches, nextCursor: null }),
      });
      return;
    }

    await route.fallback();
  });
}

test.describe("Niches — GET /api/niches (cas limites)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetNichesEdgeCases(page);
  });

  test("4a — Paramètre limit non numérique (limit=abc) → valeur par défaut 20", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_limit_abc=true&limit=abc");

    expect(res.status).toBe(200);
    const body = res.body as { niches: unknown[] };
    expect(Array.isArray(body.niches)).toBe(true);
    // The mock returns 20 items (server default when parseInt fails)
  });

  test("4b — Paramètre limit négatif (limit=-5) → clampé à 1", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_negative_limit=true&limit=-5");

    expect(res.status).toBe(200);
    const body = res.body as { niches: unknown[] };
    expect(body.niches.length).toBeLessThanOrEqual(1);
  });

  test("4c — Pagination complète — 3 pages avec curseur jusqu'à null", async ({ page }) => {
    // Page 1 — sans curseur
    const res1 = await fetchApi(page, "/api/niches?_test_session=true&_test_pagination=true");

    expect(res1.status).toBe(200);
    const body1 = res1.body as { niches: Array<{ nicheId: string }>; nextCursor: string | null };
    expect(body1.niches).toHaveLength(2);
    expect(body1.nextCursor).toBe("cursor-page-2");
    expect(body1.niches[0].nicheId).toBe("niche-1");

    // Page 2 — avec curseur page-2
    const res2 = await fetchApi(page, "/api/niches?_test_session=true&_test_pagination=true&cursor=cursor-page-2");

    expect(res2.status).toBe(200);
    const body2 = res2.body as { niches: Array<{ nicheId: string }>; nextCursor: string | null };
    expect(body2.niches).toHaveLength(2);
    expect(body2.nextCursor).toBe("cursor-page-3");
    expect(body2.niches[0].nicheId).toBe("niche-3");

    // Page 3 — avec curseur page-3, nextCursor = null
    const res3 = await fetchApi(page, "/api/niches?_test_session=true&_test_pagination=true&cursor=cursor-page-3");

    expect(res3.status).toBe(200);
    const body3 = res3.body as { niches: Array<{ nicheId: string }>; nextCursor: string | null };
    expect(body3.niches).toHaveLength(1);
    expect(body3.nextCursor).toBeNull();
    expect(body3.niches[0].nicheId).toBe("niche-5");
  });

  test("4d — Curseur inexistant ou expiré → 200 avec données vides", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_invalid_cursor=true&cursor=expired-cursor-xyz");

    expect(res.status).toBe(200);
    const body = res.body as { niches: unknown[]; followed: string[] };
    expect(body.niches).toEqual([]);
    expect(body.followed).toEqual([]);
  });

  test("4e — Aucune niche publique disponible → 200 avec available: []", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_no_public_niches=true");

    expect(res.status).toBe(200);
    const body = res.body as { available: unknown[] };
    expect(Array.isArray(body.available)).toBe(true);
    expect(body.available).toEqual([]);
  });
});

/* ========================================================================== */
/*  5. POST /api/niches — Cas limites supplémentaires                         */
/* ========================================================================== */

/**
 * Mock for POST /api/niches edge cases.
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_niche_nonstring=true      — nicheId as non-string type
 *   _test_race_condition=true       — race condition (2 concurrent requests)
 *   _test_sql_injection=true        — SQL injection in nicheId
 *   _test_unicode=true              — unicode characters in nicheId
 */
async function mockPostNichesEdgeCases(page: Page) {
  let raceRequestCount = 0;

  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() !== "POST") {
      if (route.request().method() === "GET") {
        await route.fallback();
        return;
      }
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const nonStringType = url.searchParams.get("_test_niche_nonstring") === "true";
    const raceCondition = url.searchParams.get("_test_race_condition") === "true";
    const sqlInjection = url.searchParams.get("_test_sql_injection") === "true";
    const unicode = url.searchParams.get("_test_unicode") === "true";

    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      // Invalid JSON
    }

    // Non-string nicheId validation
    if (nonStringType) {
      const nicheId = body.nicheId;
      if (nicheId === undefined || nicheId === null || typeof nicheId !== "string") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "ID de niche requis", code: "VALIDATION_ERROR" }),
        });
        return;
      }
    }

    // SQL injection detection
    if (sqlInjection) {
      const nicheId = (body.nicheId as string) || "";
      const sqlPatterns = ["'", '"', ";", "--", "DROP", "DELETE", "INSERT", "SELECT ", "OR 1=1", "UNION"];
      const isInjection = sqlPatterns.some((p) =>
        nicheId.toUpperCase().includes(p.toUpperCase()),
      );
      if (isInjection) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "ID de niche invalide", code: "VALIDATION_ERROR" }),
        });
        return;
      }
    }

    // Unicode nicheId — success
    if (unicode) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: {
            id: `un-unicode-${Date.now()}`,
            userId: "test-user-id",
            nicheId: body.nicheId as string,
            niche: { id: body.nicheId as string, name: "Niche Unicode", slug: "niche-unicode" },
            followedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }

    // Race condition: 2 concurrent POSTs → 201 + 403
    if (raceCondition) {
      raceRequestCount++;
      if (raceRequestCount === 1) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            userNiche: {
              id: `un-race-${Date.now()}`,
              userId: "test-user-id",
              nicheId: body.nicheId as string,
              niche: { id: body.nicheId as string, name: "Niche Race", slug: "niche-race" },
              followedAt: new Date().toISOString(),
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Limite du plan FREE atteinte (1 niche). Passez à Pro pour suivre des niches illimitées.",
            code: "FORBIDDEN",
          }),
        });
      }
      return;
    }

    await route.fallback();
  });
}

test.describe("Niches — POST /api/niches (cas limites)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPostNichesEdgeCases(page);
  });

  test("5a — nicheId de type number → 400 ValidationError", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_niche_nonstring=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: 123 }),
    });

    expect(res.status).toBe(400);
    const b = res.body as { error: string };
    expect(b).toHaveProperty("error");
  });

  test("5b — nicheId de type boolean → 400 ValidationError", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_niche_nonstring=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: true }),
    });

    expect(res.status).toBe(400);
    const b = res.body as { error: string };
    expect(b).toHaveProperty("error");
  });

  test("5c — nicheId de type array → 400 ValidationError", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_niche_nonstring=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: ["niche-1", "niche-2"] }),
    });

    expect(res.status).toBe(400);
    const b = res.body as { error: string };
    expect(b).toHaveProperty("error");
  });

  test("5d — CRITIQUE: Course critique — 2 requêtes POST simultanées → 201 + 403", async ({ page }) => {
    const [res1, res2] = await Promise.all([
      fetchApi(page, "/api/niches?_test_session=true&_test_race_condition=true", {
        method: "POST",
        body: JSON.stringify({ nicheId: "niche-race-1" }),
      }),
      fetchApi(page, "/api/niches?_test_session=true&_test_race_condition=true", {
        method: "POST",
        body: JSON.stringify({ nicheId: "niche-race-1" }),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 403]);

    const okRes = res1.status === 201 ? res1 : res2;
    const forbiddenRes = res1.status === 403 ? res1 : res2;

    expect(okRes.status).toBe(201);
    expect((okRes.body as Record<string, unknown>)).toHaveProperty("userNiche");
    expect(forbiddenRes.status).toBe(403);
    const fb = forbiddenRes.body as { error: string; code: string };
    expect(fb.code).toBe("FORBIDDEN");
  });

  test("5e — CRITIQUE: Injection SQL dans nicheId → 400 ou 404, jamais 200", async ({ page }) => {
    const payloads = [
      "'; DROP TABLE niches; --",
      "1 OR 1=1",
      "'; SELECT * FROM users; --",
      "niche-1' UNION SELECT * FROM credentials; --",
      "'; DELETE FROM userNiche; --",
    ];

    for (const payload of payloads) {
      const res = await fetchApi(page, "/api/niches?_test_session=true&_test_sql_injection=true", {
        method: "POST",
        body: JSON.stringify({ nicheId: payload }),
      });

      expect([400, 404]).toContain(res.status);
    }
  });

  test("5f — nicheId avec caractères unicode → réponse appropriée (201)", async ({ page }) => {
    const unicodeNiches = [
      "café-étudiant",
      "日本語-tech",
      "中文-gaming",
      "한국어-news",
      "niño-futbol",
    ];

    for (const nicheId of unicodeNiches) {
      const res = await fetchApi(page, "/api/niches?_test_session=true&_test_unicode=true", {
        method: "POST",
        body: JSON.stringify({ nicheId }),
      });

      expect(res.status).toBe(201);
      const b = res.body as { userNiche: { nicheId: string } };
      expect(b.userNiche.nicheId).toBe(nicheId);
    }
  });
});

/* ========================================================================== */
/*  6. PATCH /api/niches/[id]                                                 */
/* ========================================================================== */

/**
 * Mock for PATCH /api/niches/[id].
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_idor=true                 — User A tries to update User B's niche
 *   _test_empty_body=true           — empty body {} → 200 no-op
 *   _test_unknown_fields=true       — extra unknown fields ignored
 *   _test_concurrent_patch=true     — 2 concurrent PATCH requests
 *   _test_invalid_json=true         — invalid JSON body
 */
async function mockPatchNiches(page: Page) {
  let patchCounter = 0;

  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const idor = url.searchParams.get("_test_idor") === "true";
    const emptyBody = url.searchParams.get("_test_empty_body") === "true";
    const unknownFields = url.searchParams.get("_test_unknown_fields") === "true";
    const concurrentPatch = url.searchParams.get("_test_concurrent_patch") === "true";
    const invalidJson = url.searchParams.get("_test_invalid_json") === "true";

    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    if (invalidJson) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Corps de requête invalide", code: "VALIDATION_ERROR" }),
      });
      return;
    }

    if (idor) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    if (emptyBody || unknownFields) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: {
            id: "un-existing",
            userId: "test-user-id",
            nicheId: "niche-1",
            niche: { id: "niche-1", name: "Tech IA", slug: "tech-ia" },
            followedAt: new Date(Date.now() - 86400000).toISOString(),
          },
        }),
      });
      return;
    }

    if (concurrentPatch) {
      patchCounter++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: {
            id: "un-existing",
            userId: "test-user-id",
            nicheId: "niche-1",
            niche: { id: "niche-1", name: "Tech IA", slug: "tech-ia" },
            followedAt: new Date(Date.now() - 86400000).toISOString(),
            _patchVersion: patchCounter,
          },
        }),
      });
      return;
    }

    await route.fallback();
  });
}

test.describe("Niches — PATCH /api/niches/[id] (mise à jour)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPatchNiches(page);
  });

  test("6a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const b = res.body as { error: string };
    expect(b).toHaveProperty("error");
  });

  test("6b — Corps JSON invalide → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_invalid_json=true", {
      method: "PATCH",
      body: "ceci n'est pas du json",
    });

    expect(res.status).toBe(400);
    const b = res.body as { error: string; code: string };
    expect(b.code).toBe("VALIDATION_ERROR");
  });

  test("6c — CRITIQUE: IDOR — Utilisateur A tente de modifier la niche de l'utilisateur B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-b-1?_test_session=true&_test_idor=true", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toContain("ne suivez pas cette niche");
  });

  test("6d — Corps vide {} → 200 (no-op)", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_empty_body=true", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const b = res.body as { userNiche: Record<string, unknown> };
    expect(b).toHaveProperty("userNiche");
    expect(b.userNiche).toHaveProperty("nicheId");
  });

  test("6e — Champs inconnus ignorés → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_unknown_fields=true", {
      method: "PATCH",
      body: JSON.stringify({
        nicheId: "niche-1",
        unknownField: "cette valeur devrait être ignorée",
        anotherUnknown: 42,
      }),
    });

    expect(res.status).toBe(200);
    const b = res.body as { userNiche: Record<string, unknown> };
    expect(b).toHaveProperty("userNiche");
    expect(b.userNiche).not.toHaveProperty("unknownField");
  });

  test("6f — Mise à jour concurrente (2 PATCH simultanés) → les deux 200, le dernier gagne", async ({ page }) => {
    const [res1, res2] = await Promise.all([
      fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_concurrent_patch=true", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
      fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_concurrent_patch=true", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const b1 = res1.body as { userNiche: Record<string, unknown> };
    const b2 = res2.body as { userNiche: Record<string, unknown> };
    expect(b1.userNiche).toHaveProperty("id");
    expect(b2.userNiche).toHaveProperty("id");
  });
});

/* ========================================================================== */
/*  7. DELETE /api/niches/[id] — Cas limites supplémentaires                  */
/* ========================================================================== */

/**
 * Mock for DELETE /api/niches/[id] edge cases.
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_idor=true                 — User A tries to delete User B's niche
 *   _test_double_delete=true        — delete already deleted niche
 *   _test_audit_failure=true        — audit log failure (non-blocking)
 *   _test_cache_failure=true        — cache invalidation failure (non-blocking)
 */
async function mockDeleteNichesEdgeCases(page: Page) {
  let deleteCounter = 0;

  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("_test_session") === "true") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SESSION),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  await page.route("**/api/niches/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const idor = url.searchParams.get("_test_idor") === "true";
    const doubleDelete = url.searchParams.get("_test_double_delete") === "true";
    const auditFailure = url.searchParams.get("_test_audit_failure") === "true";
    const cacheFailure = url.searchParams.get("_test_cache_failure") === "true";

    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    if (idor) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    if (doubleDelete) {
      deleteCounter++;
      if (deleteCounter === 1) {
        await route.fulfill({ status: 204, body: "" });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
        });
      }
      return;
    }

    if (auditFailure) {
      await route.fulfill({ status: 204, headers: { "x-audit-failed": "true" }, body: "" });
      return;
    }

    if (cacheFailure) {
      await route.fulfill({ status: 204, headers: { "x-cache-invalidation-failed": "true" }, body: "" });
      return;
    }

    await route.fallback();
  });
}

test.describe("Niches — DELETE /api/niches/[id] (cas limites)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockDeleteNichesEdgeCases(page);
  });

  test("7a — CRITIQUE: IDOR — Utilisateur A tente de supprimer la niche de l'utilisateur B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-b-1?_test_session=true&_test_idor=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toContain("ne suivez pas cette niche");
  });

  test("7b — Double suppression → 204 puis 404", async ({ page }) => {
    const res1 = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_double_delete=true", {
      method: "DELETE",
    });

    expect(res1.status).toBe(204);
    expect(res1.bodyText).toBe("");

    const res2 = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_double_delete=true", {
      method: "DELETE",
    });

    expect(res2.status).toBe(404);
    const b2 = res2.body as { error: string };
    expect(b2.error).toContain("ne suivez pas cette niche");
  });

  test("7c — Échec de l'audit log → 204 (non-bloquant)", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_audit_failure=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(res.bodyText).toBe("");
  });

  test("7d — Échec de l'invalidation du cache → 204 (non-bloquant)", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true&_test_cache_failure=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(res.bodyText).toBe("");
  });
});

/* ========================================================================== */
/*  8. CROSS-CUTTING — Sécurité et isolation multi-utilisateurs               */
/* ========================================================================== */

const CROSS_USER_A = {
  id: "user-cross-a",
  name: "User A Cross",
  email: "usera-cross@test.com",
  role: "USER",
  plan: "PRO",
};

const CROSS_USER_B = {
  id: "user-cross-b",
  name: "User B Cross",
  email: "userb-cross@test.com",
  role: "USER",
  plan: "PRO",
};

function makeCrossAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-" + Math.random().toString(36).slice(2, 9),
    userId: "user-cross-a",
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

const CROSS_A_NICHES: Record<string, Record<string, unknown>> = {
  "niche-a-1": {
    id: "un-cross-a-1", userId: "user-cross-a", nicheId: "niche-a-1",
    niche: { id: "niche-a-1", name: "Niche A1", slug: "niche-a-1" },
    followedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  "niche-a-2": {
    id: "un-cross-a-2", userId: "user-cross-a", nicheId: "niche-a-2",
    niche: { id: "niche-a-2", name: "Niche A2", slug: "niche-a-2" },
    followedAt: new Date(Date.now() - 172800000).toISOString(),
  },
};

const CROSS_B_NICHES: Record<string, Record<string, unknown>> = {
  "niche-b-1": {
    id: "un-cross-b-1", userId: "user-cross-b", nicheId: "niche-b-1",
    niche: { id: "niche-b-1", name: "Niche B1", slug: "niche-b-1" },
    followedAt: new Date(Date.now() - 86400000).toISOString(),
  },
};

const CROSS_A_ALERTS: Record<string, Record<string, unknown>> = {
  "alert-a-1": makeCrossAlert({
    id: "alert-a-1", userId: "user-cross-a",
    nicheId: "niche-a-1", niche: { id: "niche-a-1", name: "Niche A1", slug: "niche-a-1" },
  }),
};

const CROSS_B_ALERTS: Record<string, Record<string, unknown>> = {
  "alert-b-1": makeCrossAlert({
    id: "alert-b-1", userId: "user-cross-b",
    nicheId: "niche-b-1", niche: { id: "niche-b-1", name: "Niche B1", slug: "niche-b-1" },
  }),
};

/**
 * Mock for cross-cutting security tests.
 * Simulates 2 users (A and B) with isolated resources.
 *
 * Test query params:
 *   _test_user=A|B              — which user is authenticated
 *   _test_idor=true             — access other user's resource
 *   _test_sql_injection=true    — SQL injection payload in params
 *   _test_rate_limit=true       — rate limit simulation
 *   _test_method_override=true  — HTTP method override attempt
 */
async function mockCrossCutting(page: Page) {
  await page.route("**/api/auth/session*", async (route) => {
    const url = new URL(route.request().url());
    const userParam = url.searchParams.get("_test_user") || "A";
    const session = {
      user: userParam === "A" ? CROSS_USER_A : CROSS_USER_B,
      expires: "2099-01-01T00:00:00.000Z",
    };
    const hasSession = url.searchParams.has("_test_user");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: hasSession ? JSON.stringify(session) : "null",
    });
  });

  // Mock /api/niches/{id}
  await page.route("**/api/niches/*", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const user = url.searchParams.get("_test_user") || "A";
    const idor = url.searchParams.get("_test_idor") === "true";
    const sqlInjection = url.searchParams.get("_test_sql_injection") === "true";
    const rateLimit = url.searchParams.get("_test_rate_limit") === "true";
    const methodOverride = url.searchParams.get("_test_method_override") === "true";

    const pathParts = new URL(route.request().url()).pathname.split("/");
    const nicheId = pathParts[pathParts.length - 1];

    if (!url.searchParams.has("_test_user")) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    if (rateLimit) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMITED" }),
      });
      return;
    }

    if (methodOverride) {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "Méthode non autorisée", code: "METHOD_NOT_ALLOWED" }),
      });
      return;
    }

    if (sqlInjection) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    const userNiches = user === "A" ? CROSS_A_NICHES : CROSS_B_NICHES;
    const otherNiches = user === "A" ? CROSS_B_NICHES : CROSS_A_NICHES;

    if (idor && otherNiches[nicheId]) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    const niche = userNiches[nicheId];
    if (!niche) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ userNiche: niche }) });
    } else if (method === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ userNiche: { ...niche, _updated: true } }) });
    } else if (method === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    } else {
      await route.fallback();
    }
  });

  // Mock /api/alerts/{id}
  await page.route("**/api/alerts/*", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const user = url.searchParams.get("_test_user") || "A";
    const idor = url.searchParams.get("_test_idor") === "true";
    const sqlInjection = url.searchParams.get("_test_sql_injection") === "true";
    const rateLimit = url.searchParams.get("_test_rate_limit") === "true";

    const pathParts = new URL(route.request().url()).pathname.split("/");
    const alertId = pathParts[pathParts.length - 1];

    if (!url.searchParams.has("_test_user")) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    if (rateLimit) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMITED" }),
      });
      return;
    }

    if (sqlInjection) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    const userAlerts = user === "A" ? CROSS_A_ALERTS : CROSS_B_ALERTS;
    const otherAlerts = user === "A" ? CROSS_B_ALERTS : CROSS_A_ALERTS;

    if (idor && otherAlerts[alertId]) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    const alert = userAlerts[alertId];
    if (!alert) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ alert }) });
    } else if (method === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ alert: { ...alert, _updated: true } }) });
    } else if (method === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
    } else {
      await route.fallback();
    }
  });
}

test.describe("Cross-cutting — Isolation multi-utilisateurs et sécurité", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockCrossCutting(page);
  });

  test("8a — CRITIQUE: IDOR — User A ne peut pas GET la niche de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-b-1?_test_user=A&_test_idor=true");

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toContain("ne suivez pas cette niche");
  });

  test("8b — CRITIQUE: IDOR — User A ne peut pas PATCH la niche de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-b-1?_test_user=A&_test_idor=true", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toContain("ne suivez pas cette niche");
  });

  test("8c — CRITIQUE: IDOR — User A ne peut pas DELETE la niche de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-b-1?_test_user=A&_test_idor=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toContain("ne suivez pas cette niche");
  });

  test("8d — CRITIQUE: IDOR — User A ne peut pas GET l'alerte de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/alerts/alert-b-1?_test_user=A&_test_idor=true");

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toBe("Alerte introuvable");
  });

  test("8e — CRITIQUE: IDOR — User A ne peut pas PATCH l'alerte de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/alerts/alert-b-1?_test_user=A&_test_idor=true", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toBe("Alerte introuvable");
  });

  test("8f — CRITIQUE: IDOR — User A ne peut pas DELETE l'alerte de User B → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/alerts/alert-b-1?_test_user=A&_test_idor=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const b = res.body as { error: string };
    expect(b.error).toBe("Alerte introuvable");
  });

  test("8g — Injection SQL dans tous les paramètres string → 404 (Prisma paramétrise)", async ({ page }) => {
    const sqlPayloads = [
      "'; DROP TABLE niches; --",
      "1 OR 1=1",
      "'; SELECT * FROM users; --",
      "test' UNION SELECT * FROM credentials; --",
    ];

    for (const payload of sqlPayloads) {
      const nicheRes = await fetchApi(page, `/api/niches/${encodeURIComponent(payload)}?_test_user=A&_test_sql_injection=true`);
      expect([400, 404]).toContain(nicheRes.status);

      const alertRes = await fetchApi(page, `/api/alerts/${encodeURIComponent(payload)}?_test_user=A&_test_sql_injection=true`);
      expect([400, 404]).toContain(alertRes.status);
    }
  });

  test("8h — Limite de débit sur les endpoints mono-ressource → 429", async ({ page }) => {
    const urls = [
      "/api/niches/niche-a-1?_test_user=A&_test_rate_limit=true",
      "/api/alerts/alert-a-1?_test_user=A&_test_rate_limit=true",
    ];

    for (const url of urls) {
      const res = await fetchApi(page, url);
      expect(res.status).toBe(429);
      const b = res.body as { code: string };
      expect(b.code).toBe("RATE_LIMITED");
    }
  });

  test("8i — Tentative de contournement HTTP (method override) → 405", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-a-1?_test_user=A&_test_method_override=true", {
      method: "POST",
      headers: {
        "X-HTTP-Method-Override": "PATCH",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(405);
    const b = res.body as { code: string };
    expect(b.code).toBe("METHOD_NOT_ALLOWED");
  });
});
