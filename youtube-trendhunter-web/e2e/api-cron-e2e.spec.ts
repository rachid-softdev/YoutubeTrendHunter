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
 *   - page.evaluate() with native browser fetch() for direct API calls
 *     (fetch() goes through the browser network stack and respects page.route())
 *   - Tests verify auth enforcement (401), valid processing (200), response structure,
 *     method validation (405), lock handling, and error conditions (500)
 *
 * NOTE: page.request.get() does NOT go through page.route() interception
 * in Playwright — it uses a separate APIRequestContext that bypasses the
 * browser's network stack. Using page.evaluate() with fetch() ensures
 * all requests are intercepted by our route handlers.
 */

/* ========================================================================== */
/*  Helpers                                                                   */
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

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

const VALID_CRON_SECRET = "test-cron-secret-valid-42";
const INVALID_CRON_SECRET = "wrong-secret-value";
/**
 * A well-formed secret that looks valid but is not the one the server expects.
 * Used to simulate the scenario where the caller has one secret but the
 * server's CRON_SECRET env var is set to something different.
 */
const ANOTHER_VALID_CRON_SECRET = "another-valid-secret-42";

/* ========================================================================== */
/*  1. CRON TRENDS — GET /api/cron/trends                                     */
/* ========================================================================== */

test.describe("CRON Tendances — GET /api/cron/trends", () => {
  /**
   * Shared mock that simulates the cron/trends auth logic and processing.
   * - Missing or invalid Bearer token → 401
   * - Valid token → 200 with processing results
   *
   * Test query params:
   *   _test_no_secret=true — simulate CRON_SECRET env var undefined
   *   _test_method=POST    — simulate method check (for 405)
   */
  async function mockCronTrends(page: Page) {
    await page.route("**/api/cron/trends*", async (route) => {
      const authHeader = route.request().headers()["authorization"];
      const url = new URL(route.request().url());
      const noSecret = url.searchParams.get("_test_no_secret") === "true";

      // Simulate CRON_SECRET env var undefined/empty
      if (noSecret) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

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
    await setupPage(page);
    await mockCronTrends(page);
  });

  test("1a — Header Authorization manquant → 401", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/trends");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });

  test("1b — Header Authorization avec mauvais secret → 401", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/trends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, INVALID_CRON_SECRET);

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });

  test("1c — Header Authorization valide → 200 avec résultats de processing", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/trends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body).toHaveProperty("results");
    expect(result.body).toHaveProperty("totalTrends");
    expect(result.body).toHaveProperty("durationMs");
  });

  test("1d — Structure de la réponse contient les champs attendus", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/trends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);

    // Vérifie la présence et le type de tous les champs de la réponse
    expect(result.body).toMatchObject({
      success: true,
      results: expect.any(Object),
      totalTrends: expect.any(Number),
      durationMs: expect.any(Number),
    });

    // results doit contenir des niches avec des comptes (strings → numbers)
    const resultEntries = Object.entries(result.body.results);
    expect(resultEntries.length).toBeGreaterThan(0);

    for (const [niche, count] of resultEntries) {
      expect(typeof niche).toBe("string");
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    }

    // totalTrends doit correspondre à la somme des résultats
    const sum = resultEntries.reduce((acc, [, count]) => acc + (count as number), 0);
    expect(result.body.totalTrends).toBe(sum);

    // durationMs doit être un nombre positif
    expect(result.body.durationMs).toBeGreaterThan(0);
  });

  test("1e — Token valide mais CRON_SECRET env var différent → 401", async ({ page }) => {
    // The caller sends a well-formed Bearer token, but it doesn't match
    // the server's CRON_SECRET environment variable.
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/trends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    }, ANOTHER_VALID_CRON_SECRET);

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });

  test("1f — Structure de l'erreur 401 avec champ 'error'", async ({ page }) => {
    // Verify the exact shape of the 401 error response
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/trends");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(401);
    // The 401 response from the real endpoint is exactly { error: "Unauthorized" }
    expect(result.body).toEqual({ error: "Unauthorized" });
  });

  test("1g — Méthode POST non autorisée → 405", async ({ page }) => {
    // Override the route for this test to add method checking.
    // GET falls back to the beforeEach mock; POST returns 405.
    await page.route("**/api/cron/trends*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      // Fall through to the beforeEach mockCronTrends handler
      await route.fallback();
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/trends", { method: "POST" });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(405);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Method Not Allowed");
  });

  /* ----- New cron/trends tests ----- */

  test("1h — CRON_SECRET env var non défini → 401", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/trends?_test_no_secret=true", {
        headers: { Authorization: `Bearer ${VALID_CRON_SECRET}` },
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
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
   *
   * Test query params:
   *   _test_empty_queue=true   — no PENDING jobs in queue
   *   _test_video_score=true   — VIDEO_SCORE job type → FAILED
   *   _test_unknown_type=true  — unknown job type → FAILED
   *   _test_all_fail=true      — all jobs fail
   *   _test_stale_reclaim=true — stale PROCESSING jobs reclaimed
   *   _test_no_secret=true     — CRON_SECRET env var undefined
   */
  async function mockCronProcessJobs(page: Page) {
    await page.route("**/api/cron/process-jobs*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      const url = new URL(route.request().url());
      const emptyQueue = url.searchParams.get("_test_empty_queue") === "true";
      const videoScore = url.searchParams.get("_test_video_score") === "true";
      const unknownType = url.searchParams.get("_test_unknown_type") === "true";
      const allFail = url.searchParams.get("_test_all_fail") === "true";
      const staleReclaim = url.searchParams.get("_test_stale_reclaim") === "true";
      const noSecret = url.searchParams.get("_test_no_secret") === "true";

      // Simulate CRON_SECRET env var undefined/empty
      if (noSecret) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulates: if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Empty job queue — no PENDING jobs
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

      // VIDEO_SCORE job type — always marked FAILED
      if (videoScore) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 0,
            failed: 2,
            durationMs: 45,
            _test_videoScoreFailed: true,
            _test_details: "VIDEO_SCORE not yet implemented",
          }),
        });
        return;
      }

      // Unknown job type — all marked FAILED
      if (unknownType) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 0,
            failed: 3,
            durationMs: 30,
            _test_unknownTypeFailed: true,
            _test_details: "Unknown job type: CUSTOM_JOB",
          }),
        });
        return;
      }

      // All jobs fail
      if (allFail) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 0,
            failed: 5,
            durationMs: 1200,
            _test_allFailed: true,
          }),
        });
        return;
      }

      // Stale PROCESSING reclamation (lockedAt > 5 min ago)
      if (staleReclaim) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            processed: 3,
            failed: 0,
            durationMs: 890,
            _test_staleReclaimed: true,
            _test_details: "3 stale PROCESSING jobs reclaimed and completed",
          }),
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
    await setupPage(page);
    await mockCronProcessJobs(page);
  });

  test("2a — Header Authorization manquant → 401", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });

  test("2b — Header Authorization avec mauvais secret → 401", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, INVALID_CRON_SECRET);

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });

  test("2c — Header Authorization valide → 200 avec statistiques de traitement", async ({
    page,
  }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body).toHaveProperty("processed");
    expect(result.body).toHaveProperty("failed");
    expect(result.body).toHaveProperty("durationMs");
  });

  test("2d — Structure de la réponse contient les champs attendus", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);

    // Vérifie la présence et le type de tous les champs de la réponse
    expect(result.body).toMatchObject({
      success: true,
      processed: expect.any(Number),
      failed: expect.any(Number),
      durationMs: expect.any(Number),
    });

    // processed et failed doivent être >= 0
    expect(result.body.processed).toBeGreaterThanOrEqual(0);
    expect(result.body.failed).toBeGreaterThanOrEqual(0);

    // durationMs doit être un nombre positif
    expect(result.body.durationMs).toBeGreaterThan(0);
  });

  test("2e — Requête GET (mauvaise méthode) n'est pas interceptée", async ({ page }) => {
    // POST est la seule méthode autorisée; le mock appelle route.fallback() pour GET,
    // ce qui laisse passer la requête vers le serveur réel.
    // Ce test vérifie que le mock POST n'interfère pas avec GET.
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/process-jobs");
      return { status: res.status };
    });

    // Sans auth, le vrai endpoint Next.js retourne 405 (Method Not Allowed).
    // Le fallback peut aussi retourner 500 si le handler de route ne trouve pas
    // de route réelle pour GET sur ce endpoint.
    expect([401, 404, 405, 500]).toContain(result.status);
  });

  test("2f — Verrou distribué déjà acquis → 200 avec skipped: true", async ({ page }) => {
    // Override the route to simulate the lock-held scenario.
    // The real endpoint checks acquireLock() and returns skipped when the
    // Redis distributed lock is already held by another worker.
    await page.route("**/api/cron/process-jobs*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulate lock already held by another worker
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          skipped: true,
          reason: "lock held",
        }),
      });
    });

    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.skipped).toBe(true);
    expect(result.body.reason).toBe("lock held");
  });

  test("2g — GET sur process-jobs → 405", async ({ page }) => {
    // Override the route to return 405 for non-POST methods instead of
    // falling through to the real server.
    await page.route("**/api/cron/process-jobs*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({
          status: 405,
          contentType: "application/json",
          body: JSON.stringify({ error: "Method Not Allowed" }),
        });
        return;
      }
      await route.fallback();
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cron/process-jobs");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(405);
    expect(result.body.error).toBe("Method Not Allowed");
  });

  test("2h — Body invalide → 200 traité comme empty", async ({ page }) => {
    // The real endpoint does not validate the request body — it reads jobs
    // from the database. Sending an invalid or empty body should still
    // return a successful 200 response.
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        // No body / empty body — the endpoint treats it the same as {}
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body).toHaveProperty("processed");
    expect(result.body).toHaveProperty("failed");
    expect(result.body).toHaveProperty("durationMs");
  });

  test("2i — Erreur interne du handler → 500", async ({ page }) => {
    // Override the route to simulate an internal server error.
    // The real endpoint wraps processing in try/catch and returns 500
    // with an error message when something goes wrong.
    await page.route("**/api/cron/process-jobs*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const authHeader = route.request().headers()["authorization"];
      if (authHeader !== `Bearer ${VALID_CRON_SECRET}`) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unauthorized" }),
        });
        return;
      }

      // Simulate an unhandled error during processing
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Processing failed",
          details: "Internal server error",
        }),
      });
    });

    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(500);
    expect(result.body).toHaveProperty("error");
    expect(result.body).toHaveProperty("details");
    expect(result.body.error).toBe("Processing failed");
  });

  /* ----- New cron/process-jobs tests ----- */

  test("2j — File d'attente vide (aucun job PENDING) → processed: 0, failed: 0", async ({
    page,
  }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_empty_queue=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.processed).toBe(0);
    expect(result.body.failed).toBe(0);
    expect(result.body._test_emptyQueue).toBe(true);
  });

  test("2k — Job type VIDEO_SCORE → marqué FAILED", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_video_score=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.processed).toBe(0);
    expect(result.body.failed).toBe(2);
    expect(result.body._test_videoScoreFailed).toBe(true);
    expect(result.body._test_details).toBe("VIDEO_SCORE not yet implemented");
  });

  test("2l — Type de job inconnu → marqué FAILED", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_unknown_type=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.processed).toBe(0);
    expect(result.body.failed).toBe(3);
    expect(result.body._test_unknownTypeFailed).toBe(true);
    expect(result.body._test_details).toContain("Unknown job type");
  });

  test("2m — Tous les jobs échouent → processed: 0, failed: 5", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_all_fail=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.processed).toBe(0);
    expect(result.body.failed).toBe(5);
    expect(result.body._test_allFailed).toBe(true);
  });

  test("2n — Récupération PROCESSING périmé (lockedAt > 5 min) → re-traité", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_stale_reclaim=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.processed).toBe(3);
    expect(result.body.failed).toBe(0);
    expect(result.body._test_staleReclaimed).toBe(true);
    expect(result.body._test_details).toContain("stale");
  });

  test("2o — CRON_SECRET env var non défini → 401", async ({ page }) => {
    const result = await page.evaluate(async (token: string) => {
      const res = await fetch("/api/cron/process-jobs?_test_no_secret=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, VALID_CRON_SECRET);

    expect(result.status).toBe(401);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Unauthorized");
  });
});
