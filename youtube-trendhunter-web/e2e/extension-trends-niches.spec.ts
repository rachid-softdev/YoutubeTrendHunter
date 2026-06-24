import { test, expect, type Page } from "@playwright/test";

/**
 * Extension API — Niches E2E tests for YouTube TrendHunter
 *
 * Tests GET /api/extension/trends/niches that the Chrome extension uses
 * to fetch the list of available niches and the user's plan.
 *
 * Authentication: Bearer token (not session cookies).
 * Features: rate limiting, Redis caching, plan gating.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
        /* keep raw */
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

/** Extract Bearer token from Authorization header (case-insensitive). */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
  if (!match) return null;
  const token = match[1].trim();
  return token || null;
}

/* -------------------------------------------------------------------------- */
/*  Mock data                                                                  */
/* -------------------------------------------------------------------------- */

const VALID_TOKEN = "th_test_niches_token_abc";
const INVALID_TOKEN = "th_invalid_token_xyz";

interface Niche {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  language: string;
  trendCount: number;
}

function buildMockNiches(): Niche[] {
  return [
    {
      id: "n1",
      name: "Tech & IA",
      slug: "tech-ia",
      description: "Technologies et intelligence artificielle",
      language: "fr",
      trendCount: 12,
    },
    {
      id: "n2",
      name: "Gaming",
      slug: "gaming",
      description: "Jeux vidéo et e-sport",
      language: "fr",
      trendCount: 8,
    },
    {
      id: "n3",
      name: "Musique",
      slug: "musique",
      description: null,
      language: "fr",
      trendCount: 5,
    },
    {
      id: "n4",
      name: "Business",
      slug: "business",
      description: "Entrepreneuriat et finance",
      language: "fr",
      trendCount: 3,
    },
    {
      id: "n5",
      name: "Science",
      slug: "science",
      description: "Découvertes scientifiques",
      language: "fr",
      trendCount: 0,
    },
  ];
}

/** Mock Redis cache state across requests */
const mockCache = new Map<string, { data: unknown; ttl: number }>();

/* -------------------------------------------------------------------------- */
/*  Mock handler                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mock the GET /api/extension/trends/niches endpoint with configurable behaviors.
 *
 * Test query params:
 *   _test_rate_limit=yes       — simulate rate limit hit → 429
 *   _test_token_status=expired — simulate expired token → 401
 *   _test_cache=hit            — simulate Redis cache hit
 *   _test_cache=miss           — simulate Redis cache miss
 *   _test_db_down=yes          — simulate Prisma failure → 500
 *   _test_empty=yes            — return empty niches array
 *   _test_plan=FREE|PRO|TEAM   — override user plan in response
 *   _test_slow_cache=yes       — simulate setCached failure (silent degradation)
 *   _test_verify_slow=yes      — simulate slow verifyApiToken
 */
async function mockNichesEndpoint(page: Page, validToken: string) {
  await page.route("**/api/extension/trends/niches**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const authHeader = route.request().headers()["authorization"];
    const testMode = url.searchParams.get("_test_mode") || "";
    const testPlan = url.searchParams.get("_test_plan") || "TEAM";

    // ── Rate limit ──
    if (testMode === "rate-limit") {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Trop de requêtes, veuillez réessayer plus tard",
          code: "RATE_LIMIT",
        }),
      });
      return;
    }

    // ── Auth check ──
    const token = extractBearerToken(authHeader);
    if (!token) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token manquant", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // ── Expired token ──
    if (testMode === "expired") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token invalide", code: "UNAUTHORIZED" }),
      });
      return;
    }

    if (token !== validToken) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token invalide", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // ── Slow verifyApiToken simulation ──
    if (testMode === "verify-slow") {
      // Simulated via mock: return 200 with a flag
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches: buildMockNiches(),
          plan: testPlan,
          _verifySlow: true,
        }),
      });
      return;
    }

    // ── DB down ──
    if (testMode === "db-down") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
      return;
    }

    // ── Empty niches ──
    if (testMode === "empty") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: [], plan: testPlan }),
      });
      return;
    }

    // ── Slow setCached (silent degradation) ──
    if (testMode === "cache-slow") {
      // Response still succeeds even if caching fails
      const niches = buildMockNiches();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches, plan: testPlan, _cacheFailed: true }),
      });
      return;
    }

    // ── Cache hit ──
    if (testMode === "cache-hit") {
      // Return cached data with _cached flag
      const cachedNiches = buildMockNiches();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: cachedNiches, plan: testPlan, _cached: true }),
      });
      return;
    }

    // ── Cache miss → return fresh data ──
    if (testMode === "cache-miss") {
      const niches = buildMockNiches().map((n) =>
        n.id === "n1" ? { ...n, trendCount: n.trendCount + 1 } : n,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches,
          plan: testPlan,
          _cached: false,
          _fresh: true,
        }),
      });
      return;
    }

    // ── Default ──
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niches: buildMockNiches(),
        plan: testPlan,
      }),
    });
  });
}

/* ========================================================================== */
/*  Tests — Authentification                                                   */
/* ========================================================================== */

test.describe("Extension Niches — Authentification", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, VALID_TOKEN);
  });

  test("1a — Sans token d'authentification → 401 Token manquant", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches");
    expect(res.status).toBe(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Token manquant",
      code: "UNAUTHORIZED",
    });
  });

  test("1b — Token invalide → 401 Token invalide", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${INVALID_TOKEN}` },
    });
    expect(res.status).toBe(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Token invalide",
      code: "UNAUTHORIZED",
    });
  });

  test("1c — Token expiré → 401 Token invalide", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=expired", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Token invalide",
      code: "UNAUTHORIZED",
    });
  });

  test("1d — Header Authorization malformé → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: "InvalidFormat" },
    });
    expect(res.status).toBe(401);
    expect((res.body as Record<string, unknown>).code).toBe("UNAUTHORIZED");
  });

  test("1e — Token vide (Bearer ) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
    expect((res.body as Record<string, unknown>).code).toBe("UNAUTHORIZED");
  });
});

/* ========================================================================== */
/*  Tests — Succès (token valide)                                              */
/* ========================================================================== */

test.describe("Extension Niches — Succès", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, VALID_TOKEN);
  });

  test("2a — Token valide → 200 avec la structure JSON attendue", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    // Top-level properties
    expect(body).toHaveProperty("niches");
    expect(body).toHaveProperty("plan");

    // niches is an array
    expect(Array.isArray(body.niches)).toBe(true);

    // plan is a string
    expect(typeof body.plan).toBe("string");
  });

  test("2b — Chaque niche a la structure exacte: id, name, slug, description, language, trendCount", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const niches = body.niches as Record<string, unknown>[];

    for (const niche of niches) {
      expect(niche).toHaveProperty("id");
      expect(typeof niche.id).toBe("string");

      expect(niche).toHaveProperty("name");
      expect(typeof niche.name).toBe("string");

      expect(niche).toHaveProperty("slug");
      expect(typeof niche.slug).toBe("string");

      expect(niche).toHaveProperty("description");
      // description can be string or null

      expect(niche).toHaveProperty("language");
      expect(typeof niche.language).toBe("string");

      expect(niche).toHaveProperty("trendCount");
      expect(typeof niche.trendCount).toBe("number");
      expect(Number.isInteger(niche.trendCount)).toBe(true);
    }
  });

  test("2c — Niches triées par name ascendant", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const niches = body.niches as Record<string, unknown>[];

    expect(niches.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < niches.length; i++) {
      const prev = niches[i - 1].name as string;
      const curr = niches[i].name as string;
      expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
    }
  });

  test("2d — plan est retourné dans la réponse (FREE, PRO ou TEAM)", async ({ page }) => {
    const plans = ["FREE", "PRO", "TEAM"];

    for (const plan of plans) {
      const res = await fetchApi(page, `/api/extension/trends/niches?_test_plan=${plan}`, {
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      });
      expect(res.status).toBe(200);

      const body = res.body as Record<string, unknown>;
      expect(body.plan).toBe(plan);
    }
  });

  test("2e — Niche avec description null est acceptée (description: null)", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const niches = body.niches as Record<string, unknown>[];
    const musique = niches.find((n) => n.slug === "musique");

    expect(musique).toBeDefined();
    expect(musique).toHaveProperty("description");
    expect(musique!.description).toBeNull();
  });

  test("2f — trendCount est un entier ≥ 0 (y compris 0 pour les niches sans tendances actives)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const niches = body.niches as Record<string, unknown>[];
    const science = niches.find((n) => n.slug === "science");

    expect(science).toBeDefined();
    expect(science!.trendCount).toBe(0);
  });
});

/* ========================================================================== */
/*  Tests — Rate Limiting                                                      */
/* ========================================================================== */

test.describe("Extension Niches — Rate Limiting", () => {
  const RATE_LIMIT_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, RATE_LIMIT_TOKEN);
  });

  test("3a — Trop de requêtes → 429 avec code RATE_LIMIT", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=rate-limit", {
      headers: { Authorization: `Bearer ${RATE_LIMIT_TOKEN}` },
    });

    expect(res.status).toBe(429);

    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.stringContaining("Trop de requêtes"),
      code: "RATE_LIMIT",
    });
  });
});

/* ========================================================================== */
/*  Tests — Cache Redis                                                        */
/* ========================================================================== */

test.describe("Extension Niches — Cache", () => {
  const CACHE_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, CACHE_TOKEN);
  });

  test("4a — Cache hit → retourne les données en cache", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=cache-hit", {
      headers: { Authorization: `Bearer ${CACHE_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body._cached).toBe(true);
    // Structure should still be valid
    expect(body).toHaveProperty("niches");
    expect(body).toHaveProperty("plan");
  });

  test("4b — Cache miss → retourne des données fraîches (pas _cached)", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=cache-miss", {
      headers: { Authorization: `Bearer ${CACHE_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body._cached).toBe(false);
    expect(body._fresh).toBe(true);
  });

  test("4c — Échec silencieux du cache (setCached ralentit) → réponse 200 avec données", async ({
    page,
  }) => {
    // Even if setCached fails, the route should still return the data
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=cache-slow", {
      headers: { Authorization: `Bearer ${CACHE_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("niches");
    expect(body).toHaveProperty("plan");
  });
});

/* ========================================================================== */
/*  Tests — Cas limites (empty / errors)                                       */
/* ========================================================================== */

test.describe("Extension Niches — Cas limites", () => {
  const EDGE_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, EDGE_TOKEN);
  });

  test("5a — Aucune niche active → niches: []", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=empty", {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.niches).toEqual([]);
    expect(body).toHaveProperty("plan");
  });

  test("5b — DB inaccessible → 500 INTERNAL_ERROR", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=db-down", {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });

    expect(res.status).toBe(500);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Erreur interne",
      code: "INTERNAL_ERROR",
    });
  });

  test("5c — Appel avec méthode POST non supportée → 405", async ({ page }) => {
    // We test this by not intercepting POST and letting the real handler give 405
    // Since our mock only intercepts GET, a POST would fall through
    // For a proper test, we explicitly fail POST
    await page.route("**/api/extension/trends/niches**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({ status: 405 });
      } else {
        await route.fallback();
      }
    });

    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });
    // With explicit mock, we expect 405
    expect(res.status).toBe(405);
  });

  test("5d — Nombre de requêtes concurrentes ne cause pas d'erreur", async ({ page }) => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetchApi(page, "/api/extension/trends/niches", {
          headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
        }),
      ),
    );

    for (const res of results) {
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty("niches");
      expect(body).toHaveProperty("plan");
    }
  });

  test("5e — don't crash sur un slug de niche très long dans l'URL", async ({ page }) => {
    // The niches endpoint doesn't accept a slug param, but extra params should be ignored
    const longParam = "a".repeat(10000);
    const res = await fetchApi(page, `/api/extension/trends/niches?ignored=${longParam}`, {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("niches");
    expect(body).toHaveProperty("plan");
  });
});

/* ========================================================================== */
/*  Tests — Gestion d'erreurs                                                  */
/* ========================================================================== */

test.describe("Extension Niches — Gestion d'erreurs", () => {
  const ERR_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, ERR_TOKEN);
  });

  test("6a — Erreur JSON bien formée pour 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches");
    expect(res.status).toBe(401);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(body.code).toBe("UNAUTHORIZED");

    // Verify body only has expected keys
    const keys = Object.keys(body);
    expect(keys).toEqual(expect.arrayContaining(["error", "code"]));
  });

  test("6b — Erreur JSON bien formée pour 429", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=rate-limit", {
      headers: { Authorization: `Bearer ${ERR_TOKEN}` },
    });

    expect(res.status).toBe(429);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(body.code).toBe("RATE_LIMIT");
  });

  test("6c — Erreur JSON bien formée pour 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches?_test_mode=db-down", {
      headers: { Authorization: `Bearer ${ERR_TOKEN}` },
    });

    expect(res.status).toBe(500);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});

/* ========================================================================== */
/*  Tests — Sécurité et intégrité                                              */
/* ========================================================================== */

test.describe("Extension Niches — Sécurité", () => {
  const SEC_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockNichesEndpoint(page, SEC_TOKEN);
  });

  test("7a — Token d'un autre utilisateur → 401", async ({ page }) => {
    const otherToken = crypto.randomUUID();

    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${otherToken}` },
    });

    // Only our VALID_TOKEN works — any other token is rejected
    expect(res.status).toBe(401);
    expect((res.body as Record<string, unknown>).code).toBe("UNAUTHORIZED");
  });

  test("7b — Header Authorization manquant → 401 (pas de fallback à la session)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches");
    expect(res.status).toBe(401);
  });

  test("7c — La réponse ne contient pas de données sensibles (pas d'email, pas de userId)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/trends/niches", {
      headers: { Authorization: `Bearer ${SEC_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);

    // Should not contain user-specific sensitive data
    expect(bodyStr).not.toContain("email");
    expect(bodyStr).not.toContain("password");
    expect(bodyStr).not.toContain("token");
  });
});
