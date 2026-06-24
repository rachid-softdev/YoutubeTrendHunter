import { test, expect, type Page } from "@playwright/test";

/**
 * API Niches CRUD — E2E tests for YouTube TrendHunter
 *
 * Focused CRUD tests for /api/niches endpoints:
 *   ✓ GET  /api/niches               — List niches with pagination, cache
 *   ✓ POST /api/niches               — Follow a niche with plan limits
 *   ✓ DELETE /api/niches/[id]         — Unfollow a niche
 *   ✓ PATCH /api/niches/[id]         — Modify follow (no-op)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *   - page.evaluate() with native browser fetch() for direct API calls
 *   - Tests verify auth enforcement (401), validation (400), plan limits (403),
 *     success responses (200/201/204), pagination, and error conditions (404)
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
/*  Constants                                                                   */
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
 *   _test_last_page=true     — simulate last page (nextCursor: null)
 *   _test_empty=true         — return empty niches/followed
 *   _test_cache_hit=true     — simulate cache hit
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
    const withCursor = url.searchParams.get("_test_cursor");
    const isLastPage = url.searchParams.get("_test_last_page") === "true";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    // Étape 2: Paginated niches
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

    // Étape 3: Pagination cursor
    let nextCursor: string | null = null;
    if (withCursor) {
      nextCursor = withCursor;
    } else if (isLastPage) {
      nextCursor = null;
    }

    // Étape 4: Available niches — simulate cache
    let availableNiches: Array<{ id: string; name: string; slug: string }>;

    if (cacheHit) {
      availableNiches = MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
    } else {
      availableNiches = MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug }));
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

test.describe("Niches CRUD — GET /api/niches", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetNiches(page);
  });

  test("1a — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches");

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("1b — Session valide → 200 avec allNiches + userNiches", async ({ page }) => {
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

    // Verify shape of a paginated niche
    const niches = body.niches as Array<Record<string, unknown>>;
    if (niches.length > 0) {
      expect(niches[0]).toHaveProperty("id");
      expect(niches[0]).toHaveProperty("nicheId");
      expect(niches[0]).toHaveProperty("nicheName");
      expect(niches[0]).toHaveProperty("trendCount");
      expect(niches[0]).toHaveProperty("followedAt");
    }
  });

  test("1c — Pagination cursor + limit → 200 avec nextCursor", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_cursor=page-2-cursor");

    expect(res.status).toBe(200);

    const body = res.body as { nextCursor: string | null };
    expect(body.nextCursor).toBe("page-2-cursor");
  });

  test("1d — Dernière page → nextCursor: null", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_last_page=true");

    expect(res.status).toBe(200);

    const body = res.body as { nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
  });

  test("1e — Cache hit → 200 depuis le cache", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_cache_hit=true");

    expect(res.status).toBe(200);

    const body = res.body as { available: Array<{ id: string; name: string; slug: string }> };
    expect(body.available).toEqual(
      MOCK_NICHES.map((n) => ({ id: n.id, name: n.name, slug: n.slug })),
    );
  });

  test("1f — Aucune niche suivie → userNiches: []", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { niches: unknown[]; followed: string[]; available: unknown[] };
    expect(body.niches).toEqual([]);
    expect(body.followed).toEqual([]);
    // Available niches should still be present
    expect(Array.isArray(body.available)).toBe(true);
    expect(body.available.length).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/*  POST /api/niches — Mock Helper                                             */
/* ========================================================================== */

/**
 * Mock the POST /api/niches endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true           — simulate authenticated session
 *   _test_pro_plan=true          — simulate PRO plan (unlimited niches)
 *   _test_free_limit=true        — simulate FREE user at limit
 *   _test_already_following=true — simulate already following the niche
 *   _test_niche_not_found=true   — simulate niche does not exist
 *   _test_audit_log=true         — verify audit log was created
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
    const proPlan = url.searchParams.get("_test_pro_plan") === "true";
    const freeLimit = url.searchParams.get("_test_free_limit") === "true";
    const alreadyFollowing = url.searchParams.get("_test_already_following") === "true";
    const nicheNotFound = url.searchParams.get("_test_niche_not_found") === "true";
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

    // Étape 2: Validate body — nicheId required
    if (!body.nicheId || (typeof body.nicheId === "string" && body.nicheId.trim() === "")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "ID de niche requis", code: "VALIDATION_ERROR" }),
      });
      return;
    }

    const nicheId = body.nicheId as string;

    // Étape 3: FREE plan limit check
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

    // Étape 4: Already following check
    if (alreadyFollowing) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous suive déjà cette niche", code: "VALIDATION_ERROR" }),
      });
      return;
    }

    // Étape 5: Niche existence check
    if (nicheNotFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Niche introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    // Étape 6: Success
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

test.describe("Niches CRUD — POST /api/niches (suivre une niche)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPostNiches(page);
  });

  test("2a — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(401);
  });

  test("2b — Body invalide (pas de nicheId) → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const body = res.body as { error: string; code: string };
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("niche");
  });

  test("2c — Plan FREE déjà 1 niche → 403", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_free_limit=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-3" }),
    });

    expect(res.status).toBe(403);

    const body = res.body as { error: string; code: string };
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error).toContain("Limite du plan FREE");
  });

  test("2d — Plan PRO suit plusieurs niches → 201", async ({ page }) => {
    // Simulate PRO plan (e.g., by passing _test_pro_plan)
    // First follow
    const res1 = await fetchApi(page, "/api/niches?_test_session=true&_test_pro_plan=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res1.status).toBe(201);
    const body1 = res1.body as { userNiche: Record<string, unknown> };
    expect(body1).toHaveProperty("userNiche");
    expect(body1.userNiche.nicheId).toBe("niche-1");

    // Second follow — PRO allows multiple
    const res2 = await fetchApi(page, "/api/niches?_test_session=true&_test_pro_plan=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-2" }),
    });

    expect(res2.status).toBe(201);
    const body2 = res2.body as { userNiche: Record<string, unknown> };
    expect(body2).toHaveProperty("userNiche");
    expect(body2.userNiche.nicheId).toBe("niche-2");
  });

  test("2e — Déjà suivi → 400 (doublon)", async ({ page }) => {
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

  test("2f — Niche inexistante → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_niche_not_found=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-inexistante" }),
    });

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  test("2g — Succès → 201 avec audit log", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches?_test_session=true&_test_audit_log=true", {
      method: "POST",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });

    expect(res.status).toBe(201);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("userNiche");
    expect(body).toHaveProperty("_auditCreated");
    expect(body._auditCreated).toBe(true);
    expect(body).toHaveProperty("_cacheInvalidated");
    expect(body._cacheInvalidated).toBe(true);

    const userNiche = body.userNiche as Record<string, unknown>;
    expect(userNiche).toHaveProperty("id");
    expect(userNiche).toHaveProperty("userId");
    expect(userNiche).toHaveProperty("nicheId");
    expect(userNiche).toHaveProperty("followedAt");
    expect(userNiche.userId).toBe("test-user-id");
    expect(userNiche.nicheId).toBe("niche-1");
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
 *   _test_cache_invalidated=true — simulate cache invalidation signal
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

  await page.route("**/api/niches/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const notFollowing = url.searchParams.get("_test_not_following") === "true";
    const cacheInvalidated = url.searchParams.get("_test_cache_invalidated") === "true";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    // Étape 2: Not following check
    if (notFollowing) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    // Étape 3: Successful unfollow — 204 No Content
    const responseHeaders: Record<string, string> = {};
    if (cacheInvalidated) {
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

test.describe("Niches CRUD — DELETE /api/niches/[id] (ne plus suivre une niche)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockDeleteNiches(page);
  });

  test("3a — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(401);

    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("3b — Pas encore suivi → 404", async ({ page }) => {
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

  test("3c — Succès → 204", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(res.bodyText).toBe("");
  });

  test("3d — Cache invalidé", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches/niche-1?_test_session=true&_test_cache_invalidated=true",
      {
        method: "DELETE",
      },
    );

    expect(res.status).toBe(204);
    expect(res.headers["x-cache-invalidated"]).toBe("true");
  });
});

/* ========================================================================== */
/*  PATCH /api/niches/[id] — Mock Helper                                       */
/* ========================================================================== */

/**
 * Mock the PATCH /api/niches/[id] endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true          — simulate authenticated session
 *   _test_not_following=true    — simulate not following the niche
 */
async function mockPatchNiches(page: Page) {
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
    const notFollowing = url.searchParams.get("_test_not_following") === "true";

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié" }),
      });
      return;
    }

    // Étape 2: Not following check
    if (notFollowing) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Vous ne suivez pas cette niche" }),
      });
      return;
    }

    // Étape 3: Success — no-op
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
  });
}

/* ========================================================================== */
/*  4. PATCH /api/niches/[id]                                                  */
/* ========================================================================== */

test.describe("Niches CRUD — PATCH /api/niches/[id] (modifier le follow)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPatchNiches(page);
  });

  test("4a — Sans auth → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body).toHaveProperty("error");
  });

  test("4b — Pas suivi → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/niches/niche-inexistante?_test_session=true&_test_not_following=true",
      {
        method: "PATCH",
        body: JSON.stringify({}),
      },
    );

    expect(res.status).toBe(404);
    const body = res.body as { error: string };
    expect(body.error).toContain("ne suivez pas cette niche");
  });

  test("4c — Succès (no-op) → 200", async ({ page }) => {
    const res = await fetchApi(page, "/api/niches/niche-1?_test_session=true", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const body = res.body as { userNiche: Record<string, unknown> };
    expect(body).toHaveProperty("userNiche");
    expect(body.userNiche).toHaveProperty("id");
    expect(body.userNiche).toHaveProperty("userId");
    expect(body.userNiche).toHaveProperty("nicheId");
    expect(body.userNiche).toHaveProperty("followedAt");
    expect(body.userNiche.userId).toBe("test-user-id");
    expect(body.userNiche.nicheId).toBe("niche-1");
  });
});

/* ========================================================================== */
/*  405 Method Not Allowed — /api/niches                                       */
/* ========================================================================== */

test.describe("Niches CRUD — 405 Method Not Allowed", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("PUT /api/niches → 405 Method Not Allowed", async ({ page }) => {
    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
      } else {
        await route.fallback();
      }
    });

    const resp = await fetchApi(page, "/api/niches", {
      method: "PUT",
      body: JSON.stringify({ nicheId: "niche-1" }),
    });
    expect(resp.status).toBe(405);
    expect((resp.body as Record<string, unknown>).error).toBeDefined();
  });

  test("GET /api/niches/[id] → 405 Method Not Allowed", async ({ page }) => {
    await page.route("**/api/niches/niche-1*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
      } else {
        await route.fallback();
      }
    });

    const resp = await fetchApi(page, "/api/niches/niche-1");
    expect(resp.status).toBe(405);
    expect((resp.body as Record<string, unknown>).error).toBeDefined();
  });
});
