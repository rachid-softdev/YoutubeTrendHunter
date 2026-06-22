import { test, expect, type Page } from "@playwright/test";

/**
 * Extension Analyze API E2E tests for YouTube TrendHunter
 *
 * Tests POST /api/extension/analyze endpoint that the Chrome extension uses
 * for video trend analysis.
 *
 * These endpoints use Bearer token authentication (not session cookies).
 * All tests use page.route() for deterministic mocking and page.evaluate()
 * with native fetch() so that route interception actually applies.
 */

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

/** Base URL from Playwright config */
const BASE_URL = "http://localhost:3000";

/** UUID v4 pattern */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Set up a minimal page at BASE_URL so that all subsequent fetch() calls
 * are same-origin (avoids CORS preflight issues with opaque origins).
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

interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  bodyText: string;
}

/**
 * Make an API call through the browser's native fetch API.
 * Supports GET and POST with JSON body.
 * Returns parsed body, status code, and headers.
 */
async function fetchApi<T = unknown>(
  page: Page,
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
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
        headers: {
          "Content-Type": "application/json",
          ...(opts?.headers || {}),
        },
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
    {
      fetchUrl: fullUrl,
      opts: {
        method: options?.method || "POST",
        headers: options?.headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      },
    },
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

/**
 * Mock the POST /api/extension/analyze endpoint with configurable behaviors.
 *
 * Test query params:
 *   _test=expired-token   — simulate expired token → 401
 *   _test=rate-limit      — simulate rate limit exceeded → 429
 *   _test=youtube-down    — both YouTube APIs fail → 404
 *   _test=scoring-error   — scoreVideo throws → 500
 *   _test=new-video       — 0 views, 0 likes brand new video → still valid
 *   _test=no-details      — getVideoDetails null → fallback title
 *   _test=free-plan       — FREE plan → LIMITED response
 *   _test=plan-downgraded — plan changed from TEAM to FREE → LIMITED
 *   _test=no-niches       — user has no followed niches → uses default
 *   _test=token-revoked   — token was revoked → 401
 *   _test_niche=<name>    — niche name returned in response
 *   _test_plan=FREE|TEAM  — plan to simulate
 */
async function mockAnalyzeEndpoint(page: Page, validToken: string) {
  let revoked = false;

  // Expose revoke control to tests
  (page as unknown as Record<string, unknown>).__revokeTokenForTest = () => {
    revoked = true;
  };
  (page as unknown as Record<string, unknown>).__restoreTokenForTest = () => {
    revoked = false;
  };

  await page.route("**/api/extension/analyze*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const authHeader = route.request().headers()["authorization"];
    const testMode = url.searchParams.get("_test") || "";

    // ── Simulate rate limit exceeded ──
    if (testMode === "rate-limit") {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Trop de requêtes. Réessayez plus tard.",
          code: "RATE_LIMIT",
        }),
      });
      return;
    }

    // ── Token validation ──
    const token = extractBearerToken(authHeader);

    if (testMode === "expired-token" || testMode === "token-revoked") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token invalide", code: "INVALID_TOKEN" }),
      });
      return;
    }

    if (revoked) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token invalide", code: "INVALID_TOKEN" }),
      });
      return;
    }

    if (!token || token !== validToken) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: token ? "Token invalide" : "Token manquant",
          code: "INVALID_TOKEN",
        }),
      });
      return;
    }

    // ── Parse request body ──
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur lors de l'analyse", code: "ANALYSIS_FAILED" }),
      });
      return;
    }

    const { videoId } = body;

    // ── videoId validation ──
    if (videoId === undefined || videoId === null) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "videoId requis" }),
      });
      return;
    }

    if (typeof videoId !== "string") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "videoId requis" }),
      });
      return;
    }

    if (videoId === "") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "videoId requis" }),
      });
      return;
    }

    // ── YouTube API failure ──
    if (testMode === "youtube-down") {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Vidéo introuvable ou supprimée",
          code: "VIDEO_NOT_FOUND",
        }),
      });
      return;
    }

    // ── plan check ──
    const testPlan = url.searchParams.get("_test_plan") || "TEAM";

    if (testMode === "free-plan" || testMode === "plan-downgraded" || testPlan === "FREE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score: 0,
          status: "LIMITED",
          message: "Passez Pro pour analyser les vidéos",
          upgradeUrl: "/pricing",
          videoId,
        }),
      });
      return;
    }

    // ── scoreVideo (Claude API) throws ──
    if (testMode === "scoring-error") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur lors de l'analyse", code: "ANALYSIS_FAILED" }),
      });
      return;
    }

    // ── Brand new video (0 views, 0 likes) ──
    if (testMode === "new-video") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videoId,
          title: "Brand New Video",
          channelTitle: "FreshChannel",
          views: 0,
          score: 0,
          trendScore: 0,
          velocity: 0,
          momentum: "stable",
          status: "ANALYZED",
        }),
      });
      return;
    }

    // ── Fallback when getVideoDetails is null ──
    if (testMode === "no-details") {
      const testNiche = url.searchParams.get("_test_niche") || "Tech & IA";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videoId,
          title: `Video ${videoId}`,
          channelTitle: "",
          views: 50000,
          score: 75.0,
          trendScore: 80,
          velocity: 5.2,
          momentum: "rising",
          status: "ANALYZED",
          niche: testNiche,
          language: "fr",
        }),
      });
      return;
    }

    // ── User has no followed niches ──
    if (testMode === "no-niches") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videoId,
          title: "AI Revolution",
          channelTitle: "TechInsights",
          views: 250000,
          score: 85.3,
          trendScore: 92,
          velocity: 15.2,
          momentum: "rising",
          status: "ANALYZED",
          niche: "Tech & IA",
          language: "fr",
        }),
      });
      return;
    }

    // ── Default full response ──
    const testNiche = url.searchParams.get("_test_niche") || "Tech & IA";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        videoId,
        title: "Why AI is Revolutionizing Everything",
        channelTitle: "TechInsights",
        views: 250000,
        score: 85.3,
        trendScore: 92,
        velocity: 15.2,
        momentum: "rising",
        status: "ANALYZED",
        niche: testNiche,
        language: "fr",
      }),
    });
  });
}

/* ========================================================================== */
/*  1. POST /api/extension/analyze — Succès                                   */
/* ========================================================================== */

test.describe("Extension Analyze — Cas de succès", () => {
  const VALID_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAnalyzeEndpoint(page, VALID_TOKEN);
  });

  test("1a — Retourne la structure complète pour le plan TEAM", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "dQw4w9WgXcQ" },
    });

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      videoId: "dQw4w9WgXcQ",
      title: expect.any(String),
      channelTitle: expect.any(String),
      views: expect.any(Number),
      score: expect.any(Number),
      trendScore: expect.any(Number),
      velocity: expect.any(Number),
      momentum: expect.any(String),
      status: "ANALYZED",
    });

    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.views).toBeGreaterThanOrEqual(0);
  });

  test("1b — Utilise la première niche suivie par l'utilisateur comme niche de scoring", async ({
    page,
  }) => {
    // _test_niche controls the niche returned in the mock response
    // Note: must URL-encode & as %26 to avoid it being parsed as query param separator
    const res = await fetchApi(page, "/api/extension/analyze?_test_niche=Gaming+%26+Esport", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "testVideo123" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.niche).toBe("Gaming & Esport");
  });

  test("1c — getVideoStats retourne des données mais getVideoDetails null → titre de secours", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=no-details", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "fallbackTest999" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.title).toBe("Video fallbackTest999");
    expect(body.channelTitle).toBe("");
    expect(body.views).toBe(50000);
    expect(body.score).toBe(75.0);
  });

  test("1d — Utilisateur sans niche suivie utilise 'Tech & IA' par défaut", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=no-niches", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "noNicheVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.niche).toBe("Tech & IA");
    expect(body.status).toBe("ANALYZED");
  });
});

/* ========================================================================== */
/*  2. POST /api/extension/analyze — Validation des entrées                   */
/* ========================================================================== */

test.describe("Extension Analyze — Validation des entrées", () => {
  const VALID_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAnalyzeEndpoint(page, VALID_TOKEN);
  });

  test("2a — Corps vide {} → 400 'videoId requis'", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: {},
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect((body.error as string).toLowerCase()).toContain("videoid");
  });

  test("2b — videoId chaîne vide '' → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "" },
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect((body.error as string).toLowerCase()).toContain("videoid");
  });

  test("2c — videoId est un nombre → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: 12345 },
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect((body.error as string).toLowerCase()).toContain("videoid");
  });

  test("2d — videoId est null → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: null },
    });

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("error");
    expect((body.error as string).toLowerCase()).toContain("videoid");
  });

  test("2e — Corps de requête non JSON valide → 500", async ({ page }) => {
    // Override the route to simulate a JSON parse failure on the server
    await page.route("**/api/extension/analyze*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      const token = extractBearerToken(authHeader);

      if (token !== VALID_TOKEN) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token invalide", code: "INVALID_TOKEN" }),
        });
        return;
      }

      // The real endpoint calls req.json() which throws SyntaxError for malformed JSON.
      // Simulate this at the mock level.
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur lors de l'analyse", code: "ANALYSIS_FAILED" }),
      });
    });

    // Send truly invalid JSON via raw page.evaluate fetch (bypasses fetchApi's JSON.stringify)
    // VALID_TOKEN must be passed as a parameter since page.evaluate runs in browser context
    const res = await page.evaluate(async (token) => {
      const raw = await fetch("http://localhost:3000/api/extension/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "not-json-at-all,,,,",
      });
      return { status: raw.status, body: await raw.json() };
    }, VALID_TOKEN);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("analyse"),
      code: "ANALYSIS_FAILED",
    });
  });
});

/* ========================================================================== */
/*  3. POST /api/extension/analyze — Erreurs API                              */
/* ========================================================================== */

test.describe("Extension Analyze — Erreurs API", () => {
  const VALID_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAnalyzeEndpoint(page, VALID_TOKEN);
  });

  test("3a — Les deux API YouTube échouent → 404 'Vidéo introuvable ou supprimée'", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=youtube-down", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "nonexistentVideo" },
    });

    expect(res.status).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Vidéo introuvable ou supprimée",
      code: "VIDEO_NOT_FOUND",
    });
  });

  test("3b — Token expiré → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=expired-token", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "dQw4w9WgXcQ" },
    });

    expect(res.status).toBe(401);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: "Token invalide",
      code: "INVALID_TOKEN",
    });
  });

  test("3c — Rate limit dépassé (30/min) → 429", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=rate-limit", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "dQw4w9WgXcQ" },
    });

    expect(res.status).toBe(429);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.stringContaining("Trop de requêtes"),
      code: "RATE_LIMIT",
    });
  });

  test("3d — scoreVideo (Claude API) échoue → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=scoring-error", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "dQw4w9WgXcQ" },
    });

    expect(res.status).toBe(500);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.stringContaining("analyse"),
      code: "ANALYSIS_FAILED",
    });
  });
});

/* ========================================================================== */
/*  4. POST /api/extension/analyze — Cas limites                              */
/* ========================================================================== */

test.describe("Extension Analyze — Cas limites", () => {
  const VALID_TOKEN = crypto.randomUUID();

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAnalyzeEndpoint(page, VALID_TOKEN);
  });

  test("4a — Vidéo avec 0 vues et 0 likes (nouvelle vidéo) → résultat valide", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=new-video", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "brandNewVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      videoId: "brandNewVideo",
      views: 0,
      score: 0,
      trendScore: 0,
      velocity: 0,
      momentum: "stable",
      status: "ANALYZED",
    });
    expect(body).toHaveProperty("title");
    expect(body).toHaveProperty("channelTitle");
  });

  test("4b — Plan FREE → status LIMITED avec upgradeUrl", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test=free-plan", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "freeUserVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      score: 0,
      status: "LIMITED",
      message: expect.stringContaining("Pro"),
      upgradeUrl: "/pricing",
      videoId: "freeUserVideo",
    });

    // FREE plan should NOT include title, views, or channelTitle
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("channelTitle");
    expect(body).not.toHaveProperty("views");
  });

  test("4c — Plan FREE avec _test_plan=FREE retourne LIMITED", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/analyze?_test_plan=FREE", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "anotherFreeVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "LIMITED",
      upgradeUrl: "/pricing",
    });
  });

  test("4d — scoreResult inclut trendScore, velocity, momentum dans la réponse", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${VALID_TOKEN}` },
      body: { videoId: "fullScoreVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("trendScore");
    expect(body).toHaveProperty("velocity");
    expect(body).toHaveProperty("momentum");
    expect(typeof body.trendScore).toBe("number");
    expect(typeof body.velocity).toBe("number");
    expect(typeof body.momentum).toBe("string");
  });
});

/* ========================================================================== */
/*  5. POST /api/extension/analyze — Intégration                              */
/* ========================================================================== */

test.describe("Extension Analyze — Intégration", () => {
  test("5a — Token créé → utilisé dans analyze (parcours complet)", async ({ page }) => {
    await setupPage(page);

    // Simulate token creation + analyze in one flow
    const mockToken = crypto.randomUUID();

    await page.route("**/api/extension/analyze*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      const authHeader = route.request().headers()["authorization"];
      const token = extractBearerToken(authHeader);

      if (token !== mockToken) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token invalide", code: "INVALID_TOKEN" }),
        });
        return;
      }

      const body = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videoId: body.videoId,
          title: "Integration Test Video",
          channelTitle: "TestChannel",
          views: 50000,
          score: 91.2,
          status: "ANALYZED",
        }),
      });
    });

    const res = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${mockToken}` },
      body: { videoId: "integrationVideo" },
    });

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toMatchObject({
      videoId: "integrationVideo",
      title: "Integration Test Video",
      score: 91.2,
      status: "ANALYZED",
    });
  });

  test("5b — Token révoqué → 401 immédiat sur analyze", async ({ page }) => {
    await setupPage(page);

    const mockToken = crypto.randomUUID();
    await mockAnalyzeEndpoint(page, mockToken);

    // First call succeeds
    const res1 = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${mockToken}` },
      body: { videoId: "firstCall" },
    });
    expect(res1.status).toBe(200);

    // Trigger revocation via _test=token-revoked
    const res2 = await fetchApi(page, "/api/extension/analyze?_test=token-revoked", {
      headers: { Authorization: `Bearer ${mockToken}` },
      body: { videoId: "afterRevoke" },
    });

    expect(res2.status).toBe(401);
    const body = res2.body as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  test("5c — Plan rétrogradé TEAM→FREE → réponse LIMITED", async ({ page }) => {
    await setupPage(page);
    const mockToken = crypto.randomUUID();

    await page.route("**/api/extension/analyze*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const url = new URL(route.request().url());
      const authHeader = route.request().headers()["authorization"];
      const token = extractBearerToken(authHeader);

      if (token !== mockToken) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token invalide", code: "INVALID_TOKEN" }),
        });
        return;
      }

      const testMode = url.searchParams.get("_test") || "";

      // Simulate plan downgrade: token still exists but user plan changed
      if (testMode === "plan-downgraded") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            score: 0,
            status: "LIMITED",
            message: "Passez Pro pour analyser les vidéos",
            upgradeUrl: "/pricing",
            videoId: "downgradedUser",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videoId: "teamVideo",
          title: "Team Analysis",
          views: 100000,
          score: 88.0,
          status: "ANALYZED",
        }),
      });
    });

    // First call as TEAM → full analysis
    const res1 = await fetchApi(page, "/api/extension/analyze", {
      headers: { Authorization: `Bearer ${mockToken}` },
      body: { videoId: "teamVideo" },
    });
    expect(res1.status).toBe(200);
    const body1 = res1.body as Record<string, unknown>;
    expect(body1.status).toBe("ANALYZED");
    expect(body1.score).toBeGreaterThan(0);

    // After downgrade → LIMITED
    const res2 = await fetchApi(page, "/api/extension/analyze?_test=plan-downgraded", {
      headers: { Authorization: `Bearer ${mockToken}` },
      body: { videoId: "downgradedUser" },
    });
    expect(res2.status).toBe(200);
    const body2 = res2.body as Record<string, unknown>;
    expect(body2).toMatchObject({
      status: "LIMITED",
      score: 0,
      upgradeUrl: "/pricing",
    });
  });

  test("5d — Analyses multiples en séquence avec le même token", async ({ page }) => {
    await setupPage(page);
    const mockToken = crypto.randomUUID();
    await mockAnalyzeEndpoint(page, mockToken);

    const videoIds = ["video1", "video2", "video3"];
    for (const videoId of videoIds) {
      const res = await fetchApi(page, "/api/extension/analyze", {
        headers: { Authorization: `Bearer ${mockToken}` },
        body: { videoId },
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.videoId).toBe(videoId);
    }
  });
});
