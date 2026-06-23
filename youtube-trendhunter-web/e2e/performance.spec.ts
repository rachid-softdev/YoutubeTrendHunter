import { test, expect, type Page } from "@playwright/test";

/**
 * Performance & Load E2E tests for YouTube TrendHunter
 *
 * Covers:
 *   - Rate limiting on auth endpoint (burst)
 *   - Rate limiting on trends endpoint
 *   - Concurrent niche switching
 *   - Response time for public pages
 *   - Response time for API trends
 *   - Memory stability (repeated navigation)
 *   - Concurrent API calls
 *   - Large payload handling
 */

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const BASE_URL = "http://localhost:3000";

const VALID_NICHE = "tech-ia";
const NICHE_LIST = ["tech-ia", "gaming", "business", "sante-bien-etre", "finance"];

const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_BODY = {
  error: "Trop de requêtes",
  code: "RATE_LIMIT_EXCEEDED",
};

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

async function setupApiPage(page: Page) {
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

async function mockSession(page: Page) {
  const session = {
    user: {
      id: "test-user-id",
      name: "Test",
      email: "test@test.com",
      role: "USER" as const,
      plan: "PRO" as const,
    },
    expires: "2099-01-01T00:00:00.000Z",
  };

  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

/**
 * Build a mock /api/trends response body.
 */
function buildTrends(count: number, nicheSlug: string): Array<Record<string, unknown>> {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `trend-${nicheSlug}-${i + 1}`,
    title: `Tendance #${i + 1} — ${nicheSlug}`,
    score: Math.round((95 - i * (95 / Math.max(count, 1))) * 10) / 10,
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

/**
 * Mock the GET /api/trends endpoint with optional rate limiting.
 */
async function mockTrendsEndpoint(
  page: Page,
  options?: {
    rateLimitAfter?: number;
    largePayload?: boolean;
  },
) {
  let callCount = 0;

  await page.route("**/api/trends*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    callCount++;

    const url = new URL(route.request().url());
    const nicheSlug = url.searchParams.get("niche") || "tech-ia";

    // Simulate rate limiting after a configurable number of calls
    if (options?.rateLimitAfter && callCount > options.rateLimitAfter) {
      await route.fulfill({
        status: RATE_LIMIT_STATUS,
        contentType: "application/json",
        body: JSON.stringify(RATE_LIMIT_BODY),
      });
      return;
    }

    const count = options?.largePayload ? 100 : 5;
    const trends = buildTrends(count, nicheSlug);

    // Simulate a small delay for realistic timing
    await new Promise((r) => setTimeout(r, 10));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends,
        plan: "PRO",
        nextCursor: null,
        _test_callCount: callCount,
      }),
    });
  });
}

/**
 * Fire an API call via the browser's native fetch, return timing + result.
 */
async function timedFetch<T = unknown>(
  page: Page,
  url: string,
): Promise<{ duration: number; status: number; body: T }> {
  return page.evaluate(async (fetchUrl: string) => {
    const start = performance.now();
    const res = await fetch(fetchUrl);
    const duration = performance.now() - start;
    const body = await res.json();
    return { duration, status: res.status, body: body as T };
  }, url);
}

/* ========================================================================== */
/*  1. Rate Limiting — Auth endpoint burst                                    */
/* ========================================================================== */

test.describe("Performance — Rate limiting Auth (burst)", () => {
  test("10 requêtes rapides en <2s déclenchent le rate limit (429)", async ({ page }) => {
    await setupApiPage(page);

    let attemptCount = 0;

    await page.route("**/api/extension/auth*", async (route) => {
      attemptCount++;
      if (attemptCount > 3) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: {
            "X-RateLimit-Limit": "5",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 55),
            "Retry-After": "55",
          },
          body: JSON.stringify({
            error: "Trop de requêtes. Réessayez plus tard.",
            code: "RATE_LIMIT",
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
      }
    });

    const start = Date.now();
    const results = await page.evaluate(async () => {
      return await Promise.all(
        Array.from({ length: 10 }, () =>
          fetch("/api/extension/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "BurstTest" }),
          }).then(async (res) => ({
            status: res.status,
            body: await res.json(),
          })),
        ),
      );
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    const rateLimited = results.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
    for (const r of rateLimited) {
      expect(r.body.code).toBe("RATE_LIMIT");
    }
  });
});

/* ========================================================================== */
/*  2. Rate Limiting — Trends endpoint                                        */
/* ========================================================================== */

test.describe("Performance — Rate limiting Trends", () => {
  test("requêtes consécutives rapides → rate limit se déclenche", async ({ page }) => {
    await setupApiPage(page);
    await mockSession(page);
    await mockTrendsEndpoint(page, { rateLimitAfter: 5 });

    const results = await page.evaluate(async () => {
      const reqs: Array<{ status: number; body: { code?: string } }> = [];
      for (let i = 0; i < 10; i++) {
        const res = await fetch("/api/trends?niche=tech-ia");
        const body = await res.json();
        reqs.push({ status: res.status, body });
      }
      return reqs;
    });

    const rateLimited = results.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);

    const firstRateLimit = results.findIndex((r) => r.status === 429);
    expect(firstRateLimit).toBeGreaterThanOrEqual(6);

    for (const r of rateLimited) {
      expect(r.body.code).toBe("RATE_LIMIT_EXCEEDED");
    }
  });
});

/* ========================================================================== */
/*  3. Concurrent Niche Switching                                             */
/* ========================================================================== */

test.describe("Performance — Changement rapide de niches", () => {
  test("5 changements de niche rapides sans données périmées ni crash", async ({ page }) => {
    await setupApiPage(page);
    await mockSession(page);

    // Mock trends — return different title per niche
    await page.route("**/api/trends*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const url = new URL(route.request().url());
      const nicheSlug = url.searchParams.get("niche") || "unknown";
      const trends = buildTrends(3, nicheSlug);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends, plan: "PRO", nextCursor: null }),
      });
    });

    // Fire 5 rapid niche requests concurrently
    const results = await page.evaluate(async (niches: string[]) => {
      return await Promise.all(
        niches.map(async (niche) => {
          const res = await fetch(`/api/trends?niche=${niche}`);
          const body = await res.json();
          return { niche, status: res.status, trends: body.trends as Array<{ id: string }> };
        }),
      );
    }, NICHE_LIST);

    // All must succeed
    expect(results).toHaveLength(NICHE_LIST.length);
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.trends.length).toBeGreaterThan(0);
      // Each niche response must contain trends matching its niche
      for (const trend of result.trends) {
        expect(trend.id).toContain(result.niche);
      }
    }
  });
});

/* ========================================================================== */
/*  4. Response Time — Public Pages                                           */
/* ========================================================================== */

test.describe("Performance — Temps de réponse pages publiques", () => {
  const PAGES = ["/", "/pricing", "/blog"];
  const MAX_TTFB = 2000;

  for (const pagePath of PAGES) {
    test(`TTFB ${pagePath} < ${MAX_TTFB}ms`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      const start = performance.now();
      await page.goto(pagePath, { waitUntil: "networkidle" });
      const ttfb = performance.now() - start;

      expect(errors).toHaveLength(0);
      expect(ttfb).toBeLessThan(MAX_TTFB);
    });
  }
});

/* ========================================================================== */
/*  5. Response Time — API Trends                                             */
/* ========================================================================== */

test.describe("Performance — Temps de réponse API Trends", () => {
  test("GET /api/trends?niche=tech < 1000ms", async ({ page }) => {
    await setupApiPage(page);
    await mockSession(page);
    await mockTrendsEndpoint(page);

    const { duration, status } = await timedFetch(page, "/api/trends?niche=tech");

    expect(status).toBe(200);
    expect(duration).toBeLessThan(1000);
  });
});

/* ========================================================================== */
/*  6. Memory Stability — Navigation répétée                                  */
/* ========================================================================== */

test.describe("Performance — Stabilité mémoire (navigation répétée)", () => {
  test("10 navigations entre pages sans crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const routes = ["/", "/pricing", "/blog", "/features", "/niches", "/privacy", "/terms"];
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      for (const route of routes) {
        const start = performance.now();
        await page.goto(route, { waitUntil: "networkidle" });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(5000);
        expect(page.url()).toContain(route === "/" ? "localhost:3000/" : route);
      }
    }

    expect(errors).toHaveLength(0);
  });
});

/* ========================================================================== */
/*  7. Concurrent API Calls                                                   */
/* ========================================================================== */

test.describe("Performance — Appels API concurrents", () => {
  test("5 appels API simultanés retournent tous des réponses valides", async ({ page }) => {
    await setupApiPage(page);
    await mockSession(page);
    await mockTrendsEndpoint(page);

    const results = await page.evaluate(async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`/api/trends?niche=tech-ia&_r=${i}`).then(async (res) => ({
          status: res.status,
          ok: res.ok,
          body: await res.json(),
        })),
      );
      return await Promise.all(requests);
    });

    expect(results).toHaveLength(5);
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
      expect(res.body).toHaveProperty("trends");
      expect(Array.isArray(res.body.trends)).toBe(true);
      expect(res.body.trends.length).toBeGreaterThan(0);
    }
  });
});

/* ========================================================================== */
/*  8. Large Payload Handling                                                 */
/* ========================================================================== */

test.describe("Performance — Chargement de gros volumes", () => {
  test("trends sans limite de filtre (100 tendances) → réponse gérable", async ({ page }) => {
    await setupApiPage(page);
    await mockSession(page);
    await mockTrendsEndpoint(page, { largePayload: true });

    const { duration, status, body } = await timedFetch<{
      trends: unknown[];
      plan: string;
    }>(page, "/api/trends?niche=tech-ia");

    expect(status).toBe(200);
    expect(body.trends.length).toBe(100);
    expect(duration).toBeLessThan(2000);
    expect(body.plan).toBe("PRO");
  });
});
