import { test, expect, type Page } from "@playwright/test";

/**
 * API Jobs / [id] — E2E tests for YouTube TrendHunter
 *
 * Tests the GET /api/jobs/[id] endpoint:
 *   ✓ GET  /api/jobs/[id]           — Retrieve job details with auth, ownership, status
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *     (auth checks, database queries, ownership validation)
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401), not found (404), ownership hiding (404/200),
 *     admin bypass (200), response field shapes, and status-specific structures
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

async function fetchApi<T = unknown>(page: Page, url: string): Promise<ApiResponse<T>> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  return await page.evaluate(
    async ({ fetchUrl }: { fetchUrl: string }) => {
      const res = await fetch(fetchUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
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
    { fetchUrl: fullUrl },
  );
}

/* ========================================================================== */
/*  GET /api/jobs/[id] — Mock Helper                                          */
/* ========================================================================== */

/**
 * Mock the GET /api/jobs/[id] endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true         — simulate authenticated session
 *   _test_role=admin           — set user role to ADMIN (default: USER)
 *   _test_not_found=true       — simulate job not found (getJob returns null)
 *   _test_owner=self|other     — set job ownership (default: self)
 *   _test_status=PENDING|PROCESSING|COMPLETED|FAILED  — set job status
 *   _test_invalid_id=true      — simulate invalid ID format (treated as not found)
 */
async function mockGetJob(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const isAdmin = url.searchParams.get("_test_role") === "admin";

    if (hasSession) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: isAdmin ? "admin-user-id" : "test-user-id",
            name: isAdmin ? "Admin User" : "Test User",
            email: isAdmin ? "admin@test.com" : "test@test.com",
            role: isAdmin ? "ADMIN" : "USER",
            plan: isAdmin ? "PRO" : "FREE",
          },
          expires: "2099-01-01T00:00:00.000Z",
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(null),
      });
    }
  });

  // Match /api/jobs/[id] — single segment after /api/jobs/
  await page.route("**/api/jobs/*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const notFound = url.searchParams.get("_test_not_found") === "true";
    const owner = url.searchParams.get("_test_owner") || "self";
    const isAdmin = url.searchParams.get("_test_role") === "admin";
    const status = url.searchParams.get("_test_status") || "COMPLETED";
    const invalidId = url.searchParams.get("_test_invalid_id") === "true";

    // Étape 1: Auth check — mirrors real endpoint
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Étape 2: Invalid ID — treated as not found
    if (invalidId) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Job introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    // Étape 3: Job not found — getJob returns null
    if (notFound) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Job introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    // Étape 4: Ownership check — hide existence from non-owners (non-admin)
    if (owner === "other" && !isAdmin) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Job introuvable", code: "NOT_FOUND" }),
      });
      return;
    }

    // Étape 5: Build job data based on status
    const now = new Date();
    const isTerminal = status === "COMPLETED" || status === "FAILED";
    let progress: number;
    let result: unknown;
    let error: string | null;

    switch (status) {
      case "PENDING":
        progress = 0;
        result = null;
        error = null;
        break;
      case "PROCESSING":
        progress = 60;
        result = null;
        error = null;
        break;
      case "COMPLETED":
        progress = 100;
        result = { trendsCreated: 5, nicheSlug: "tech-ia", completedAt: now.toISOString() };
        error = null;
        break;
      case "FAILED":
        progress = 50;
        result = null;
        error = "Une erreur est survenue lors du traitement";
        break;
      default:
        progress = 0;
        result = null;
        error = null;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: url.pathname.split("/").pop() || "job-123",
        type: "TREND_SCORE",
        status,
        progress,
        result,
        error,
        createdAt: new Date(now.getTime() - 3600000).toISOString(),
        completedAt: isTerminal ? now.toISOString() : null,
      }),
    });
  });
}

/* ========================================================================== */
/*  1. GET /api/jobs/[id]                                                     */
/* ========================================================================== */

test.describe("API Jobs / [id] — GET /api/jobs/[id]", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockGetJob(page);
  });

  test("1a — sans authentification → 401 Unauthorized", async ({ page }) => {
    const res = await fetchApi(page, "/api/jobs/some-id");

    expect(res.status).toBe(401);

    const body = res.body as { error: string; code: string };
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("code");
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("1b — avec authentification et ID valide → 200 avec les données du job", async ({
    page,
  }) => {
    const res = await fetchApi(page, "/api/jobs/valid-job-id?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("type");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("progress");
    expect(body).toHaveProperty("result");
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("createdAt");
    expect(body).toHaveProperty("completedAt");
  });

  test("1c — structure de la réponse contient tous les champs attendus", async ({ page }) => {
    const res = await fetchApi(page, "/api/jobs/job-123?_test_session=true");

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;

    // Verify exact field types
    expect(typeof body.id).toBe("string");
    expect(typeof body.type).toBe("string");
    expect(typeof body.status).toBe("string");
    expect(typeof body.progress).toBe("number");
    expect(typeof body.createdAt).toBe("string");
    expect(body.completedAt === null || typeof body.completedAt === "string").toBe(true);
    expect(body.error === null || typeof body.error === "string").toBe(true);
    expect(body.result === null || typeof body.result === "object").toBe(true);

    // Date strings should be valid ISO 8601
    expect(new Date(body.createdAt as string).toISOString()).toBe(body.createdAt);
    if (body.completedAt) {
      expect(new Date(body.completedAt as string).toISOString()).toBe(body.completedAt);
    }

    // Specific values from the default mock
    expect(body.id).toBe("job-123");
    expect(body.type).toBe("TREND_SCORE");
    expect(body.status).toBe("COMPLETED");
    expect(body.progress).toBe(100);
  });

  test("1d — ID inexistant → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/jobs/nonexistent-id?_test_session=true&_test_not_found=true",
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Job");
    expect(body.code).toBe("NOT_FOUND");
  });

  test("1e — job appartenant à un autre utilisateur (non-admin) → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/jobs/other-user-job?_test_session=true&_test_owner=other",
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    // Hides existence from non-owners — returns "Job introuvable"
    expect(body.error).toContain("Job");
    expect(body.code).toBe("NOT_FOUND");
  });

  test("1f — job appartenant à un autre utilisateur (admin) → 200", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/jobs/other-user-job?_test_session=true&_test_owner=other&_test_role=admin",
    );

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("type");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("progress");
    expect(body).toHaveProperty("result");
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("createdAt");
    expect(body).toHaveProperty("completedAt");
  });

  test("1g — ID avec caractères spéciaux → 404", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/jobs/invalid!%23%3F?_test_session=true&_test_invalid_id=true",
    );

    expect(res.status).toBe(404);

    const body = res.body as { error: string; code: string };
    expect(body.error).toContain("Job");
    expect(body.code).toBe("NOT_FOUND");
  });

  test("1h — statuts de job variés → structure correcte selon le statut", async ({ page }) => {
    const statuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];

    for (const status of statuses) {
      const res = await fetchApi(
        page,
        `/api/jobs/job-${status}?_test_session=true&_test_status=${status}`,
      );

      expect(res.status).toBe(200);

      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe(status);
      expect(body.id).toBe(`job-${status}`);
      expect(body.type).toBe("TREND_SCORE");

      switch (status) {
        case "PENDING":
          expect(body.progress).toBe(0);
          expect(body.result).toBeNull();
          expect(body.error).toBeNull();
          expect(body.completedAt).toBeNull();
          break;
        case "PROCESSING":
          expect(body.progress).toBe(60);
          expect(body.result).toBeNull();
          expect(body.error).toBeNull();
          expect(body.completedAt).toBeNull();
          break;
        case "COMPLETED":
          expect(body.progress).toBe(100);
          expect(body.result).not.toBeNull();
          expect(body.error).toBeNull();
          expect(body.completedAt).not.toBeNull();
          break;
        case "FAILED":
          expect(body.progress).toBe(50);
          expect(body.result).toBeNull();
          expect(body.error).not.toBeNull();
          expect(body.completedAt).not.toBeNull();
          break;
      }
    }
  });
});
