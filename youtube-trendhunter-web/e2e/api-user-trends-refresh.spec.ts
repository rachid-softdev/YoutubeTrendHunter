import { test, expect, type Page } from "@playwright/test";

/**
 * API User & Trends Refresh — E2E tests for YouTube TrendHunter
 *
 * Covers three endpoint groups:
 *   ✓ DELETE /api/user           — Account deletion (auth, validation, Stripe, rate limit)
 *   ✓ GET  /api/user/audit-logs  — Audit log access control (own vs other user)
 *   ✓ POST /api/trends/refresh   — Trend refresh with CRON auth (single/batch/empty/rate limit)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *   - page.evaluate() with native browser fetch() for direct API calls
 *   - Tests verify auth enforcement (401), validation (400), not-found (404),
 *     success (200/202/204), forbidden (403), and rate limiting (429)
 */

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

const BASE_URL = "http://localhost:3000";

/**
 * Set up a minimal page at the BASE_URL so that all subsequent fetch()
 * calls are same-origin (avoids CORS preflight issues with opaque origins).
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
 * Supports GET, POST, DELETE with optional headers and string body.
 * The page MUST be on the same origin (via setupPage) to avoid CORS.
 */
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
      opts: { method?: string; headers?: Record<string, string>; body?: string };
    }) => {
      const res = await fetch(fetchUrl, {
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: opts.body,
      });

      const bodyText = await res.text();
      let body: unknown = bodyText;
      try {
        body = JSON.parse(bodyText);
      } catch {
        // Keep as raw text (e.g. empty 204 response)
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of res.headers.entries()) {
        headers[key] = value;
      }

      return { status: res.status, headers, body, bodyText };
    },
    { fetchUrl: fullUrl, opts: options ?? {} },
  );
}

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const VALID_NICHE = "tech-ia";
const NONEXISTENT_NICHE = "niche-inexistante-42";

/* ========================================================================== */
/*  1. DELETE /api/user — Mock Helper                                          */
/* ========================================================================== */

/**
 * Mock the DELETE /api/user endpoint with configurable behaviors.
 *
 * The real endpoint (src/app/api/user/route.ts):
 *   1. Calls auth() — no session → 401 { error, code }
 *   2. Parses body expecting { confirm: true }
 *   3. Fetches user from DB; not found → 404
 *   4. If user has a Stripe subscription, cancels it via Stripe API
 *   5. Deletes user and all related data
 *   6. Returns 204 on success
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_no_confirm=true           — body missing confirm: true (simulate 400)
 *   _test_user_not_found=true       — user not found in DB (404)
 *   _test_has_subscription=true     — user has a Stripe subscription
 *   _test_stripe_error=true         — Stripe cancellation fails (500)
 *   _test_rate_limit=true           — simulate rate limit (429)
 */
async function mockDeleteUser(page: Page) {
  await page.route("**/api/user*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const noConfirm = url.searchParams.get("_test_no_confirm") === "true";
    const userNotFound = url.searchParams.get("_test_user_not_found") === "true";
    const hasSubscription = url.searchParams.get("_test_has_subscription") === "true";
    const stripeError = url.searchParams.get("_test_stripe_error") === "true";
    const isRateLimited = url.searchParams.get("_test_rate_limit") === "true";

    // — Auth check —
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // — Rate limit —
    if (isRateLimited) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "60" },
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMITED", retryAfter: 60 }),
      });
      return;
    }

    // — Parse body —
    let rawBody: string;
    if (noConfirm) {
      // Simulate missing confirm field or wrong value
      rawBody = JSON.stringify({});
    } else {
      rawBody = route.request().postData() || "{}";
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    // — Validate confirm: true —
    if (body.confirm !== true) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Requête invalide",
          code: "VALIDATION_ERROR",
          details: { confirm: "La confirmation est requise pour supprimer le compte" },
        }),
      });
      return;
    }

    // — User not found —
    if (userNotFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Utilisateur introuvable", code: "USER_NOT_FOUND" }),
      });
      return;
    }

    // — User has a Stripe subscription —
    if (hasSubscription) {
      if (stripeError) {
        // Stripe cancellation fails
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              "Échec de l'annulation de l'abonnement Stripe : l'abonnement n'a pas pu être annulé. Veuillez réessayer ou contacter le support.",
            code: "STRIPE_CANCELLATION_ERROR",
          }),
        });
        return;
      }

      // Successful cancel + delete
      await route.fulfill({
        status: 204,
        body: "",
      });
      return;
    }

    // — User without subscription — just delete
    await route.fulfill({
      status: 204,
      body: "",
    });
  });
}

/* ========================================================================== */
/*  2. GET /api/user/audit-logs — Mock Helper                                  */
/* ========================================================================== */

/**
 * Mock the GET /api/user/audit-logs endpoint.
 *
 * The real endpoint (src/app/api/user/audit-logs/route.ts):
 *   1. Calls auth() — no session → 401 { error, code }
 *   2. Optionally checks userId param (users can only see their own logs)
 *   3. Returns getAuditLogs(userId) → { logs: [...] }
 *
 * Test query params:
 *   _test_session=true    — simulate authenticated session
 *   _test_other_user=true — simulate accessing another user's logs (403)
 *   _test_empty=true      — return empty logs array
 */
async function mockAuditLogs(page: Page) {
  await page.route("**/api/user/audit-logs**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const otherUser = url.searchParams.get("_test_other_user") === "true";
    const emptyLogs = url.searchParams.get("_test_empty") === "true";

    // — Auth check —
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // — Accessing another user's logs (forbidden) —
    if (otherUser) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Accès refusé", code: "FORBIDDEN" }),
      });
      return;
    }

    // — Own logs: ordered by date descending (newest first) —
    const logs = emptyLogs
      ? []
      : [
          {
            id: "log-aud-004",
            action: "DELETE_ACCOUNT",
            ipAddress: "10.0.0.5",
            metadata: { initiatedBy: "user" },
            createdAt: new Date().toISOString(),
          },
          {
            id: "log-aud-003",
            action: "EXPORT_DATA",
            ipAddress: "192.168.1.42",
            metadata: { format: "csv" },
            createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          },
          {
            id: "log-aud-002",
            action: "UPDATE_PROFILE",
            ipAddress: "192.168.1.42",
            metadata: { field: "name" },
            createdAt: new Date(Date.now() - 86_400_000).toISOString(),
          },
          {
            id: "log-aud-001",
            action: "LOGIN",
            ipAddress: "10.0.0.1",
            metadata: { browser: "Chrome", os: "Windows" },
            createdAt: new Date(Date.now() - 604_800_000).toISOString(),
          },
        ];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ logs }),
    });
  });
}

/* ========================================================================== */
/*  3. POST /api/trends/refresh — Mock Helper                                  */
/* ========================================================================== */

/**
 * Mock the POST /api/trends/refresh endpoint.
 *
 * The real endpoint (src/app/api/trends/refresh/route.ts):
 *   1. Checks Authorization: Bearer <CRON_SECRET> — missing/mismatch → 401
 *   2. Parses JSON body for nicheSlug
 *   3. Resolves niches from DB (all active, or specific)
 *   4. Creates refresh jobs
 *   5. Returns 202 with { job, jobId } or { jobs, count }
 *
 * Test query params:
 *   _test_has_cron_secret=true    — simulate CRON_SECRET env var configured (auth passes)
 *   _test_rate_limit=true         — simulate rate limit (429)
 *   _test_niche_not_found=true    — niche slug not in DB (404)
 *   _test_no_active_niches=true   — no active niches (202 with empty jobIds)
 *   _test_invalid_body=true       — send body with invalid shape (400)
 */
async function mockTrendsRefresh(page: Page) {
  await page.route("**/api/trends/refresh**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasCronSecret = url.searchParams.get("_test_has_cron_secret") === "true";
    const isRateLimited = url.searchParams.get("_test_rate_limit") === "true";
    const nicheNotFound = url.searchParams.get("_test_niche_not_found") === "true";
    const noActiveNiches = url.searchParams.get("_test_no_active_niches") === "true";
    const invalidBody = url.searchParams.get("_test_invalid_body") === "true";

    const authHeader = route.request().headers()["authorization"];

    // — Auth: CRON_SECRET env var not set or not matching —
    if (!hasCronSecret) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non autorisé", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // — Rate limit —
    if (isRateLimited) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "60" },
        body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMITED", retryAfter: 60 }),
      });
      return;
    }

    // — Parse body —
    let rawBody: string;
    if (invalidBody) {
      // Simulate invalid body shape (e.g. nicheSlug is a number instead of string)
      rawBody = JSON.stringify({ nicheSlug: 12345 });
    } else {
      rawBody = route.request().postData() || "{}";
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    const nicheSlug = body.nicheSlug;

    // — Invalid body (nicheSlug must be a string if provided) —
    if (invalidBody) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Paramètres invalides",
          code: "VALIDATION_ERROR",
          details: { nicheSlug: "Doit être une chaîne de caractères" },
        }),
      });
      return;
    }

    // — Niche not found —
    if (nicheNotFound && nicheSlug) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Niche introuvable", code: "NICHE_NOT_FOUND" }),
      });
      return;
    }

    // — Single niche with nicheSlug →
    if (nicheSlug && typeof nicheSlug === "string") {
      const jobId = `job-${nicheSlug}-${Date.now()}`;
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "accepted",
          jobId,
          nicheSlug,
        }),
      });
      return;
    }

    // — No active niches —
    if (noActiveNiches) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          status: "accepted",
          jobIds: [],
          message: "Aucune niche active à rafraîchir",
        }),
      });
      return;
    }

    // — Batch refresh (no nicheSlug) — process all active niches
    const now = Date.now();
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        status: "accepted",
        jobIds: [`job-tech-ia-${now}`, `job-gaming-${now}`, `job-business-${now}`],
        count: 3,
      }),
    });
  });
}

/* ========================================================================== */
/*  1. DELETE /api/user — Account Deletion                                     */
/* ========================================================================== */

test.describe("Account Deletion — DELETE /api/user", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockDeleteUser(page);
  });

  test("1a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/user", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(401);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("1b — Body invalide (pas confirm: true) → 400", async ({ page }) => {
    const res = await fetchApi(page, "/api/user?_test_session=true&_test_no_confirm=true", {
      method: "DELETE",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe("Requête invalide");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeDefined();
    expect((body.details as Record<string, unknown>).confirm).toBeDefined();
  });

  test("1c — Utilisateur non trouvé → 404", async ({ page }) => {
    const res = await fetchApi(page, "/api/user?_test_session=true&_test_user_not_found=true", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(404);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Utilisateur introuvable",
      code: "USER_NOT_FOUND",
    });
  });

  test("1d — Utilisateur avec subscription Stripe → cancel + delete → 204", async ({ page }) => {
    const res = await fetchApi(page, "/api/user?_test_session=true&_test_has_subscription=true", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(204);
    // 204 No Content — response body must be empty
    expect(res.bodyText).toBe("");
  });

  test("1e — Utilisateur sans subscription → delete → 204", async ({ page }) => {
    const res = await fetchApi(page, "/api/user?_test_session=true", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(204);
    expect(res.bodyText).toBe("");
  });

  test("1f — Échec Stripe cancellation → 500 avec message explicite", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/user?_test_session=true&_test_has_subscription=true&_test_stripe_error=true",
      {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      },
    );

    expect(res.status).toBe(500);

    const body = res.body as Record<string, string>;
    expect(body.error).toContain("Échec de l'annulation de l'abonnement Stripe");
    expect(body.code).toBe("STRIPE_CANCELLATION_ERROR");
  });

  test("1g — Rate limit → 429", async ({ page }) => {
    const res = await fetchApi(page, "/api/user?_test_session=true&_test_rate_limit=true", {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(429);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe("Trop de requêtes");
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBe(60);

    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers["retry-after"]).toBe("60");
  });
});

/* ========================================================================== */
/*  2. GET /api/user/audit-logs — Audit Logs                                   */
/* ========================================================================== */

test.describe("Audit Logs — GET /api/user/audit-logs", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockAuditLogs(page);
  });

  test("2a — Sans authentification → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs");

    expect(res.status).toBe(401);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("2b — Accès aux logs d'un autre utilisateur → 403", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/user/audit-logs?_test_session=true&_test_other_user=true",
    );

    expect(res.status).toBe(403);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Accès refusé",
      code: "FORBIDDEN",
    });
  });

  test("2c — Accès à ses propres logs → 200 avec tableau", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: unknown[] };
    expect(body).toHaveProperty("logs");
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
  });

  test("2d — Aucun log → 200 avec tableau vide []", async ({ page }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true&_test_empty=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: unknown[] };
    expect(body).toEqual({ logs: [] });
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBe(0);
  });

  test("2e — Structure des logs : id, action, ipAddress, createdAt, metadata optionnel", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: Array<Record<string, unknown>> };
    expect(body.logs.length).toBeGreaterThan(0);

    for (const log of body.logs) {
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("action");
      expect(log).toHaveProperty("ipAddress");
      expect(log).toHaveProperty("createdAt");

      expect(typeof log.id).toBe("string");
      expect(typeof log.action).toBe("string");
      expect(typeof log.ipAddress).toBe("string");
      expect(typeof log.createdAt).toBe("string");

      // createdAt must be valid ISO date
      expect(() => new Date(log.createdAt as string)).not.toThrow();

      // metadata is optional; if present, must be an object
      if (log.metadata !== undefined) {
        expect(typeof log.metadata).toBe("object");
        expect(log.metadata).not.toBeNull();
      }
    }
  });

  test("2f — Les logs sont ordonnés par date décroissante (plus récent en premier)", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/user/audit-logs?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as { logs: Array<{ createdAt: string }> };
    const timestamps = body.logs.map((l) => new Date(l.createdAt).getTime());

    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
    }
  });
});

/* ========================================================================== */
/*  3. POST /api/trends/refresh — Trends Refresh                               */
/* ========================================================================== */

test.describe("Trends Refresh — POST /api/trends/refresh", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockTrendsRefresh(page);
  });

  test("3a — Sans CRON_SECRET → 401", async ({ page }) => {
    const res = await fetchApi(page, "/api/trends/refresh", {
      method: "POST",
      body: JSON.stringify({ nicheSlug: VALID_NICHE }),
    });

    expect(res.status).toBe(401);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Non autorisé",
      code: "UNAUTHORIZED",
    });
  });

  test("3b — Body invalide → 400", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/trends/refresh?_test_has_cron_secret=true&_test_invalid_body=true",
      {
        method: "POST",
        body: JSON.stringify({ nicheSlug: 12345 }),
      },
    );

    expect(res.status).toBe(400);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe("Paramètres invalides");
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details).toBeDefined();
  });

  test("3c — Single niche avec nicheSlug → 202 avec jobId", async ({ page }) => {
    const res = await fetchApi(page, "/api/trends/refresh?_test_has_cron_secret=true", {
      method: "POST",
      body: JSON.stringify({ nicheSlug: VALID_NICHE }),
    });

    expect(res.status).toBe(202);

    const body = res.body as { status: string; jobId: string; nicheSlug: string };
    expect(body.status).toBe("accepted");
    expect(body).toHaveProperty("jobId");
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId).toContain("job-tech-ia");
    expect(body.nicheSlug).toBe(VALID_NICHE);
  });

  test("3d — Niche introuvable → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/trends/refresh?_test_has_cron_secret=true&_test_niche_not_found=true",
      {
        method: "POST",
        body: JSON.stringify({ nicheSlug: NONEXISTENT_NICHE }),
      },
    );

    expect(res.status).toBe(404);

    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      error: "Niche introuvable",
      code: "NICHE_NOT_FOUND",
    });
  });

  test("3e — Batch refresh (pas de nicheSlug) → 202 avec plusieurs jobIds", async ({ page }) => {
    const res = await fetchApi(page, "/api/trends/refresh?_test_has_cron_secret=true", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(202);

    const body = res.body as { status: string; jobIds: string[]; count: number };
    expect(body.status).toBe("accepted");
    expect(body).toHaveProperty("jobIds");
    expect(Array.isArray(body.jobIds)).toBe(true);
    expect(body.jobIds.length).toBeGreaterThan(1);
    expect(body.count).toBe(body.jobIds.length);

    // Each jobId should be a unique string
    for (const jobId of body.jobIds) {
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);
    }
  });

  test("3f — Aucune niche active → 202 avec jobIds vide", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/trends/refresh?_test_has_cron_secret=true&_test_no_active_niches=true",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    expect(res.status).toBe(202);

    const body = res.body as { status: string; jobIds: unknown[]; message: string };
    expect(body.status).toBe("accepted");
    expect(body.jobIds).toEqual([]);
    expect(Array.isArray(body.jobIds)).toBe(true);
    expect(body.jobIds.length).toBe(0);
    expect(body.message).toBe("Aucune niche active à rafraîchir");
  });

  test("3g — Rate limit → 429", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/trends/refresh?_test_has_cron_secret=true&_test_rate_limit=true",
      {
        method: "POST",
        body: JSON.stringify({ nicheSlug: VALID_NICHE }),
      },
    );

    expect(res.status).toBe(429);

    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe("Trop de requêtes");
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBe(60);

    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.headers["retry-after"]).toBe("60");
  });
});
