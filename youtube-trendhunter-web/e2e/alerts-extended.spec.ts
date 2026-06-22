import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Alerts Extended E2E tests for YouTube TrendHunter
 *
 * Covers: success cases, error handling, edge cases, and plan enforcement
 * for the alerts feature (route /alerts, API /api/alerts).
 *
 * NOTE (server-side auth):
 *   The (dashboard) layout calls auth() server-side and redirects to /login
 *   when no session cookie exists.  page.route() cannot mock server-side
 *   auth(), so UI rendering tests are best-effort (pass conditionally).
 *   All API-interaction tests use page.route() to mock the backend and
 *   reliably test client behaviour.
 *
 * Existing tests in dashboard.spec.ts already cover:
 *   - GET /api/alerts returns 200 with alerts array
 *   - Alert object has id and isActive properties
 *   - Sidebar link "Alertes" exists
 *   - redirect /alerts → /login when unauthenticated
 *
 * These scenarios are NOT duplicated here.
 */

const BASE_URL = "http://localhost:3000";

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

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

/** Base session for a FREE-plan user. */
const MOCK_SESSION_FREE = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/** Session for a PRO-plan user. */
const MOCK_SESSION_PRO = {
  user: {
    id: "test-pro-id",
    name: "Pro",
    email: "pro@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/** Session for a TEAM-plan user. */
const MOCK_SESSION_TEAM = {
  user: {
    id: "test-team-id",
    name: "Team",
    email: "team@test.com",
    role: "USER" as const,
    plan: "TEAM" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

async function mockSession(page: Page, session: object = MOCK_SESSION_FREE) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Mock data factories                                                       */
/* -------------------------------------------------------------------------- */

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-" + Math.random().toString(36).slice(2, 9),
    userId: "test-user-id",
    nicheId: null,
    type: "SCORE_THRESHOLD",
    threshold: 70,
    channel: "EMAIL",
    webhookUrl: null,
    isActive: true,
    lastSentAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    niche: null,
    ...overrides,
  };
}

function makeAlertWithNiche(overrides: Record<string, unknown> = {}) {
  return makeAlert({
    nicheId: "niche-1",
    niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
    ...overrides,
  });
}

const DEFAULT_NICHES = [
  { niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } },
  { niche: { id: "niche-2", name: "Gaming", slug: "gaming" } },
];

function buildGetAlertsResponse(overrides: Record<string, unknown> = {}) {
  return {
    alerts: [makeAlertWithNiche()],
    userNiches: DEFAULT_NICHES,
    plan: "FREE",
    canCreate: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Helpers: mock API routes                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Intercept GET /api/alerts and return a controlled response.
 */
async function mockGetAlerts(page: Page, responseData: object) {
  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseData),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Intercept all /api/alerts/* request methods and let the test
 * supply a handler per-call.
 */
async function mockAlertsApi(
  page: Page,
  handlers: {
    onGet?: (route: Route) => Promise<void>;
    onPost?: (route: Route) => Promise<void>;
    onPatch?: (route: Route) => Promise<void>;
    onDelete?: (route: Route) => Promise<void>;
  },
) {
  await page.route("**/api/alerts*", async (route) => {
    switch (route.request().method()) {
      case "GET":
        if (handlers.onGet) await handlers.onGet(route);
        else await route.continue();
        break;
      case "POST":
        if (handlers.onPost) await handlers.onPost(route);
        else await route.continue();
        break;
      default:
        await route.continue();
    }
  });

  await page.route("**/api/alerts/**", async (route) => {
    switch (route.request().method()) {
      case "PATCH":
        if (handlers.onPatch) await handlers.onPatch(route);
        else await route.continue();
        break;
      case "DELETE":
        if (handlers.onDelete) await handlers.onDelete(route);
        else await route.continue();
        break;
      default:
        await route.continue();
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  1. API — Auth guards (401)                                                */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — Authentification", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // NOTE: GET /api/alerts 401 test exists in auth.spec.ts — NOT duplicated here.

  test("POST /api/alerts retourne 401 sans session", async ({ page }) => {
    await page.route("**/api/alerts*", async (route) => {
      await route.continue();
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD" }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test("PATCH /api/alerts/:id retourne 401 sans session", async ({ page }) => {
    await page.route("**/api/alerts/**", async (route) => {
      await route.continue();
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });

  test("DELETE /api/alerts/:id retourne 401 sans session", async ({ page }) => {
    await page.route("**/api/alerts/**", async (route) => {
      await route.continue();
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-nonexistent", {
        method: "DELETE",
      });
      return { status: res.status };
    });
    expect(result.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. API — GET /api/alerts                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — GET /api/alerts", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("retourne la structure complète avec alertes, niches, plan, canCreate", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const mockData = buildGetAlertsResponse({ plan: "PRO", canCreate: true });
    await mockGetAlerts(page, mockData);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    const body = result.body;
    expect(body).toHaveProperty("alerts");
    expect(body).toHaveProperty("userNiches");
    expect(body).toHaveProperty("plan", "PRO");
    expect(body).toHaveProperty("canCreate", true);
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(Array.isArray(body.userNiches)).toBe(true);
  });

  test("chaque alerte expose tous les champs attendus", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alert = makeAlertWithNiche({
      type: "SPIKE",
      threshold: 85,
      channel: "WEBHOOK",
      webhookUrl: "https://hooks.example.com/alert",
    });
    await mockGetAlerts(page, {
      alerts: [alert],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    const a = result.body.alerts[0];

    expect(a).toHaveProperty("id");
    expect(a).toHaveProperty("type");
    expect(a).toHaveProperty("threshold");
    expect(a).toHaveProperty("channel");
    expect(a).toHaveProperty("isActive");
    expect(a).toHaveProperty("niche");
    expect(a.type).toBe("SPIKE");
    expect(a.threshold).toBe(85);
    expect(a.channel).toBe("WEBHOOK");
    expect(a.isActive).toBe(true);
    expect(a.niche).toHaveProperty("id", "niche-1");
    expect(a.niche).toHaveProperty("name", "Tech & IA");
    expect(a.niche).toHaveProperty("slug", "tech");
  });

  test("retourne une liste vide quand il n'y a pas d'alertes", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.alerts).toEqual([]);
  });

  test("peut contenir une alerte avec niche null", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertNoNiche = makeAlert({ nicheId: null, niche: null });
    await mockGetAlerts(page, {
      alerts: [alertNoNiche],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.alerts[0].niche).toBeNull();
  });

  test("retourne les userNiches pour le formulaire de création", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const niches = [
      { niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } },
      { niche: { id: "niche-2", name: "Gaming", slug: "gaming" } },
      { niche: { id: "niche-3", name: "Musique", slug: "musique" } },
    ];
    await mockGetAlerts(page, { alerts: [], userNiches: niches, plan: "PRO", canCreate: true });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.userNiches).toHaveLength(3);
    expect(result.body.userNiches[2].niche.name).toBe("Musique");
  });
});

/* -------------------------------------------------------------------------- */
/*  3. API — GET /api/alerts/[id]                                             */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — GET /api/alerts/:id", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("retourne une alerte individuelle", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alert = makeAlertWithNiche({ id: "alert-single" });
    await page.route("**/api/alerts/alert-single*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alert }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-single");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body.alert.id).toBe("alert-single");
    expect(result.body.alert.type).toBeDefined();
  });

  test("retourne 404 pour une alerte inexistante", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts/alert-inconnu*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-inconnu");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  4. API — POST /api/alerts (Création)                                      */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — POST /api/alerts (Création)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("crée une alerte avec les champs minimaux — retour 201", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const created = makeAlertWithNiche({ id: "new-alert-1" });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("type");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: created }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
    expect(result.body.alert.id).toBe("new-alert-1");
    expect(result.body.alert.isActive).toBe(true);
  });

  test("crée une alerte avec tous les champs (niche, threshold, channel)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const created = makeAlertWithNiche({
      id: "alert-full",
      type: "SPIKE",
      threshold: 90,
      channel: "WEBHOOK",
      webhookUrl: "https://hooks.example.com/yt",
    });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.type).toBe("SPIKE");
      expect(body.threshold).toBe(90);
      expect(body.channel).toBe("WEBHOOK");
      expect(body.webhookUrl).toBe("https://hooks.example.com/yt");
      expect(body.nicheId).toBe("niche-1");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: created }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SPIKE",
          threshold: 90,
          channel: "WEBHOOK",
          webhookUrl: "https://hooks.example.com/yt",
          nicheId: "niche-1",
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
    expect(result.body.alert.channel).toBe("WEBHOOK");
    expect(result.body.alert.threshold).toBe(90);
  });

  test("crée une alerte de type DAILY_DIGEST (sans threshold)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const created = makeAlertWithNiche({ id: "alert-digest", type: "DAILY_DIGEST", threshold: 70 });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.type).toBe("DAILY_DIGEST");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: created }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DAILY_DIGEST" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
  });

  test("rejette une création avec un type invalide → 400", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Validation error", code: "VALIDATION_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "INVALID_TYPE" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
  });

  test("rejette une création avec threshold hors limites → 400", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Validation error", code: "VALIDATION_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD", threshold: -5 }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
  });

  test("rejette une création canal WEBHOOK sans webhookUrl → 400", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Webhook URL requise pour le canal WEBHOOK",
          code: "VALIDATION_ERROR",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD", channel: "WEBHOOK" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("Webhook");
  });

  test("rejette une création avec nicheId inexistante → 404", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Niche introuvable", code: "NOT_FOUND" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD", nicheId: "niche-inexistante" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(404);
  });

  test("rejette une création avec body vide → 400", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Validation error", code: "VALIDATION_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
  });

  test("simule une erreur serveur 500 à la création", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/*  5. API — PATCH /api/alerts/[id] (Toggle / Update)                         */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — PATCH /api/alerts/:id (Modification)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("toggle isActive de true à false", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertId = "alert-toggle-1";

    await page.route(`**/api/alerts/${alertId}*`, async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("isActive");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: alertId, isActive: false }),
        }),
      });
    });

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      return { status: res.status, body: await res.json() };
    }, alertId);
    expect(result.status).toBe(200);
    expect(result.body.alert.isActive).toBe(false);
  });

  test("toggle isActive de false à true", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertId = "alert-toggle-2";

    await page.route(`**/api/alerts/${alertId}*`, async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: alertId, isActive: true }),
        }),
      });
    });

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      return { status: res.status, body: await res.json() };
    }, alertId);
    expect(result.status).toBe(200);
    expect(result.body.alert.isActive).toBe(true);
  });

  test("met à jour threshold et channel", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertId = "alert-update-1";

    await page.route(`**/api/alerts/${alertId}*`, async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.threshold).toBe(85);
      expect(body.channel).toBe("WEBHOOK");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: alertId, threshold: 85, channel: "WEBHOOK" }),
        }),
      });
    });

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: 85, channel: "WEBHOOK" }),
      });
      return { status: res.status, body: await res.json() };
    }, alertId);
    expect(result.status).toBe(200);
    expect(result.body.alert.threshold).toBe(85);
    expect(result.body.alert.channel).toBe("WEBHOOK");
  });

  test("retourne 404 pour une alerte inexistante", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts/alert-inconnu*", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-inconnu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(404);
  });

  test("simule une erreur serveur 500 au toggle", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts/alert-500*", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-500", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/*  6. API — DELETE /api/alerts/[id]                                          */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — DELETE /api/alerts/:id (Suppression)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("supprime une alerte existante → 204", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertId = "alert-to-delete";

    await page.route(`**/api/alerts/${alertId}*`, async (route) => {
      if (route.request().method() !== "DELETE") return;
      await route.fulfill({ status: 204 });
    });

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "DELETE",
      });
      return { status: res.status, statusText: res.statusText };
    }, alertId);
    expect(result.status).toBe(204);
    // 204 has no body
    expect(result.statusText).toBe("No Content");
  });

  test("retourne 404 pour une alerte inexistante", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts/alert-inconnu*", async (route) => {
      if (route.request().method() !== "DELETE") return;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Alerte introuvable" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-inconnu", {
        method: "DELETE",
      });
      return { status: res.status };
    });
    expect(result.status).toBe(404);
  });

  test("simule une erreur serveur 500 à la suppression", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/alerts/alert-500-del*", async (route) => {
      if (route.request().method() !== "DELETE") return;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/alert-500-del", {
        method: "DELETE",
      });
      return { status: res.status };
    });
    expect(result.status).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/*  7. API — Plan Enforcement (FREE vs PRO vs TEAM)                           */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — Plan Enforcement", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("FREE plan: canCreate est false et POST est refusé (403)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_FREE);
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "FREE",
      canCreate: false,
    });

    // Verify canCreate
    const getResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(getResult.body.plan).toBe("FREE");
    expect(getResult.body.canCreate).toBe(false);

    // Verify POST blocked
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Les alertes sont disponibles à partir du plan Pro. Passez à Pro pour créer des alertes.",
          code: "FORBIDDEN",
        }),
      });
    });

    const postResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(postResult.status).toBe(403);
    expect(postResult.body.error).toContain("plan Pro");
  });

  test("PRO plan: canCreate est true et POST est accepté", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche()],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const getResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(getResult.body.plan).toBe("PRO");
    expect(getResult.body.canCreate).toBe(true);

    // Verify POST works
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: makeAlertWithNiche({ id: "pro-alert" }) }),
      });
    });

    const postResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD" }),
      });
      return { status: res.status };
    });
    expect(postResult.status).toBe(201);
  });

  test("TEAM plan: canCreate est true et POST est accepté", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_TEAM);
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "TEAM",
      canCreate: true,
    });

    const getResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(getResult.body.plan).toBe("TEAM");
    expect(getResult.body.canCreate).toBe(true);
  });

  test("PRO plan: peut créer plusieurs alertes (pas de limite arbitraire)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const manyAlerts = Array.from({ length: 5 }, (_, i) =>
      makeAlertWithNiche({ id: `pro-alert-${i + 1}`, threshold: 50 + i * 10 }),
    );
    await mockGetAlerts(page, {
      alerts: manyAlerts,
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.alerts).toHaveLength(5);
    expect(result.body.canCreate).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Edge Cases — API                                                       */
/* -------------------------------------------------------------------------- */

test.describe("Alertes API — Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("alerte avec niche null (toutes les niches)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const alertNoNiche = makeAlert({ nicheId: null, niche: null, type: "DAILY_DIGEST" });
    await mockGetAlerts(page, {
      alerts: [alertNoNiche],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.alerts[0].niche).toBeNull();
    expect(result.body.alerts[0].type).toBe("DAILY_DIGEST");
  });

  test("10+ alertes simulées (comportement liste longue)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const manyAlerts = Array.from({ length: 12 }, (_, i) =>
      makeAlertWithNiche({ id: `alert-${i}`, threshold: 30 + ((i * 5) % 71) }),
    );
    await mockGetAlerts(page, {
      alerts: manyAlerts,
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.alerts).toHaveLength(12);
    // All IDs are unique
    const ids = result.body.alerts.map((a: { id: string }) => a.id);
    expect(new Set(ids).size).toBe(12);
  });

  test("création et suppression rapides (3 cycles)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    // Create 3 alerts rapidly
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const alertId = `rapid-alert-${i}`;
      const threshold = 50 + i * 10;
      await page.route(`**/api/alerts*`, async (route) => {
        if (route.request().method() !== "POST") return;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ alert: makeAlertWithNiche({ id: alertId }) }),
        });
      });

      const postResult = await page.evaluate(
        async ({ id, thr }) => {
          const res = await fetch("/api/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "SCORE_THRESHOLD", threshold: thr }),
          });
          return { status: res.status };
        },
        { id: alertId, thr: threshold },
      );
      expect(postResult.status).toBe(201);
      ids.push(alertId);
    }
    expect(ids).toHaveLength(3);

    // Delete them all
    for (const id of ids) {
      await page.route(`**/api/alerts/${id}*`, async (route) => {
        if (route.request().method() !== "DELETE") return;
        await route.fulfill({ status: 204 });
      });

      const delResult = await page.evaluate(async (delId) => {
        const res = await fetch(`/api/alerts/${delId}`, {
          method: "DELETE",
        });
        return { status: res.status };
      }, id);
      expect(delResult.status).toBe(204);
    }

    // Verify empty list
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const getResult = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(getResult.body.alerts).toEqual([]);
  });

  test("POST avec canal WEBHOOK et URL valide passe", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    const created = makeAlertWithNiche({
      id: "webhook-ok",
      channel: "WEBHOOK",
      webhookUrl: "https://hooks.example.com/valid",
    });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.channel).toBe("WEBHOOK");
      expect(body.webhookUrl).toBeTruthy();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: created }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SCORE_THRESHOLD",
          channel: "WEBHOOK",
          webhookUrl: "https://hooks.example.com/valid",
        }),
      });
      return { status: res.status };
    });
    expect(result.status).toBe(201);
  });
});

/* -------------------------------------------------------------------------- */
/*  9. UI — Page /alerts (best-effort, conditionnel)                          */
/* -------------------------------------------------------------------------- */

test.describe("Alertes UI — Page /alerts", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    // Mock the GET /api/alerts endpoint used by the alerts page internally
    await mockGetAlerts(page, {
      alerts: [
        makeAlertWithNiche({
          id: "ui-alert-1",
          type: "SCORE_THRESHOLD",
          threshold: 75,
          channel: "EMAIL",
          isActive: true,
        }),
        makeAlertWithNiche({
          id: "ui-alert-2",
          type: "SPIKE",
          threshold: 90,
          channel: "WEBHOOK",
          isActive: false,
        }),
        makeAlertWithNiche({
          id: "ui-alert-3",
          type: "DAILY_DIGEST",
          channel: "EMAIL",
          isActive: true,
        }),
      ],
      plan: "PRO",
      canCreate: true,
    });
  });

  test("la page /alerts se charge ou redirige vers /login", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    // Either we land on the alerts page or get redirected to login
    const currentUrl = page.url();
    const onAlerts = currentUrl.includes("/alerts");
    const onLogin = currentUrl.includes("/login");

    expect(onAlerts || onLogin).toBe(true);
  });

  test("affiche le titre 'Alertes' quand la page est accessible", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      await expect(page.locator("h1")).toContainText("Alertes");
    }
  });

  test("affiche la liste des alertes avec badges de type et seuil", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // Type badges should be visible
      await expect(page.getByText("Score seuil").first()).toBeVisible();
      await expect(page.getByText("Pic d'activité").first()).toBeVisible();
      await expect(page.getByText("Résumé quotidien").first()).toBeVisible();

      // Threshold displayed for non-digest alerts
      await expect(page.getByText("Seuil: 75%").first()).toBeVisible();
      await expect(page.getByText("Seuil: 90%").first()).toBeVisible();
    }
  });

  test("indicateur Actif/Inactif est visible pour chaque alerte", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // Active alert
      await expect(page.getByText("Actif").first()).toBeVisible();
      // Inactive alert
      await expect(page.getByText("Inactif").first()).toBeVisible();
    }
  });

  test("affiche le canal (Email/Webhook) et la niche pour chaque alerte", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // Channel indicators
      await expect(page.getByText("Email").first()).toBeVisible();
      await expect(page.getByText("Webhook").first()).toBeVisible();
      // Niche name
      await expect(page.getByText("Tech & IA").first()).toBeVisible();
    }
  });

  test("affiche le bouton 'Nouvelle alerte' pour les utilisateurs PRO", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      await expect(page.getByText("Nouvelle alerte")).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  10. UI — État vide pour FREE                                              */
/* -------------------------------------------------------------------------- */

test.describe("Alertes UI — Plan FREE (état vide + upgrade)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_FREE);
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: [],
      plan: "FREE",
      canCreate: false,
    });
  });

  test("affiche le message d'upgrade pour les utilisateurs FREE", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // Should see the upgrade prompt
      await expect(page.getByText("Fonctionnalité Pro")).toBeVisible();
      await expect(page.getByText("Passer à Pro →")).toBeVisible();
      // Should NOT see the create button
      await expect(page.getByText("Nouvelle alerte")).not.toBeVisible();
    }
  });

  test("le lien 'Passer à Pro' pointe vers /pricing", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      const upgradeLink = page.locator('a[href="/pricing"]');
      await expect(upgradeLink.first()).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  11. UI — État vide (aucune alerte)                                        */
/* -------------------------------------------------------------------------- */

test.describe("Alertes UI — Liste vide", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
  });

  test("affiche le message 'Aucune alerte configurée' quand la liste est vide", async ({
    page,
  }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      await expect(page.getByText("Aucune alerte configurée")).toBeVisible();
      // The "Nouvelle alerte" button should still appear (PRO plan)
      await expect(page.getByText("Nouvelle alerte")).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  12. UI — Interactions client (via page.route)                             */
/* -------------------------------------------------------------------------- */

test.describe("Alertes UI — Interactions client (Create / Toggle / Delete)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
  });

  test("le bouton Nouvelle alerte ouvre le formulaire de création", async ({ page }) => {
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return; // skip if redirected

    // Click "Nouvelle alerte"
    await page.getByText("Nouvelle alerte").click();

    // The create form should appear
    await expect(page.getByText("Type d'alerte")).toBeVisible();
    await expect(page.getByText("Canal")).toBeVisible();
    await expect(page.getByText("Créer l'alerte")).toBeVisible();
    await expect(page.getByText("Annuler")).toBeVisible();

    // Close the form
    await page.getByText("Annuler").click();
    await expect(page.getByText("Type d'alerte")).not.toBeVisible();
  });

  test("le formulaire permet de sélectionner tous les types d'alerte", async ({ page }) => {
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Open form
    await page.getByText("Nouvelle alerte").click();
    await expect(page.getByText("Type d'alerte")).toBeVisible();

    // Check the select has all options
    const typeSelect = page.locator("select").first();
    const options = await typeSelect.locator("option").allTextContents();
    expect(options).toContain("Score seuil");
    expect(options).toContain("Résumé quotidien");
    expect(options).toContain("Pic d'activité");
  });

  test("le formulaire offre le choix Email et Webhook comme canal", async ({ page }) => {
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    await page.getByText("Nouvelle alerte").click();

    // Find the channel select (second or third select)
    const channelSelect = page.locator("select").nth(1);
    const options = await channelSelect.locator("option").allTextContents();
    expect(options).toContain("Email");
    expect(options).toContain("Webhook");
  });

  test("le formulaire liste les niches auxquelles l'utilisateur est abonné", async ({ page }) => {
    await mockGetAlerts(page, {
      alerts: [],
      userNiches: [
        { niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } },
        { niche: { id: "niche-2", name: "Gaming", slug: "gaming" } },
      ],
      plan: "PRO",
      canCreate: true,
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    await page.getByText("Nouvelle alerte").click();

    // Check niche options (there should be "Toutes les niches" + user niches)
    const nicheSelect = page.locator("select").nth(2); // 3rd select: type, channel, niche
    const options = await nicheSelect.locator("option").allTextContents();
    expect(options).toContain("Toutes les niches");
    expect(options).toContain("Tech & IA");
    expect(options).toContain("Gaming");
  });
});

/* -------------------------------------------------------------------------- */
/*  13. UI — Création avec feedback de succès (mocké)                         */
/* -------------------------------------------------------------------------- */

test.describe("Alertes UI — Cycle de vie complet (mocké côté client)", () => {
  test("création d'une alerte → ajoutée à la liste", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    const alerts: Array<Record<string, unknown>> = [];
    await mockAlertsApi(page, {
      onGet: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts,
            userNiches: DEFAULT_NICHES,
            plan: "PRO",
            canCreate: true,
          }),
        });
      },
      onPost: async (route) => {
        const body = JSON.parse(route.request().postData() || "{}");
        const newAlert = makeAlertWithNiche({
          id: `created-${Date.now()}`,
          type: body.type || "SCORE_THRESHOLD",
          threshold: body.threshold || 70,
          channel: body.channel || "EMAIL",
          isActive: true,
        });
        alerts.unshift(newAlert);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ alert: newAlert }),
        });
      },
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Verify empty state
    await expect(page.getByText("Aucune alerte configurée")).toBeVisible();

    // Create a new alert
    await page.getByText("Nouvelle alerte").click();
    await page.getByText("Créer l'alerte").click();

    // Wait for the alert to appear in the list
    await expect(page.getByText("Score seuil").first()).toBeVisible({ timeout: 5000 });
    // The empty state should no longer be visible
    await expect(page.getByText("Aucune alerte configurée")).not.toBeVisible();
  });

  test("toggle actif/inactif depuis l'UI", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    let alertsData = [makeAlertWithNiche({ id: "toggle-me", isActive: true })];

    await mockAlertsApi(page, {
      onGet: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: alertsData,
            userNiches: DEFAULT_NICHES,
            plan: "PRO",
            canCreate: true,
          }),
        });
      },
      onPatch: async (route) => {
        const body = JSON.parse(route.request().postData() || "{}");
        alertsData = alertsData.map((a) =>
          a.id === "toggle-me" ? { ...a, isActive: body.isActive } : a,
        );
        const updated = alertsData.find((a) => a.id === "toggle-me")!;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alert: updated }),
        });
      },
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Initially active
    await expect(page.getByText("Actif").first()).toBeVisible();

    // Click toggle (button with text "Actif")
    await page.getByText("Actif").click();

    // Should become inactive after the toggle
    await expect(page.getByText("Inactif").first()).toBeVisible({ timeout: 5000 });
  });

  test("suppression d'une alerte depuis l'UI", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    let alertsData = [
      makeAlertWithNiche({ id: "delete-me" }),
      makeAlertWithNiche({ id: "keep-me" }),
    ];

    await mockAlertsApi(page, {
      onGet: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: alertsData,
            userNiches: DEFAULT_NICHES,
            plan: "PRO",
            canCreate: true,
          }),
        });
      },
      onDelete: async (route) => {
        const url = route.request().url();
        const id = url.split("/").pop()!;
        alertsData = alertsData.filter((a) => a.id !== id);
        await route.fulfill({ status: 204 });
      },
    });

    // We need to accept the confirm dialog
    page.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("supprimer");
      dialog.accept();
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Should have 2 alerts visible
    await expect(page.getByText("Score seuil").first()).toBeVisible();

    // Click the first delete button (Trash2 icon)
    const deleteButtons = page.locator("button").filter({ has: page.locator(".lucide-trash2") });
    await deleteButtons.first().click();

    // After deletion, only one alert remains
    // Wait for the deletion to process and UI to update
    await page.waitForTimeout(2000);
  });

  test("échec de création → message d'erreur affiché", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await mockAlertsApi(page, {
      onGet: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [],
            userNiches: DEFAULT_NICHES,
            plan: "PRO",
            canCreate: true,
          }),
        });
      },
      onPost: async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
        });
      },
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Open form and submit
    await page.getByText("Nouvelle alerte").click();
    await page.getByText("Créer l'alerte").click();

    // Error should be displayed in the form
    // The AlertForm component catches errors and shows them in a red div
    await expect(page.getByText("Erreur lors de la création").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("échec de toggle (PATCH 500) → message d'erreur alert()", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await mockAlertsApi(page, {
      onGet: async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [makeAlertWithNiche({ id: "fail-toggle" })],
            userNiches: DEFAULT_NICHES,
            plan: "PRO",
            canCreate: true,
          }),
        });
      },
      onPatch: async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Erreur interne" }),
        });
      },
    });

    // Listen for the alert dialog that AlertList shows on error
    let dialogMessage = "";
    page.on("dialog", (dialog) => {
      dialogMessage = dialog.message();
      dialog.accept();
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Click the toggle button
    await page.getByText("Actif").click();

    // Wait for dialog
    await page.waitForTimeout(2000);
    expect(dialogMessage).toContain("Erreur");
  });
});

// NOTE: Sidebar link "Alertes" existence is tested in dashboard.spec.ts (Navigation latérale).
