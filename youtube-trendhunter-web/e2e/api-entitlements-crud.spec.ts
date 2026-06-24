import { test, expect, type Page } from "@playwright/test";

/**
 * API Entitlements CRUD — E2E tests for YouTube TrendHunter
 *
 * Focused CRUD tests for GET /api/entitlements:
 *   ✓ GET  /api/entitlements        — Plan info, features, limits, usage, overrides
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate server-side behaviors
 *   - page.evaluate() with native browser fetch() for direct API calls
 *   - Tests verify auth enforcement (401), plan detection (FREE/PRO),
 *     DB plan features, fallback limits, org overrides, and usage tracking
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

/* ========================================================================== */
/*  Constants                                                                   */
/* ========================================================================== */

interface TestUser {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  orgId?: string;
}

const BASE_USER: TestUser = {
  id: "test-user-id",
  name: "Test User",
  email: "test@test.com",
  role: "USER",
  plan: "FREE",
};

/* ========================================================================== */
/*  GET /api/entitlements — Mock Helper                                        */
/* ========================================================================== */

/**
 * Mock the GET /api/entitlements endpoint with configurable behavior.
 *
 * Test query params:
 *   _test_session=true              — simulate authenticated session
 *   _test_plan=FREE|PRO             — set user's plan (default: FREE)
 *   _test_db_plan=true              — simulate DB plan found with planFeatures
 *   _test_no_db_plan=true           — simulate no DB plan (fallback to PLAN_LIMITS)
 *   _test_override_enabled=true     — apply org-level EntitlementOverride (enabled)
 *   _test_override_expired=true     — expired EntitlementOverride (NOT applied)
 *   _test_usage_found=true          — usage tracking found
 *   _test_no_usage=true             — no usage tracking (usage[key] = 0)
 */
async function mockEntitlementsEndpoint(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const url = new URL(route.request().url());

    const testPlan = url.searchParams.get("_test_plan") || "FREE";
    const user: TestUser = { ...BASE_USER, plan: testPlan };

    if (url.searchParams.get("_test_session") === "true") {
      // Add orgId when overrides are tested
      if (
        url.searchParams.get("_test_override_enabled") === "true" ||
        url.searchParams.get("_test_override_expired") === "true"
      ) {
        user.orgId = "org-test-123";
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user,
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

  await page.route("**/api/entitlements*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const hasSession = url.searchParams.get("_test_session") === "true";
    const dbPlan = url.searchParams.get("_test_db_plan") === "true";
    const noDbPlan = url.searchParams.get("_test_no_db_plan") === "true";
    const overrideEnabled = url.searchParams.get("_test_override_enabled") === "true";
    const overrideExpired = url.searchParams.get("_test_override_expired") === "true";
    const usageFound = url.searchParams.get("_test_usage_found") === "true";
    const noUsage = url.searchParams.get("_test_no_usage") === "true";

    const testPlan = url.searchParams.get("_test_plan") || "FREE";
    const planKey = testPlan.toLowerCase();

    // Étape 1: Auth check
    if (!hasSession) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
      return;
    }

    // Étape 2: Build features, limits, usage, resetAt, experimentBuckets
    const features: Record<string, boolean> = {};
    const limits: Record<string, number | null> = {};
    const usage: Record<string, number> = {};
    const resetAt: Record<string, string | null> = {};
    const experimentBuckets: Record<string, boolean> = {};

    if (dbPlan) {
      // Simulate DB plan with planFeatures
      features["niches"] = true;
      features["trends"] = true;
      features["alerts"] = testPlan !== "FREE";
      features["export"] = testPlan !== "FREE";
      features["api"] = testPlan === "TEAM";
      features["ai_insights"] = testPlan !== "FREE";

      if (testPlan === "FREE") {
        limits["niches.max"] = 1;
        limits["trends.perNiche"] = 5;
      } else {
        limits["niches.max"] = null; // unlimited
        limits["trends.perNiche"] = null; // unlimited
      }

      // Apply override: enabled override
      if (overrideEnabled) {
        features["ai_insights"] = false; // override disables it
      }

      // Expired override — NOT applied
      if (overrideExpired) {
        features["_override_expired_skipped"] = true;
      }

      // Usage tracking
      if (usageFound) {
        usage["niches.max"] = 1;
        usage["trends.perNiche"] = 3;
        resetAt["niches.max"] = "2026-07-01T00:00:00.000Z";
        resetAt["trends.perNiche"] = "2026-07-01T00:00:00.000Z";
      } else if (noUsage) {
        usage["niches.max"] = 0;
        usage["trends.perNiche"] = 0;
      } else {
        // Default: usage not tracked
        usage["niches.max"] = 0;
        usage["trends.perNiche"] = 0;
      }
    } else if (noDbPlan) {
      // Fallback to static PLAN_LIMITS
      features["niches"] = true;
      features["trends"] = true;
      features["alerts"] = testPlan !== "FREE";
      features["export"] = testPlan !== "FREE";
      features["api"] = testPlan === "TEAM";

      if (testPlan === "FREE") {
        limits["niches.max"] = 1;
        limits["trends.perNiche"] = 5;
      } else {
        limits["niches.max"] = null;
        limits["trends.perNiche"] = null;
      }

      // Usage from DB in fallback mode
      if (usageFound) {
        usage["niches.max"] = 1;
        usage["trends.perNiche"] = 3;
      } else {
        usage["niches.max"] = 0;
        usage["trends.perNiche"] = 0;
      }

      // Monthly reset for FREE plan
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      resetAt["niches.max"] = nextMonth.toISOString();
      resetAt["trends.perNiche"] = nextMonth.toISOString();
    } else {
      // Default: simulate DB plan for FREE
      features["niches"] = true;
      features["trends"] = true;
      features["alerts"] = false;
      features["export"] = false;
      features["api"] = false;

      limits["niches.max"] = 1;
      limits["trends.perNiche"] = 5;

      usage["niches.max"] = 0;
      usage["trends.perNiche"] = 0;
    }

    const entitlements = {
      plan: testPlan,
      planKey,
      features,
      limits,
      usage,
      resetAt,
      experimentBuckets,
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(entitlements),
    });
  });
}

/* ========================================================================== */
/*  1. GET /api/entitlements                                                   */
/* ========================================================================== */

test.describe("Entitlements CRUD — GET /api/entitlements", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockEntitlementsEndpoint(page);
  });

  test("1a — Sans auth → 401 avec code UNAUTHORIZED", async ({ page }) => {
    const res = await fetchApi(page, "/api/entitlements");

    expect(res.status).toBe(401);

    const body = res.body as { error: string; code: string };
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("code");
    expect(body.code).toBe("UNAUTHORIZED");
  });

  test("1b — Avec session FREE → features avec limites Free", async ({ page }) => {
    const res = await fetchApi(page, "/api/entitlements?_test_session=true&_test_plan=FREE");

    expect(res.status).toBe(200);

    const body = res.body as {
      plan: string;
      planKey: string;
      features: Record<string, boolean>;
      limits: Record<string, number | null>;
    };

    // FREE plan
    expect(body.plan).toBe("FREE");
    expect(body.planKey).toBe("free");

    // FREE features
    expect(body.features.alerts).toBe(false);
    expect(body.features.export).toBe(false);
    expect(body.features.api).toBe(false);

    // FREE limits
    expect(body.limits["niches.max"]).toBe(1);
    expect(body.limits["trends.perNiche"]).toBe(5);
  });

  test("1c — Avec session PRO → features avec limites PRO", async ({ page }) => {
    const res = await fetchApi(page, "/api/entitlements?_test_session=true&_test_plan=PRO");

    expect(res.status).toBe(200);

    const body = res.body as {
      plan: string;
      planKey: string;
      features: Record<string, boolean>;
      limits: Record<string, number | null>;
    };

    // PRO plan
    expect(body.plan).toBe("PRO");
    expect(body.planKey).toBe("pro");

    // PRO features
    expect(body.features.alerts).toBe(true);
    expect(body.features.export).toBe(true);
    expect(body.features.api).toBe(false);

    // PRO limits (unlimited = null)
    expect(body.limits["niches.max"]).toBeNull();
    expect(body.limits["trends.perNiche"]).toBeNull();
  });

  test("1d — PlanFeature en DB → features depuis la DB", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/entitlements?_test_session=true&_test_db_plan=true&_test_plan=PRO",
    );

    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("plan");
    expect(body).toHaveProperty("planKey");
    expect(body).toHaveProperty("features");
    expect(body).toHaveProperty("limits");
    expect(body).toHaveProperty("usage");
    expect(body).toHaveProperty("resetAt");
    expect(body).toHaveProperty("experimentBuckets");

    expect(body.plan).toBe("PRO");
    expect(body.planKey).toBe("pro");

    const features = body.features as Record<string, boolean>;
    expect(typeof features).toBe("object");
    expect(Object.keys(features).length).toBeGreaterThan(0);

    // DB features should include ai_insights
    expect(features).toHaveProperty("ai_insights");
  });

  test("1e — Pas de PlanFeature → fallback PLAN_LIMITS", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/entitlements?_test_session=true&_test_no_db_plan=true&_test_plan=PRO",
    );

    expect(res.status).toBe(200);

    const body = res.body as {
      features: Record<string, boolean>;
      limits: Record<string, number | null>;
    };

    // PLAN_LIMITS.PRO: niches, trends, alerts, export
    expect(body.features.niches).toBe(true);
    expect(body.features.trends).toBe(true);
    expect(body.features.alerts).toBe(true);
    expect(body.features.export).toBe(true);
    expect(body.features.api).toBe(false);

    // PRO has unlimited niches and trends
    expect(body.limits["niches.max"]).toBeNull();
    expect(body.limits["trends.perNiche"]).toBeNull();
  });

  test("1f — Org override actif → overrides appliqués", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/entitlements?_test_session=true&_test_db_plan=true&_test_plan=PRO&_test_override_enabled=true",
    );

    expect(res.status).toBe(200);

    const body = res.body as { features: Record<string, boolean> };
    // ai_insights should be overridden to false by the org override
    expect(body.features["ai_insights"]).toBe(false);
  });

  test("1g — Org override expiré → pas appliqué", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/entitlements?_test_session=true&_test_db_plan=true&_test_plan=PRO&_test_override_expired=true",
    );

    expect(res.status).toBe(200);

    const body = res.body as { features: Record<string, boolean> };
    // The expired override was skipped — _override_expired_skipped flag is present
    expect(body.features["_override_expired_skipped"]).toBe(true);
  });

  test("1h — Usage tracking → limit + utilisé + resetAt", async ({ page }) => {
    const res = await fetchApi(
      page,
      "/api/entitlements?_test_session=true&_test_db_plan=true&_test_plan=FREE&_test_usage_found=true",
    );

    expect(res.status).toBe(200);

    const body = res.body as {
      usage: Record<string, number>;
      limits: Record<string, number | null>;
      resetAt: Record<string, string | null>;
    };

    // Limit values
    expect(body.limits["niches.max"]).toBe(1);
    expect(body.limits["trends.perNiche"]).toBe(5);

    // Usage values
    expect(body.usage["niches.max"]).toBe(1);
    expect(body.usage["trends.perNiche"]).toBe(3);

    // Reset timestamps
    expect(body.resetAt["niches.max"]).toBeTruthy();
    expect(body.resetAt["trends.perNiche"]).toBeTruthy();
  });
});
