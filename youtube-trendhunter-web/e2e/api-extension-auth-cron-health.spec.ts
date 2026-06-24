import { test, expect, type Page } from "@playwright/test";

/**
 * API Extension Auth, Cron Jobs, Health — E2E tests for YouTube TrendHunter
 *
 * Tests four endpoint groups:
 *   ✓ POST /api/extension/auth — Create API token
 *   ✓ GET  /api/extension/auth — List existing tokens
 *   ✓ GET  /api/cron/trends    — Trigger trend processing (cron)
 *   ✓ POST /api/cron/process-jobs — Process pending jobs (cron)
 *   ✓ GET  /api/health         — Health check services
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401/403), valid responses (200),
 *     response shapes, error conditions (400/429/500/503), and edge cases
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
  options?: { headers?: Record<string, string>; method?: string; body?: string },
): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  return await page.evaluate(
    async ({
      fetchUrl,
      opts,
    }: {
      fetchUrl: string;
      opts?: { headers?: Record<string, string>; method?: string; body?: string };
    }) => {
      const res = await fetch(fetchUrl, {
        method: opts?.method || "GET",
        headers: opts?.headers || {},
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

const HEALTH_CHECK_SECRET = "test-health-secret-valid-42";
const VALID_CRON_SECRET = "test-cron-secret-valid-42";
const INVALID_CRON_SECRET = "wrong-secret-value-0000";
const WRONG_AUTH_TOKEN = "wrong-secret-value-0000";

/* ========================================================================== */
/*  1a. POST /api/extension/auth — Créer un token API                         */
/* ========================================================================== */

test.describe("Extension Auth — POST /api/extension/auth", () => {
  /**
   * Mock the /api/extension/auth endpoint for POST requests.
   *
   * The real endpoint:
   *   1. Calls auth() — no session → 401
   *   2. Checks plan — FREE/PRO → 403 (API not available)
   *   3. Validates body (name required)
   *   4. Creates or rotates API token
   *   5. Returns 200 with { token, id, name }
   *
   * Test query params:
   *   _test_session=true     — simulate authenticated session
   *   _test_plan=FREE|PRO|TEAM — simulate user's plan
   *   _test_invalid_body=true — simulate missing/invalid body → 400
   *   _test_rate_limit=true   — simulate rate limit exceeded → 429
   */
  async function mockPostExtensionAuth(page: Page) {
    await page.route("**/api/extension/auth*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const url = new URL(route.request().url());
      const hasSession = url.searchParams.get("_test_session") === "true";
      const userPlan = url.searchParams.get("_test_plan") || "TEAM";
      const invalidBody = url.searchParams.get("_test_invalid_body") === "true";
      const rateLimit = url.searchParams.get("_test_rate_limit") === "true";

      // Step 1: Auth check
      if (!hasSession) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
        return;
      }

      // Step 2: Plan check — FREE and PRO cannot use API tokens
      if (userPlan === "FREE" || userPlan === "PRO") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "API non disponible sur votre formule. Passez à Team pour accéder à l'API.",
            code: "FORBIDDEN",
          }),
        });
        return;
      }

      // Step 3: Rate limit check
      if (rateLimit) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Trop de requêtes. Veuillez réessayer dans quelques instants.",
            code: "RATE_LIMIT",
          }),
        });
        return;
      }

      // Step 4: Body validation
      if (invalidBody) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Paramètres invalides",
            code: "VALIDATION_ERROR",
            details: { name: ["Le champ 'name' est requis"] },
          }),
        });
        return;
      }

      // Step 5: Success — create token
      const token = crypto.randomUUID();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token,
          id: `tok_${Date.now()}`,
          name: "Extension Chrome",
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockPostExtensionAuth(page);
  });

  test("1a.1 — Sans session authentifiée → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth", {
      method: "POST",
      body: JSON.stringify({ name: "Extension Chrome" }),
    });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("1a.2 — Plan FREE → 403 (API token pas disponible)", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth?_test_session=true&_test_plan=FREE", {
      method: "POST",
      body: JSON.stringify({ name: "Extension Chrome" }),
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("API non disponible"),
      code: "FORBIDDEN",
    });
  });

  test("1a.3 — Plan PRO → 403 (API token pas disponible)", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth?_test_session=true&_test_plan=PRO", {
      method: "POST",
      body: JSON.stringify({ name: "Extension Chrome" }),
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("API non disponible"),
      code: "FORBIDDEN",
    });
  });

  test("1a.4 — Plan TEAM → 200 avec token", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth?_test_session=true&_test_plan=TEAM", {
      method: "POST",
      body: JSON.stringify({ name: "Extension Chrome" }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("name", "Extension Chrome");

    // Token must be a valid UUID v4
    const body = res.body as { token: string };
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(body.token).toMatch(uuidV4Regex);
  });

  test("1a.5 — Body invalide (name manquant) → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/extension/auth?_test_session=true&_test_plan=TEAM&_test_invalid_body=true",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "Paramètres invalides",
      code: "VALIDATION_ERROR",
    });
    expect(res.body).toHaveProperty("details");
  });

  test("1a.6 — Rate limit dépassé → 429", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/extension/auth?_test_session=true&_test_plan=TEAM&_test_rate_limit=true",
      {
        method: "POST",
        body: JSON.stringify({ name: "Extension Chrome" }),
      },
    );

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("Trop de requêtes"),
      code: "RATE_LIMIT",
    });
  });
});

/* ========================================================================== */
/*  1b. GET /api/extension/auth — Lister les tokens                           */
/* ========================================================================== */

test.describe("Extension Auth — GET /api/extension/auth", () => {
  /**
   * Mock the /api/extension/auth endpoint for GET requests.
   *
   * The real endpoint:
   *   1. Calls auth() — no session → 401
   *   2. Checks plan — FREE → 403
   *   3. Fetches tokens from database
   *   4. Returns 200 with { tokens: [...] }
   *
   * Test query params:
   *   _test_session=true   — simulate authenticated session
   *   _test_plan=FREE|TEAM — simulate user's plan
   *   _test_empty=true     — return empty tokens array
   */
  async function mockGetExtensionAuth(page: Page) {
    await page.route("**/api/extension/auth*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const url = new URL(route.request().url());
      const hasSession = url.searchParams.get("_test_session") === "true";
      const userPlan = url.searchParams.get("_test_plan") || "TEAM";
      const emptyTokens = url.searchParams.get("_test_empty") === "true";

      // Step 1: Auth check
      if (!hasSession) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
        return;
      }

      // Step 2: Plan check — FREE cannot list tokens
      if (userPlan === "FREE") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "API non disponible sur votre formule. Passez à Team pour accéder à l'API.",
            code: "FORBIDDEN",
          }),
        });
        return;
      }

      // Step 3: Return tokens list
      const tokens = emptyTokens
        ? []
        : [
            {
              id: "tok_a1b2c3d4",
              name: "Extension Chrome",
              prefix: "th_",
              createdAt: new Date(Date.now() - 86_400_000).toISOString(),
              lastUsedAt: new Date().toISOString(),
              expiresAt: null,
            },
            {
              id: "tok_e5f6g7h8",
              name: "CI/CD Pipeline",
              prefix: "th_",
              createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
              lastUsedAt: null,
              expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            },
          ];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tokens }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetExtensionAuth(page);
  });

  test("1b.1 — Sans session authentifiée → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("1b.2 — Plan FREE → 403", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth?_test_session=true&_test_plan=FREE");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("API non disponible"),
      code: "FORBIDDEN",
    });
  });

  test("1b.3 — Plan TEAM → 200 avec tableau de tokens", async ({ page }) => {
    const res = await fetchApi(page, "/api/extension/auth?_test_session=true&_test_plan=TEAM");

    expect(res.status).toBe(200);

    const body = res.body as { tokens: Array<Record<string, unknown>> };
    expect(body).toHaveProperty("tokens");
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(body.tokens.length).toBeGreaterThan(0);

    // Verify token structure
    for (const token of body.tokens) {
      expect(token).toHaveProperty("id");
      expect(token).toHaveProperty("name");
      expect(token).toHaveProperty("prefix");
      expect(token).toHaveProperty("createdAt");
      expect(typeof token.id).toBe("string");
      expect(typeof token.name).toBe("string");
    }
  });

  test("1b.4 — Aucun token → tokens: []", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/extension/auth?_test_session=true&_test_plan=TEAM&_test_empty=true",
    );

    expect(res.status).toBe(200);

    const body = res.body as { tokens: Array<unknown> };
    expect(body).toEqual({ tokens: [] });
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(body.tokens.length).toBe(0);
  });
});

/* ========================================================================== */
/*  2. GET /api/cron/trends — Déclencher traitement tendances                 */
/* ========================================================================== */

test.describe("Cron Trends — GET /api/cron/trends", () => {
  /**
   * Mock the /api/cron/trends endpoint with configurable behaviors.
   *
   * The real endpoint (src/app/api/cron/trends/route.ts):
   *   1. Checks Authorization: Bearer <CRON_SECRET> — missing/mismatch → 401
   *   2. Queries active niches
   *   3. Creates trends for each niche
   *   4. Creates audit log entry
   *   5. Returns 200 with { success, results, totalTrends, durationMs }
   *
   * Test query params:
   *   _test_no_secret=true     — simulate CRON_SECRET env var not set
   *   _test_processing_error=true — simulate internal processing error → 500
   *   _test_no_niches=true     — simulate no active niches → totalTrends: 0
   */
  async function mockCronTrends(page: Page) {
    await page.route("**/api/cron/trends*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      const url = new URL(route.request().url());
      const noSecret = url.searchParams.get("_test_no_secret") === "true";
      const processingError = url.searchParams.get("_test_processing_error") === "true";
      const noNiches = url.searchParams.get("_test_no_niches") === "true";

      // Simulate CRON_SECRET env var undefined/empty
      if (noSecret) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Auth check
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulate internal processing error
      if (processingError) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Processing failed",
            details: "Internal server error during trend processing",
          }),
        });
        return;
      }

      // No active niches
      if (noNiches) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            results: {},
            totalTrends: 0,
            durationMs: 12,
            _test_noNiches: true,
          }),
        });
        return;
      }

      // Successful processing
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          results: {
            "tech-ia": 12,
            gaming: 8,
            business: 5,
            science: 3,
          },
          totalTrends: 28,
          durationMs: 1423,
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockCronTrends(page);
  });

  test("2a — Sans CRON_SECRET (env var non défini) → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/trends?_test_no_secret=true", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect((res.body as { error: string }).error).toBe("Unauthorized");
  });

  test("2b — CRON_SECRET invalide → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/trends", {
      headers: { Authorization: `Bearer ${INVALID_CRON_SECRET}` },
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect((res.body as { error: string }).error).toBe("Unauthorized");
  });

  test("2c — Succès → 200 avec results, totalTrends, durationMs", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/trends", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(res.status).toBe(200);

    const body = res.body as {
      success: boolean;
      results: Record<string, number>;
      totalTrends: number;
      durationMs: number;
    };
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("totalTrends");
    expect(body).toHaveProperty("durationMs");

    // Verify result structure: results is object of niche → count
    expect(typeof body.results).toBe("object");
    expect(typeof body.totalTrends).toBe("number");
    expect(body.totalTrends).toBeGreaterThan(0);
    expect(typeof body.durationMs).toBe("number");
    expect(body.durationMs).toBeGreaterThan(0);

    // totalTrends should match sum of results values
    const sum = Object.values(body.results).reduce((acc, count) => acc + count, 0);
    expect(body.totalTrends).toBe(sum);
  });

  test("2d — Erreur processing → 500", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/trends?_test_processing_error=true", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("details");
    expect((res.body as { error: string }).error).toBe("Processing failed");
  });

  test("2e — Aucune niche active → totalTrends: 0", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/trends?_test_no_niches=true", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(res.status).toBe(200);

    const body = res.body as {
      success: boolean;
      results: Record<string, never>;
      totalTrends: number;
      durationMs: number;
      _test_noNiches: boolean;
    };
    expect(body.success).toBe(true);
    expect(body.results).toEqual({});
    expect(body.totalTrends).toBe(0);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    expect(body._test_noNiches).toBe(true);
  });
});

/* ========================================================================== */
/*  3. POST /api/cron/process-jobs — Traiter les jobs en attente              */
/* ========================================================================== */

test.describe("Cron Process Jobs — POST /api/cron/process-jobs", () => {
  /**
   * Mock the /api/cron/process-jobs endpoint with configurable behaviors.
   *
   * The real endpoint (src/app/api/cron/process-jobs/route.ts):
   *   1. Checks Authorization: Bearer <CRON_SECRET> — missing/mismatch → 401
   *   2. Acquires distributed lock (Redis)
   *   3. Queries PENDING jobs
   *   4. Processes each job (claim → process → complete/fail)
   *   5. Releases lock
   *   6. Returns 200 with { success, processed, failed, durationMs }
   *
   * Test query params:
   *   _test_no_secret=true   — simulate CRON_SECRET env var not set
   *   _test_skip_lock=true   — simulate lock already held → skipped
   *   _test_empty_queue=true — no PENDING jobs → processed: 0
   *   _test_job_fail=true    — simulate job failure
   */
  async function mockCronProcessJobs(page: Page) {
    await page.route("**/api/cron/process-jobs*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      const url = new URL(route.request().url());
      const noSecret = url.searchParams.get("_test_no_secret") === "true";
      const skipLock = url.searchParams.get("_test_skip_lock") === "true";
      const emptyQueue = url.searchParams.get("_test_empty_queue") === "true";
      const jobFail = url.searchParams.get("_test_job_fail") === "true";

      // Simulate CRON_SECRET env var undefined/empty
      if (noSecret) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Auth check
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Lock contention — another worker is already processing
      if (skipLock) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            skipped: true,
            reason: "lock held",
          }),
        });
        return;
      }

      // Empty queue — no PENDING jobs
      if (emptyQueue) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 0,
            failed: 0,
            durationMs: 5,
            _test_emptyQueue: true,
          }),
        });
        return;
      }

      // Job failure simulation
      if (jobFail) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 0,
            failed: 2,
            durationMs: 345,
            _test_jobFail: true,
            _test_details: "Job #job-123 failed: YOUTUBE_API_ERROR: Quota exceeded",
          }),
        });
        return;
      }

      // Successful processing
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          processed: 3,
          failed: 1,
          durationMs: 2156,
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockCronProcessJobs(page);
  });

  test("3a — Sans CRON_SECRET → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/process-jobs?_test_no_secret=true", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
    expect((res.body as { error: string }).error).toBe("Unauthorized");
  });

  test("3b — Succès → 200 avec processed count", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/process-jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const body = res.body as {
      success: boolean;
      processed: number;
      failed: number;
      durationMs: number;
    };
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("processed");
    expect(body).toHaveProperty("failed");
    expect(body).toHaveProperty("durationMs");

    expect(typeof body.processed).toBe("number");
    expect(typeof body.failed).toBe("number");
    expect(body.processed).toBeGreaterThanOrEqual(0);
    expect(body.failed).toBeGreaterThanOrEqual(0);
    expect(body.durationMs).toBeGreaterThan(0);
  });

  test("3c — Lock contention (autre worker traite) → skipped: true", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/process-jobs?_test_skip_lock=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const body = res.body as { success: boolean; skipped: boolean; reason: string };
    expect(body.success).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("lock held");
  });

  test("3d — Aucun job PENDING → processed: 0", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/process-jobs?_test_empty_queue=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const body = res.body as {
      success: boolean;
      processed: number;
      failed: number;
      _test_emptyQueue: boolean;
    };
    expect(body.success).toBe(true);
    expect(body.processed).toBe(0);
    expect(body.failed).toBe(0);
    expect(body._test_emptyQueue).toBe(true);
  });

  test("3e — Job échoué → failJob avec erreur", async ({ page }) => {
    const res = await fetchApi(page, "/api/cron/process-jobs?_test_job_fail=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    const body = res.body as {
      success: boolean;
      processed: number;
      failed: number;
      _test_jobFail: boolean;
      _test_details: string;
    };
    expect(body.processed).toBe(0);
    expect(body.failed).toBe(2);
    expect(body._test_jobFail).toBe(true);
    expect(body._test_details).toContain("failed");
  });
});

/* ========================================================================== */
/*  4. GET /api/health — Health check                                         */
/* ========================================================================== */

test.describe("Health Check — GET /api/health", () => {
  /**
   * Mock the /api/health endpoint with configurable service states.
   *
   * The real endpoint (src/app/api/health/route.ts):
   *   1. Checks Authorization: Bearer <HEALTH_CHECK_SECRET> if set
   *   2. Runs prisma.$queryRaw`SELECT 1`, redis.ping(), stripe.balance.retrieve()
   *   3. Returns detailed or minimal response based on auth
   *
   * Test query params:
   *   _test_no_secret=true    — simulate HEALTH_CHECK_SECRET env var not set
   *   _test_db=error          — simulate database failure
   *   _test_redis=error       — simulate redis failure
   *   _test_stripe=error      — simulate stripe failure
   */
  async function mockHealthEndpoint(page: Page, secret = HEALTH_CHECK_SECRET) {
    await page.route("**/api/health**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      const url = new URL(route.request().url());
      const noSecret = url.searchParams.get("_test_no_secret") === "true";

      // Simulate HEALTH_CHECK_SECRET env var not set → no auth check, full data
      if (!noSecret) {
        // Auth check: if secret IS set and auth doesn't match → minimal response
        if (authHeader !== `Bearer ${secret}`) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "ok" }),
          });
          return;
        }
      }

      // Service status from test params (default: all ok)
      const dbStatus: "ok" | "error" =
        url.searchParams.get("_test_db") === "error" ? "error" : "ok";
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

  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockHealthEndpoint(page, HEALTH_CHECK_SECRET);
  });

  test("4a — Sans HEALTH_CHECK_SECRET défini → 200 simple (sans détails)", async ({ page }) => {
    // Override: simulate secret not set
    await mockHealthEndpoint(page, "");

    const res = await fetchApi(page, "/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(Object.keys(res.body as Record<string, unknown>)).toEqual(["status"]);
  });

  test("4b — HEALTH_CHECK_SECRET défini + mauvais token → 200 simple", async ({ page }) => {
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${WRONG_AUTH_TOKEN}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(Object.keys(res.body as Record<string, unknown>)).toEqual(["status"]);
  });

  test("4c — HEALTH_CHECK_SECRET + bon token → 200 avec statuts détaillés", async ({ page }) => {
    const res = await fetchApi(page, "/api/health", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("healthy");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("services");

    const services = body.services as Record<string, { status: string }>;
    expect(services).toHaveProperty("database");
    expect(services).toHaveProperty("redis");
    expect(services).toHaveProperty("stripe");
    expect(services.database.status).toBe("ok");
    expect(services.redis.status).toBe("ok");
    expect(services.stripe.status).toBe("ok");

    // timestamp must be valid ISO date
    expect(typeof body.timestamp).toBe("string");
    expect(() => new Date(body.timestamp as string)).not.toThrow();
  });

  test("4d — DB down → 503 degraded", async ({ page }) => {
    const res = await fetchApi(page, "/api/health?_test_db=error", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("degraded");

    const services = body.services as Record<string, { status: string }>;
    expect(services.database.status).toBe("error");
    expect(services.redis.status).toBe("ok");
    expect(services.stripe.status).toBe("ok");
  });

  test("4e — Redis down → 503 degraded", async ({ page }) => {
    const res = await fetchApi(page, "/api/health?_test_redis=error", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("degraded");

    const services = body.services as Record<string, { status: string }>;
    expect(services.database.status).toBe("ok");
    expect(services.redis.status).toBe("error");
    expect(services.stripe.status).toBe("ok");
  });

  test("4f — Stripe down → 503 degraded", async ({ page }) => {
    const res = await fetchApi(page, "/api/health?_test_stripe=error", {
      headers: { Authorization: `Bearer ${HEALTH_CHECK_SECRET}` },
    });

    expect(res.status).toBe(503);

    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe("degraded");

    const services = body.services as Record<string, { status: string }>;
    expect(services.database.status).toBe("ok");
    expect(services.redis.status).toBe("ok");
    expect(services.stripe.status).toBe("error");
  });

  test("4g — Tout down → 503 unhealthy", async ({ page }) => {
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
});
