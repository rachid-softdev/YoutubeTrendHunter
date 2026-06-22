import { test, expect, type Page } from "@playwright/test";

/**
 * API Trends Endpoints — E2E tests for YouTube TrendHunter
 *
 * Tests the trends API endpoints:
 *   ✓ GET  /api/trends           — List trends for a followed niche
 *   ✓ POST /api/trends/refresh   — Trigger trend refresh job(s)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *     (auth checks, plan limits, cache logic, DB queries, rate limiting)
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401/403/404), valid responses (200/202),
 *     response shapes, pagination, caching, plan limits, and edge cases
 *
 * NOTE: page.request.* does NOT go through page.route() interception
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

/** Generic API response shape */
interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  bodyText: string;
}

/**
 * Make a GET API call through the browser's native fetch API.
 * Guarantees that page.route() interceptors catch the request.
 */
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

/**
 * Make a POST API call through the browser's native fetch API.
 * Sends a JSON body and Content-Type: application/json by default.
 */
async function fetchApiPost<T = unknown>(
  page: Page,
  url: string,
  options?: { headers?: Record<string, string>; body?: unknown },
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  return await page.evaluate(
    async ({
      fetchUrl,
      opts,
    }: {
      fetchUrl: string;
      opts?: { headers?: Record<string, string>; body?: unknown };
    }) => {
      const res = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts?.headers || {}),
        },
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
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

/** Generate a deterministic set of mock trends for testing */
function buildTrends(
  count: number,
  nicheSlug: string,
  startScore = 95,
): Array<Record<string, unknown>> {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `trend-${nicheSlug}-${i + 1}`,
    title: `Tendance #${i + 1} — ${nicheSlug}`,
    score: Math.round((startScore - i * (startScore / Math.max(count, 1))) * 10) / 10,
    channelName: `Chaîne ${i + 1}`,
    channelUrl: `https://youtube.com/@chaine${i + 1}`,
    videoUrl: `https://youtube.com/watch?v=vid${nicheSlug}${i + 1}`,
    thumbnailUrl: `https://i.ytimg.com/vi/vid${nicheSlug}${i + 1}/default.jpg`,
    views: Math.floor(100_000 - i * 5_000),
    nicheId: `niche-${nicheSlug}`,
    publishedAt: new Date(now - i * 3_600_000).toISOString(),
    createdAt: new Date(now - i * 7_200_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
  }));
}

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const VALID_NICHE = "tech-ia";
const INVALID_NICHE_SLUG = "niche-invalide-!!";
const NONEXISTENT_NICHE = "niche-inexistante";
const CURSOR_VALUE = "cursor-next-page-42";

/* ========================================================================== */
/*  1. GET /api/trends — Mock Helper                                           */
/* ========================================================================== */

/**
 * Mock the GET /api/trends endpoint.
 *
 * The real endpoint (src/app/api/trends/route.ts):
 *   1. Calls auth() — no session → 401 { error, code }
 *   2. Validates query params (niche, limit, cursor) via zod
 *   3. Optionally checks user plan + niche following
 *   4. Queries DB for trends with pagination, caching, and ordering
 *   5. Returns { trends, plan, nextCursor } or error
 *
 * Test query params (these control mock behavior):
 *   _test_session=true       — simulate authenticated session
 *   _test_plan=FREE|PRO|TEAM — simulate a specific plan (default: FREE)
 *   _test_rate_limit=true    — simulate rate limit exceeded (429)
 *   _test_niche_not_found=true — niche slug not in DB (404)
 *   _test_invalid_niche=true — invalid niche slug format (400)
 *   _test_forbidden_niche=true — FREE user following different niche (403)
 *   _test_db_error=true      — simulate internal DB error (500)
 *   _test_empty=true         — no trends found (empty array)
 *   _test_cache_hit=true     — return cached response
 *   _test_expired=true       — simulate expired trends filtered out
 *   _test_order=true         — verify score DESC ordering
 *   _test_cache_flow=true    — first call fresh, subsequent cached
 *   _test_clamp_low=true     — simulate limit clamped to 1
 *   _test_clamp_high=true    — simulate limit clamped to 100
 */
async function mockGetTrends(page: Page) {
  let cacheFlowCounter = 0;

  await page.route("**/api/trends*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const userPlan = url.searchParams.get("_test_plan") || "FREE";
    const nicheSlug = url.searchParams.get("niche") || "";
    const isRateLimited = url.searchParams.get("_test_rate_limit") === "true";
    const isDbError = url.searchParams.get("_test_db_error") === "true";
    const isCacheHit = url.searchParams.get("_test_cache_hit") === "true";
    const isEmpty = url.searchParams.get("_test_empty") === "true";
    const nicheNotFound = url.searchParams.get("_test_niche_not_found") === "true";
    const invalidNiche = url.searchParams.get("_test_invalid_niche") === "true";
    const forbiddenNiche = url.searchParams.get("_test_forbidden_niche") === "true";
    const isExpiredTest = url.searchParams.get("_test_expired") === "true";
    const isOrderTest = url.searchParams.get("_test_order") === "true";
    const isCacheFlow = url.searchParams.get("_test_cache_flow") === "true";
    const isClampLow = url.searchParams.get("_test_clamp_low") === "true";
    const isClampHigh = url.searchParams.get("_test_clamp_high") === "true";
    const cursor = url.searchParams.get("cursor") || "";
    const limitParam = url.searchParams.get("limit") || "20";

    // Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Rate limit
    if (isRateLimited) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMIT_EXCEEDED" }),
      });
      return;
    }

    // Missing niche param
    if (!nicheSlug) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: { niche: ["Le paramètre 'niche' est requis"] },
        }),
      });
      return;
    }

    // Invalid niche slug
    if (invalidNiche) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: { niche: ["Slug de niche invalide"] },
        }),
      });
      return;
    }

    // Niche not found in DB
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

    // FREE user following a different niche
    if (forbiddenNiche) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Vous ne suivez pas cette niche",
          code: "FORBIDDEN",
        }),
      });
      return;
    }

    // Internal DB error
    if (isDbError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
      return;
    }

    // Cache hit — return cached data
    if (isCacheHit) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [
            {
              id: "cached-trend-1",
              title: "Tendance en cache",
              score: 90,
              channelName: "Chaîne en cache",
              channelUrl: "https://youtube.com/@cache",
              videoUrl: "https://youtube.com/watch?v=cached",
              thumbnailUrl: "https://i.ytimg.com/vi/cached/default.jpg",
              views: 50_000,
              nicheId: `niche-${nicheSlug}`,
              publishedAt: new Date().toISOString(),
              createdAt: new Date(Date.now() - 3_600_000).toISOString(),
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ],
          plan: userPlan,
          nextCursor: null,
          _test_cached: true,
        }),
      });
      return;
    }

    // Cache flow test — first call fresh, subsequent returns cached
    if (isCacheFlow) {
      cacheFlowCounter++;
      const isFirstCall = cacheFlowCounter === 1;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: isFirstCall
            ? [
                {
                  id: "fresh-trend-1",
                  title: "Tendance fraîche",
                  score: 85,
                  channelName: "Chaîne fraîche",
                  channelUrl: "https://youtube.com/@fresh",
                  videoUrl: "https://youtube.com/watch?v=fresh",
                  thumbnailUrl: "https://i.ytimg.com/vi/fresh/default.jpg",
                  views: 75_000,
                  nicheId: `niche-${nicheSlug}`,
                  publishedAt: new Date().toISOString(),
                  createdAt: new Date(Date.now() - 1_800_000).toISOString(),
                  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                },
              ]
            : [
                {
                  id: "cached-trend-1",
                  title: "Tendance en cache",
                  score: 85,
                  channelName: "Chaîne en cache",
                  channelUrl: "https://youtube.com/@cache",
                  videoUrl: "https://youtube.com/watch?v=cached",
                  thumbnailUrl: "https://i.ytimg.com/vi/cached/default.jpg",
                  views: 75_000,
                  nicheId: `niche-${nicheSlug}`,
                  publishedAt: new Date().toISOString(),
                  createdAt: new Date(Date.now() - 1_800_000).toISOString(),
                  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                },
              ],
          plan: userPlan,
          nextCursor: null,
          _test_cached: !isFirstCall,
          _test_cacheHitCount: cacheFlowCounter,
        }),
      });
      return;
    }

    // Empty trends for a valid niche
    if (isEmpty) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [],
          plan: userPlan,
          nextCursor: null,
        }),
      });
      return;
    }

    // — Normal response logic below —

    // Determine plan limit
    const planLimit: number = userPlan === "FREE" ? 5 : -1;

    // Parse and clamp limit param
    let requestedLimit = Math.max(1, parseInt(limitParam, 10) || 20);
    if (requestedLimit > 100) requestedLimit = 100;

    // For clamp tests, override the actual limit for simpler assertions
    const effectiveLimit = isClampLow ? 1 : isClampHigh ? 100 : requestedLimit;

    // Apply plan limit (FREE max 5, PRO/TEAM unlimited)
    const finalLimit = planLimit > 0 ? Math.min(effectiveLimit, planLimit) : effectiveLimit;

    // Expired trends test — simulate filtering by returning only non-expired
    if (isExpiredTest) {
      const now = Date.now();
      const trends = [
        {
          id: "t-current-1",
          title: "Tendance active #1",
          score: 90,
          channelName: "Chaîne A",
          channelUrl: "https://youtube.com/@chaineA",
          videoUrl: "https://youtube.com/watch?v=vidA1",
          thumbnailUrl: "https://i.ytimg.com/vi/vidA1/default.jpg",
          views: 120_000,
          nicheId: `niche-${nicheSlug}`,
          publishedAt: new Date(now - 3_600_000).toISOString(),
          createdAt: new Date(now - 7_200_000).toISOString(),
          expiresAt: new Date(now + 86_400_000).toISOString(), // future
        },
        {
          id: "t-expired-1",
          title: "Tendance expirée #1",
          score: 80,
          channelName: "Chaîne B",
          channelUrl: "https://youtube.com/@chaineB",
          videoUrl: "https://youtube.com/watch?v=vidB1",
          thumbnailUrl: "https://i.ytimg.com/vi/vidB1/default.jpg",
          views: 90_000,
          nicheId: `niche-${nicheSlug}`,
          publishedAt: new Date(now - 172_800_000).toISOString(),
          createdAt: new Date(now - 259_200_000).toISOString(),
          expiresAt: new Date(now - 86_400_000).toISOString(), // past
        },
        {
          id: "t-current-2",
          title: "Tendance active #2",
          score: 70,
          channelName: "Chaîne C",
          channelUrl: "https://youtube.com/@chaineC",
          videoUrl: "https://youtube.com/watch?v=vidC1",
          thumbnailUrl: "https://i.ytimg.com/vi/vidC1/default.jpg",
          views: 60_000,
          nicheId: `niche-${nicheSlug}`,
          publishedAt: new Date(now - 7_200_000).toISOString(),
          createdAt: new Date(now - 14_400_000).toISOString(),
          expiresAt: new Date(now + 172_800_000).toISOString(), // future
        },
      ];

      // Filter out expired (expiresAt >= now)
      const nonExpired = trends.filter((t) => new Date(t.expiresAt).getTime() >= now);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: nonExpired,
          plan: userPlan,
          nextCursor: null,
          _test_totalTrends: trends.length,
          _test_expiredCount: trends.length - nonExpired.length,
        }),
      });
      return;
    }

    // Order test — return trends in descending score order
    if (isOrderTest) {
      const unsorted = [
        { id: "t3", title: "Score moyen", score: 65 },
        { id: "t1", title: "Petit score", score: 30 },
        { id: "t5", title: "Très haut score", score: 100 },
        { id: "t2", title: "Haut score", score: 95 },
        { id: "t4", title: "Petit score #2", score: 10 },
      ];

      // Sorted by score DESC, then id ASC for ties
      const sorted = [...unsorted].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.id.localeCompare(b.id);
      });

      const baseTrend = {
        channelName: "Chaîne Test",
        channelUrl: "https://youtube.com/@chaine-test",
        videoUrl: "https://youtube.com/watch?v=test",
        thumbnailUrl: "https://i.ytimg.com/vi/test/default.jpg",
        views: 50_000,
        nicheId: `niche-${nicheSlug}`,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: sorted.map((t) => ({ ...baseTrend, ...t })),
          plan: userPlan,
          nextCursor: null,
        }),
      });
      return;
    }

    // Pagination: determine if there is a next page
    const hasMore = !cursor && finalLimit > 0;
    const trends = buildTrends(finalLimit, nicheSlug);
    const nextCursor = hasMore ? CURSOR_VALUE : null;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends,
        plan: userPlan,
        nextCursor,
      }),
    });
  });
}

/* ========================================================================== */
/*  2. POST /api/trends/refresh — Mock Helper                                  */
/* ========================================================================== */

/**
 * Mock the POST /api/trends/refresh endpoint.
 *
 * The real endpoint (src/app/api/trends/refresh/route.ts):
 *   1. Calls auth() — no session → 401 { error, code }
 *   2. Parses JSON body for nicheSlug / nicheId
 *   3. Resolves niches from DB (all active, or specific)
 *   4. Creates refresh jobs (max 50 batch)
 *   5. Invalidates cache
 *   6. Returns { jobs, count } or { count: 0, message }
 *
 * Test query params (URL-based control for auth/error scenarios):
 *   _test_session=true          — simulate authenticated session
 *   _test_invalid_session=true  — simulate invalid session (401)
 *   _test_rate_limit=true       — simulate rate limit (429)
 *   _test_niche_not_found=true  — niche slug not in DB (404)
 *   _test_no_active_niches=true — no active niches (202 with count: 0)
 *   _test_db_error=true         — simulate DB error (500)
 *   _test_invalidate_cache=true — verify cache invalidation happened
 *   _test_batch_limit=true      — simulate > 50 niches, only 50 processed
 *   _test_malformed_body=true   — send malformed JSON to test graceful fallback
 */
async function mockRefreshTrends(page: Page) {
  await page.route("**/api/trends/refresh*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const isInvalidSession = url.searchParams.get("_test_invalid_session") === "true";
    const isRateLimited = url.searchParams.get("_test_rate_limit") === "true";
    const nicheNotFound = url.searchParams.get("_test_niche_not_found") === "true";
    const noActiveNiches = url.searchParams.get("_test_no_active_niches") === "true";
    const isDbError = url.searchParams.get("_test_db_error") === "true";
    const testInvalidateCache = url.searchParams.get("_test_invalidate_cache") === "true";
    const testBatchLimit = url.searchParams.get("_test_batch_limit") === "true";
    const testMalformedBody = url.searchParams.get("_test_malformed_body") === "true";

    // Auth: no session
    if (!hasSession && !isInvalidSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Auth: invalid session
    if (isInvalidSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Session invalide", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Rate limit
    if (isRateLimited) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMIT_EXCEEDED" }),
      });
      return;
    }

    // Parse body (handle malformed JSON gracefully)
    let rawBody: string;
    if (testMalformedBody) {
      // Simulate malformed JSON — body is parsed as {}
      rawBody = "{broken-json";
    } else {
      rawBody = route.request().postData() || "{}";
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    const nicheSlug = body.nicheSlug as string | undefined;
    const nicheId = body.nicheId as string | undefined;

    // Niche not found
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

    // DB error
    if (isDbError) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Erreur interne du serveur",
          code: "INTERNAL_ERROR",
        }),
      });
      return;
    }

    // No active niches
    if (noActiveNiches) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [],
          count: 0,
          message: "Aucune niche active",
        }),
      });
      return;
    }

    // Batch limit: simulate 50+ active niches, only first 50 processed
    if (testBatchLimit) {
      const jobs = Array.from({ length: 50 }, (_, i) => ({
        jobId: `job-batch-${i + 1}`,
        nicheSlug: `niche-batch-${i + 1}`,
        status: "PENDING" as const,
      }));

      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs,
          count: 50,
          _test_batchLimitApplied: true,
          _test_totalNiches: 65,
        }),
      });
      return;
    }

    // Cache invalidation test
    if (testInvalidateCache) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              jobId: "job-cache-invalidate",
              nicheSlug: nicheSlug || "tech-ia",
              status: "PENDING",
            },
          ],
          count: 1,
          _test_cacheInvalidated: true,
        }),
      });
      return;
    }

    // Malformed body test — parsed as {}, creates batch jobs for all active niches
    if (testMalformedBody) {
      // Simulate batch of jobs for active niches when body is empty
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            { jobId: "job-malformed-1", nicheSlug: "tech-ia", status: "PENDING" },
            { jobId: "job-malformed-2", nicheSlug: "gaming", status: "PENDING" },
            { jobId: "job-malformed-3", nicheSlug: "business", status: "PENDING" },
          ],
          count: 3,
          _test_malformedBodyFallback: true,
        }),
      });
      return;
    }

    // Single niche with both nicheSlug and nicheId provided
    if (nicheSlug && nicheId) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              jobId: "job-single-dual-1",
              nicheSlug,
              nicheId,
              status: "PENDING",
            },
          ],
          count: 1,
          _test_dualIdentifiers: true,
        }),
      });
      return;
    }

    // Specific nicheSlug provided → single job
    if (nicheSlug) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: [
            {
              jobId: `job-${nicheSlug}-1`,
              nicheSlug,
              status: "PENDING",
            },
          ],
          count: 1,
        }),
      });
      return;
    }

    // No nicheSlug → batch jobs for all active niches
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        jobs: [
          { jobId: "job-tech-ia-1", nicheSlug: "tech-ia", status: "PENDING" },
          { jobId: "job-gaming-1", nicheSlug: "gaming", status: "PENDING" },
          { jobId: "job-business-1", nicheSlug: "business", status: "PENDING" },
        ],
        count: 3,
      }),
    });
  });
}

/* ========================================================================== */
/*  3. GET /api/trends — Tests                                                */
/* ========================================================================== */

test.describe("Tendances — GET /api/trends", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetTrends(page);
  });

  /* ----- Success paths ----- */

  test("1a — Authentification valide → 200 avec tableau de tendances de la niche suivie", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[]; plan: string; nextCursor: string | null };
    expect(body).toHaveProperty("trends");
    expect(Array.isArray(body.trends)).toBe(true);
    expect(body.trends.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("plan");
    expect(body.plan).toBe("PRO");
    expect(body).toHaveProperty("nextCursor");
  });

  test("1b — Utilisateur PRO/TEAM → 200 avec tendances (pas de restriction de niche)", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=TEAM`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[]; plan: string };
    expect(body.plan).toBe("TEAM");
    expect(body.trends.length).toBeGreaterThan(0);
  });

  test("1c — Pagination par curseur → nextCursor est une chaîne quand il y a plus de pages", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&limit=5`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { nextCursor: string | null };
    expect(body).toHaveProperty("nextCursor");
    expect(typeof body.nextCursor).toBe("string");
    expect(body.nextCursor).toBe(CURSOR_VALUE);
  });

  test("1d — Dernière page → nextCursor est null", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&cursor=${CURSOR_VALUE}`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
  });

  test("1e — Cache hit : une même requête retourne la réponse en cache", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_cache_hit=true`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { _test_cached: boolean };
    expect(body._test_cached).toBe(true);
  });

  test("1f — Cache miss : requête suivante récupère depuis la base", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_cache_flow=true`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { _test_cached: boolean; _test_cacheHitCount: number };
    // First call is a cache miss — fresh data
    expect(body._test_cached).toBe(false);
    expect(body._test_cacheHitCount).toBe(1);
  });

  /* ----- Error paths ----- */

  test("1g — Session absente → 401 avec error + code", async ({ page }) => {
    const res = await fetchApi(page, `/api/trends?niche=${VALID_NICHE}`);

    expect(res.status).toBe(401);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("1h — Rate limit dépassé → 429", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_rate_limit=true`,
    );

    expect(res.status).toBe(429);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Trop de requêtes",
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  test("1i — Paramètre 'niche' manquant → 400 erreur de validation", async ({ page }) => {
    const res = await fetchApi(page, "/api/trends?_test_session=true");

    expect(res.status).toBe(400);

    const body = res.body as { error: string; code: string; details: Record<string, unknown> };
    expect(body).toMatchObject({
      error: "Paramètres invalides",
      code: "VALIDATION_ERROR",
    });
    expect(body.details).toHaveProperty("niche");
  });

  test("1j — Slug de niche invalide → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${INVALID_NICHE_SLUG}&_test_session=true&_test_invalid_niche=true`,
    );

    expect(res.status).toBe(400);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Paramètres invalides",
      code: "VALIDATION_ERROR",
    });
  });

  test("1k — Niche introuvable en base → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${NONEXISTENT_NICHE}&_test_session=true&_test_niche_not_found=true`,
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Niche introuvable",
      code: "NOT_FOUND",
    });
  });

  test("1l — Utilisateur FREE suivant une autre niche → 403 ForbiddenError", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=FREE&_test_forbidden_niche=true`,
    );

    expect(res.status).toBe(403);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Vous ne suivez pas cette niche",
      code: "FORBIDDEN",
    });
  });

  test("1m — Erreur interne de base de données → 500", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_db_error=true`,
    );

    expect(res.status).toBe(500);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Erreur interne du serveur",
      code: "INTERNAL_ERROR",
    });
  });

  /* ----- Edge cases ----- */

  test("1n — Plan FREE : maximum 5 tendances retournées", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=FREE&limit=20`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[]; plan: string };
    expect(body.plan).toBe("FREE");
    expect(body.trends.length).toBeLessThanOrEqual(5);
  });

  test("1o — Plan PRO : tendances illimitées", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&limit=50`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[]; plan: string };
    expect(body.plan).toBe("PRO");
    expect(body.trends.length).toBe(50);
  });

  test("1p — Limite inférieure à 1 → clampée à 1", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_clamp_low=true&limit=0`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[] };
    expect(body.trends.length).toBe(1);
  });

  test("1q — Limite supérieure à 100 → clampée à 100", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_clamp_high=true&limit=200`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[] };
    expect(body.trends.length).toBe(100);
  });

  test("1r — Tendances vides pour une niche valide → [] avec plan et nextCursor null", async ({
    page,
  }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_empty=true`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: unknown[]; plan: string; nextCursor: null };
    expect(body.trends).toEqual([]);
    expect(body.plan).toBe("PRO");
    expect(body.nextCursor).toBeNull();
  });

  test("1s — Tendances expirées filtrées (expiresAt >= now)", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_expired=true`,
    );

    expect(res.status).toBe(200);

    const body = res.body as {
      trends: Array<{ expiresAt: string }>;
      _test_totalTrends: number;
      _test_expiredCount: number;
    };

    // All returned trends must have future expiresAt
    for (const trend of body.trends) {
      expect(new Date(trend.expiresAt).getTime()).toBeGreaterThanOrEqual(Date.now());
    }

    // Some trends were filtered out
    expect(body._test_expiredCount).toBeGreaterThan(0);
    expect(body._test_totalTrends).toBeGreaterThan(body.trends.length);
  });

  test("1t — Tendances ordonnées par score DESC, id ASC", async ({ page }) => {
    const res = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_order=true`,
    );

    expect(res.status).toBe(200);

    const body = res.body as { trends: Array<{ id: string; score: number }> };
    const scores = body.trends.map((t) => t.score);

    // Scores must be in descending order
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    // Verify specific order: 100, 95, 65, 30, 10
    expect(body.trends[0].score).toBe(100);
    expect(body.trends[1].score).toBe(95);
    expect(body.trends[2].score).toBe(65);
    expect(body.trends[3].score).toBe(30);
    expect(body.trends[4].score).toBe(10);
  });

  test("1u — Requête sans curseur met en cache ; la suivante retourne la donnée en cache", async ({
    page,
  }) => {
    // Step 1: first request (non-cursor) sets the cache
    const res1 = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_cache_flow=true`,
    );

    expect(res1.status).toBe(200);
    const body1 = res1.body as { _test_cached: boolean; _test_cacheHitCount: number };
    expect(body1._test_cached).toBe(false);
    expect(body1._test_cacheHitCount).toBe(1);

    // Step 2: second request returns cached data
    const res2 = await fetchApi(
      page,
      `/api/trends?niche=${VALID_NICHE}&_test_session=true&_test_plan=PRO&_test_cache_flow=true`,
    );

    expect(res2.status).toBe(200);
    const body2 = res2.body as { _test_cached: boolean; _test_cacheHitCount: number };
    expect(body2._test_cached).toBe(true);
    expect(body2._test_cacheHitCount).toBe(2);
  });
});

/* ========================================================================== */
/*  4. POST /api/trends/refresh — Tests                                       */
/* ========================================================================== */

test.describe("Refresh des tendances — POST /api/trends/refresh", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockRefreshTrends(page);
  });

  test("2a — Session absente → 401", async ({ page }) => {
    const res = await fetchApiPost(page, "/api/trends/refresh", {
      body: { nicheSlug: VALID_NICHE },
    });

    expect(res.status).toBe(401);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("2b — Token de session invalide → 401", async ({ page }) => {
    const res = await fetchApiPost(page, "/api/trends/refresh?_test_invalid_session=true", {
      body: { nicheSlug: VALID_NICHE },
    });

    expect(res.status).toBe(401);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Session invalide",
      code: "UNAUTHORIZED",
    });
  });

  test("2c — Auth valide avec nicheSlug → 202 avec un seul jobId + status PENDING", async ({
    page,
  }) => {
    const res = await fetchApiPost(page, "/api/trends/refresh?_test_session=true", {
      body: { nicheSlug: VALID_NICHE },
    });

    expect(res.status).toBe(202);

    const body = res.body as {
      jobs: Array<{ jobId: string; nicheSlug: string; status: string }>;
      count: number;
    };
    expect(body).toHaveProperty("jobs");
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBe(1);
    expect(body.jobs[0]).toHaveProperty("jobId");
    expect(typeof body.jobs[0].jobId).toBe("string");
    expect(body.jobs[0].nicheSlug).toBe(VALID_NICHE);
    expect(body.jobs[0].status).toBe("PENDING");
    expect(body.count).toBe(1);
  });

  test("2d — Auth valide sans nicheSlug → 202 avec plusieurs jobIds", async ({ page }) => {
    const res = await fetchApiPost(page, "/api/trends/refresh?_test_session=true", {
      body: {},
    });

    expect(res.status).toBe(202);

    const body = res.body as {
      jobs: Array<{ jobId: string; nicheSlug: string; status: string }>;
      count: number;
    };
    expect(body).toHaveProperty("jobs");
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThan(1);
    expect(body.count).toBe(body.jobs.length);

    // Each job should have a unique jobId and PENDING status
    for (const job of body.jobs) {
      expect(job).toHaveProperty("jobId");
      expect(typeof job.jobId).toBe("string");
      expect(job).toHaveProperty("nicheSlug");
      expect(job).toHaveProperty("status");
      expect(job.status).toBe("PENDING");
    }
  });

  test("2e — nicheSlug d'une niche inexistante → 404", async ({ page }) => {
    const res = await fetchApiPost(
      page,
      `/api/trends/refresh?_test_session=true&_test_niche_not_found=true`,
      {
        body: { nicheSlug: NONEXISTENT_NICHE },
      },
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Niche introuvable",
      code: "NOT_FOUND",
    });
  });

  test("2f — Aucune niche active → 202 avec count: 0 et message 'Aucune niche active'", async ({
    page,
  }) => {
    const res = await fetchApiPost(
      page,
      "/api/trends/refresh?_test_session=true&_test_no_active_niches=true",
      {
        body: {},
      },
    );

    expect(res.status).toBe(202);

    const body = res.body as { jobs: unknown[]; count: number; message: string };
    expect(body.count).toBe(0);
    expect(body.message).toBe("Aucune niche active");
    expect(body.jobs).toEqual([]);
  });

  test("2g — Plus de 50 niches actives → seules 50 sont traitées (limite de lot)", async ({
    page,
  }) => {
    const res = await fetchApiPost(
      page,
      "/api/trends/refresh?_test_session=true&_test_batch_limit=true",
      {
        body: {},
      },
    );

    expect(res.status).toBe(202);

    const body = res.body as {
      jobs: Array<{ jobId: string }>;
      count: number;
      _test_batchLimitApplied: boolean;
      _test_totalNiches: number;
    };
    expect(body.count).toBe(50);
    expect(body.jobs.length).toBe(50);
    expect(body._test_batchLimitApplied).toBe(true);
    expect(body._test_totalNiches).toBeGreaterThan(50);
  });

  test("2h — Corps JSON invalide/malformé → parsé comme {}, crée des jobs batch", async ({
    page,
  }) => {
    const res = await fetchApiPost(
      page,
      "/api/trends/refresh?_test_session=true&_test_malformed_body=true",
      {
        body: "{broken-json",
      },
    );

    expect(res.status).toBe(202);

    const body = res.body as {
      jobs: Array<unknown>;
      count: number;
      _test_malformedBodyFallback: boolean;
    };
    expect(body.count).toBeGreaterThan(0);
    expect(body.jobs.length).toBeGreaterThan(0);
    expect(body._test_malformedBodyFallback).toBe(true);
  });

  test("2i — Cache invalidé après un refresh (invalidateCache appelé)", async ({ page }) => {
    const res = await fetchApiPost(
      page,
      "/api/trends/refresh?_test_session=true&_test_invalidate_cache=true",
      {
        body: { nicheSlug: VALID_NICHE },
      },
    );

    expect(res.status).toBe(202);

    const body = res.body as { _test_cacheInvalidated: boolean };
    expect(body._test_cacheInvalidated).toBe(true);
  });

  test("2j — Rate limit dépassé → 429", async ({ page }) => {
    const res = await fetchApiPost(
      page,
      `/api/trends/refresh?_test_session=true&_test_rate_limit=true`,
      {
        body: { nicheSlug: VALID_NICHE },
      },
    );

    expect(res.status).toBe(429);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Trop de requêtes",
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  test("2k — nicheSlug et nicheId tous deux fournis → un seul job créé", async ({ page }) => {
    const res = await fetchApiPost(page, "/api/trends/refresh?_test_session=true", {
      body: { nicheSlug: VALID_NICHE, nicheId: "niche-42" },
    });

    expect(res.status).toBe(202);

    const body = res.body as {
      jobs: Array<{ jobId: string; nicheSlug: string; nicheId: string; status: string }>;
      count: number;
      _test_dualIdentifiers: boolean;
    };
    expect(body.count).toBe(1);
    expect(body.jobs.length).toBe(1);
    expect(body.jobs[0].nicheSlug).toBe(VALID_NICHE);
    expect(body.jobs[0].nicheId).toBe("niche-42");
    expect(body.jobs[0].status).toBe("PENDING");
    expect(body._test_dualIdentifiers).toBe(true);
  });

  test("2l — Erreur DB lors de la récupération des niches → 500", async ({ page }) => {
    const res = await fetchApiPost(
      page,
      "/api/trends/refresh?_test_session=true&_test_db_error=true",
      {
        body: {},
      },
    );

    expect(res.status).toBe(500);

    const body = res.body as { error: string; code: string };
    expect(body).toMatchObject({
      error: "Erreur interne du serveur",
      code: "INTERNAL_ERROR",
    });
  });
});
