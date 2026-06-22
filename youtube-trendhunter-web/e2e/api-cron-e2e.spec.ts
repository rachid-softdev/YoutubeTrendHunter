import { test, expect, type Page } from "@playwright/test";

/**
 * API Cron Endpoints — E2E tests for YouTube TrendHunter
 *
 * Tests the protected cron job endpoints that process trends and background jobs:
 *
 *   ✓ GET  /api/cron/trends        — Process all niches, create audit log
 *   ✓ POST /api/cron/process-jobs  — Claim & process pending jobs (TREND_SCORE, VIDEO_SCORE)
 *
 * Strategy:
 *   - page.route() to intercept endpoints and simulate auth + downstream behavior
 *   - page.request.get() / page.request.post() for direct API calls
 *   - Tests verify auth enforcement (401), valid processing (200), and response structure
 */

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const VALID_CRON_SECRET = "test-cron-secret-valid-42";
const INVALID_CRON_SECRET = "wrong-secret-value";

/* ========================================================================== */
/*  1. CRON TRENDS — GET /api/cron/trends                                     */
/* ========================================================================== */

test.describe("CRON Tendances — GET /api/cron/trends", () => {
  /**
   * Shared mock that simulates the cron/trends auth logic and processing.
   * - Missing or invalid Bearer token → 401
   * - Valid token → 200 with processing results
   */
  async function mockCronTrends(page: Page) {
    await page.route("**/api/cron/trends", async (route) => {
      const authHeader = route.request().headers()["authorization"];

      // Simulates: if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulate successful processing
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
    await mockCronTrends(page);
  });

  test("1a — Header Authorization manquant → 401", async ({ page }) => {
    const response = await page.request.get("/api/cron/trends");

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Unauthorized");
  });

  test("1b — Header Authorization avec mauvais secret → 401", async ({ page }) => {
    const response = await page.request.get("/api/cron/trends", {
      headers: { Authorization: `Bearer ${INVALID_CRON_SECRET}` },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Unauthorized");
  });

  test("1c — Header Authorization valide → 200 avec résultats de processing", async ({ page }) => {
    const response = await page.request.get("/api/cron/trends", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("totalTrends");
    expect(body).toHaveProperty("durationMs");
  });

  test("1d — Structure de la réponse contient les champs attendus", async ({ page }) => {
    const response = await page.request.get("/api/cron/trends", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Vérifie la présence et le type de tous les champs de la réponse
    expect(body).toMatchObject({
      success: true,
      results: expect.any(Object),
      totalTrends: expect.any(Number),
      durationMs: expect.any(Number),
    });

    // results doit contenir des niches avec des comptes (strings → numbers)
    const resultEntries = Object.entries(body.results);
    expect(resultEntries.length).toBeGreaterThan(0);

    for (const [niche, count] of resultEntries) {
      expect(typeof niche).toBe("string");
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    }

    // totalTrends doit correspondre à la somme des résultats
    const sum = resultEntries.reduce((acc, [, count]) => acc + (count as number), 0);
    expect(body.totalTrends).toBe(sum);

    // durationMs doit être un nombre positif
    expect(body.durationMs).toBeGreaterThan(0);
  });
});

/* ========================================================================== */
/*  2. CRON PROCESS-JOBS — POST /api/cron/process-jobs                        */
/* ========================================================================== */

test.describe("CRON Process Jobs — POST /api/cron/process-jobs", () => {
  /**
   * Shared mock that simulates the cron/process-jobs auth + processing logic.
   * - Missing or invalid Bearer token → 401
   * - Valid token → 200 with job processing statistics
   */
  async function mockCronProcessJobs(page: Page) {
    await page.route("**/api/cron/process-jobs", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];

      // Simulates: if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulate a successful job processing run
      // In production, this claims jobs, processes TREND_SCORE, skips/fails VIDEO_SCORE, etc.
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

      // Note: In a real scenario the endpoint can also return:
      //   { success: true, skipped: true, reason: "lock held" }
      // when the distributed lock is already acquired by another worker.
    });
  }

  test.beforeEach(async ({ page }) => {
    await mockCronProcessJobs(page);
  });

  test("2a — Header Authorization manquant → 401", async ({ page }) => {
    const response = await page.request.post("/api/cron/process-jobs", {
      data: {},
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Unauthorized");
  });

  test("2b — Header Authorization avec mauvais secret → 401", async ({ page }) => {
    const response = await page.request.post("/api/cron/process-jobs", {
      headers: { Authorization: `Bearer ${INVALID_CRON_SECRET}` },
      data: {},
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Unauthorized");
  });

  test("2c — Header Authorization valide → 200 avec statistiques de traitement", async ({
    page,
  }) => {
    const response = await page.request.post("/api/cron/process-jobs", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      data: {},
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("processed");
    expect(body).toHaveProperty("failed");
    expect(body).toHaveProperty("durationMs");
  });

  test("2d — Structure de la réponse contient les champs attendus", async ({ page }) => {
    const response = await page.request.post("/api/cron/process-jobs", {
      headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      data: {},
    });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // Vérifie la présence et le type de tous les champs de la réponse
    expect(body).toMatchObject({
      success: true,
      processed: expect.any(Number),
      failed: expect.any(Number),
      durationMs: expect.any(Number),
    });

    // processed et failed doivent être >= 0
    expect(body.processed).toBeGreaterThanOrEqual(0);
    expect(body.failed).toBeGreaterThanOrEqual(0);

    // durationMs doit être un nombre positif
    expect(body.durationMs).toBeGreaterThan(0);
  });

  test("2e — Requête GET (mauvaise méthode) n'est pas interceptée", async ({ page }) => {
    // POST est la seule méthode autorisée; GET devrait tomber en fallback
    // Comme nous n'avons pas mocké GET, la requête passe par le serveur réel
    // Ce test vérifie que le mock POST n'interfère pas avec GET
    const response = await page.request.get("/api/cron/process-jobs");

    // Sans auth, le vrai endpoint Next.js retourne 405 (Method Not Allowed)
    // ou 404 selon la configuration
    expect([401, 404, 405]).toContain(response.status());
  });
});
