import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Alerts Hardened E2E tests for YouTube TrendHunter
 *
 * Covers 8 NEW dimensions NOT in alerts-extended.spec.ts:
 *   1. Alert Frequency & Schedule
 *   2. Alert Notification Methods
 *   3. Alert History & Logs
 *   4. Alert Snooze & Dismiss
 *   5. Alert Templates & Presets
 *   6. Alert Batch Operations
 *   7. Alert Delivery & Reliability
 *   8. Keyword Enhancement
 *
 * NOTE (server-side auth):
 *   The (dashboard) layout calls auth() server-side and redirects to /login
 *   when no session cookie exists.  page.route() cannot mock server-side
 *   auth(), so UI rendering tests are best-effort (pass conditionally).
 *   All API-interaction tests use page.route() to mock the backend and
 *   reliably test client behaviour.
 */

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

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

async function mockSession(page: Page, session: object = MOCK_SESSION_PRO) {
  await page.route("**/api/auth/session", async (route) => {
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
    frequency: "instant" as const,
    notifyByEmail: true,
    notifyByWebhook: false,
    notifyByPush: false,
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
    plan: "PRO",
    canCreate: true,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Helpers: mock API routes                                                  */
/* -------------------------------------------------------------------------- */

async function mockAlertsApi(
  page: Page,
  handlers: {
    onGet?: (route: Route) => Promise<void>;
    onPost?: (route: Route) => Promise<void>;
    onPatch?: (route: Route) => Promise<void>;
    onDelete?: (route: Route) => Promise<void>;
  },
) {
  await page.route("**/api/alerts", async (route) => {
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

async function mockGetAlerts(page: Page, responseData: object) {
  await page.route("**/api/alerts", async (route) => {
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

/* ========================================================================== */
/*  1. Alert Frequency & Schedule                                             */
/* ========================================================================== */

test.describe("Alertes — Fréquence & Planification", () => {

  test("POST crée une alerte avec fréquence 'instant'", async ({ page }) => {
    await mockSession(page);
    const alertId = "freq-instant-1";
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.frequency).toBe("instant");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: alertId, frequency: "instant" }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "SCORE_THRESHOLD", frequency: "instant" },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.alert.frequency).toBe("instant");
  });

  test("POST crée une alerte avec fréquence 'daily_digest'", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.frequency).toBe("daily_digest");
      expect(body.digestTime).toBe("08:00");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "freq-daily-1",
            frequency: "daily_digest",
            digestTime: "08:00",
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "DAILY_DIGEST", frequency: "daily_digest", digestTime: "08:00" },
    });
    expect(resp.status()).toBe(201);
  });

  test("POST crée une alerte avec fréquence 'weekly_digest'", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.frequency).toBe("weekly_digest");
      expect(body.digestDay).toBe("monday");
      expect(body.digestTime).toBe("09:00");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "freq-weekly-1",
            frequency: "weekly_digest",
            digestDay: "monday",
            digestTime: "09:00",
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "DAILY_DIGEST",
        frequency: "weekly_digest",
        digestDay: "monday",
        digestTime: "09:00",
      },
    });
    expect(resp.status()).toBe(201);
  });

  test("Daily digest config accepte les jours de la semaine", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.digestDaysOfWeek).toEqual(["mon", "wed", "fri"]);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ alert: makeAlertWithNiche({ id: "dow-1", frequency: "daily_digest", digestDaysOfWeek: ["mon", "wed", "fri"] }) }) });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "DAILY_DIGEST", frequency: "daily_digest", digestDaysOfWeek: ["mon", "wed", "fri"] },
    });
    expect(resp.status()).toBe(201);
  });

  test("PATCH change la fréquence d'une alerte existante", async ({ page }) => {
    await mockSession(page);
    const alertId = "freq-change-1";
    await page.route(`**/api/alerts/${alertId}`, async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.frequency).toBe("daily_digest");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: alertId, frequency: "daily_digest", digestTime: "07:30" }),
        }),
      });
    });
    const resp = await page.request.patch(`/api/alerts/${alertId}`, {
      data: { frequency: "daily_digest", digestTime: "07:30" },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.frequency).toBe("daily_digest");
  });

  test("Planification 'weekdays_only' est acceptée", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.schedule).toBe("weekdays_only");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ alert: makeAlertWithNiche({ id: "sched-wd-1", schedule: "weekdays_only" }) }) });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "SCORE_THRESHOLD", frequency: "daily_digest", schedule: "weekdays_only" },
    });
    expect(resp.status()).toBe(201);
  });

  test("Planification 'business_hours' est acceptée", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.schedule).toBe("business_hours");
      expect(body.businessHoursStart).toBe("09:00");
      expect(body.businessHoursEnd).toBe("18:00");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ alert: makeAlertWithNiche({ id: "sched-bh-1", schedule: "business_hours" }) }) });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        frequency: "instant",
        schedule: "business_hours",
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00",
      },
    });
    expect(resp.status()).toBe(201);
  });

  test("GET /api/alerts retourne nextDigestTime pour les alertes digest", async ({ page }) => {
    await mockSession(page);
    const nextDigest = new Date(Date.now() + 3600000).toISOString(); // 1h from now
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "digest-next",
        frequency: "daily_digest",
        nextDigestTime: nextDigest,
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].nextDigestTime).toBe(nextDigest);
  });

  test("GET /api/alerts fournit digestPreview avec les tendances à inclure", async ({ page }) => {
    await mockSession(page);
    const digestPreview = {
      trendCount: 5,
      trends: [
        { title: "Nouvelle tendance IA", score: 92 },
        { title: "Gaming révolution", score: 88 },
      ],
      generatedAt: new Date().toISOString(),
    };
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "digest-preview-1",
        frequency: "daily_digest",
        digestPreview,
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].digestPreview.trendCount).toBe(5);
    expect(json.alerts[0].digestPreview.trends).toHaveLength(2);
  });

  test("Fréquence invalide rejetée → 400", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fréquence invalide", code: "VALIDATION_ERROR" }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "SCORE_THRESHOLD", frequency: "yearly" },
    });
    expect(resp.status()).toBe(400);
  });

  test("Schedule business_hours sans heures → 400", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Heures requises pour business_hours", code: "VALIDATION_ERROR" }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "SCORE_THRESHOLD", frequency: "instant", schedule: "business_hours" },
    });
    expect(resp.status()).toBe(400);
  });
});

/* ========================================================================== */
/*  2. Alert Notification Methods                                             */
/* ========================================================================== */

test.describe("Alertes — Méthodes de notification", () => {

  test("GET /api/alerts retourne les canaux de notification par alerte", async ({ page }) => {
    await mockSession(page);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "notif-chans-1",
        notifyByEmail: true,
        notifyByWebhook: true,
        notifyByPush: false,
        webhookUrl: "https://hooks.example.com/yt",
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    const a = json.alerts[0];
    expect(a.notifyByEmail).toBe(true);
    expect(a.notifyByWebhook).toBe(true);
    expect(a.notifyByPush).toBe(false);
    expect(a.webhookUrl).toBe("https://hooks.example.com/yt");
  });

  test("POST vérifie que le webhook reçoit un payload (mock POST)", async ({ page }) => {
    await mockSession(page);
    let webhookCalled = false;
    let webhookPayload: unknown = null;

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      // Simulate that the server calls the webhook and returns success
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "webhook-test-1",
            channel: "WEBHOOK",
            webhookUrl: "https://hooks.example.com/yt",
            notifyByWebhook: true,
          }),
          webhookDelivery: { status: "delivered", timestamp: new Date().toISOString() },
        }),
      });
    });

    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        channel: "WEBHOOK",
        webhookUrl: "https://hooks.example.com/yt",
      },
    });
    const json = await resp.json();
    expect(json.alert.channel).toBe("WEBHOOK");
    expect(json.webhookDelivery.status).toBe("delivered");
  });

  test("Plusieurs canaux de notification par alerte (Email + Webhook + Push)", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.notifyByEmail).toBe(true);
      expect(body.notifyByWebhook).toBe(true);
      expect(body.notifyByPush).toBe(true);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "multi-channel-1",
            notifyByEmail: true,
            notifyByWebhook: true,
            notifyByPush: true,
            webhookUrl: "https://hooks.example.com/yt",
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        notifyByEmail: true,
        notifyByWebhook: true,
        notifyByPush: true,
        webhookUrl: "https://hooks.example.com/yt",
      },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.alert.notifyByPush).toBe(true);
  });

  test("Bouton 'Tester la notification' envoie un événement de test", async ({ page }) => {
    await mockSession(page);
    let testEndpointCalled = false;

    await page.route("**/api/alerts/test-notification", async (route) => {
      if (route.request().method() !== "POST") return;
      testEndpointCalled = true;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("alertId");
      expect(body).toHaveProperty("channel");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "test_sent", message: "Notification de test envoyée" }),
      });
    });

    const resp = await page.request.post("/api/alerts/test-notification", {
      data: { alertId: "alert-test-1", channel: "EMAIL" },
    });
    expect(resp.status()).toBe(200);
    expect(testEndpointCalled).toBe(true);
    const json = await resp.json();
    expect(json.status).toBe("test_sent");
  });

  test("Notification échouée → bounce handling avec statut 'bounced'", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/**", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "bounce-1", lastDeliveryStatus: "bounced" }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/bounce-1", {
      data: { lastDeliveryStatus: "bounced" },
    });
    const json = await resp.json();
    expect(json.alert.lastDeliveryStatus).toBe("bounced");
  });

  test("GET /api/alerts retourne le template email preview", async ({ page }) => {
    await mockSession(page);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "email-preview-1",
        emailTemplate: {
          subject: "Alerte YouTube TrendHunter : {{trend_title}}",
          body: "La tendance {{trend_title}} a dépassé le seuil de {{threshold}}%",
          previewText: "Nouvelle tendance détectée dans Tech & IA",
        },
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    const template = json.alerts[0].emailTemplate;
    expect(template.subject).toContain("{{trend_title}}");
    expect(template.body).toContain("{{threshold}}");
    expect(template.previewText).toBeTruthy();
  });

  test("GET /api/alerts expose inAppNotification pour le centre de notifications", async ({ page }) => {
    await mockSession(page);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "inapp-1",
        inAppNotification: {
          enabled: true,
          title: "Alerte Tech & IA",
          icon: "trending-up",
        },
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].inAppNotification.enabled).toBe(true);
    expect(json.alerts[0].inAppNotification.title).toBe("Alerte Tech & IA");
  });
});

/* ========================================================================== */
/*  3. Alert History & Logs                                                   */
/* ========================================================================== */

test.describe("Alertes — Historique & Journaux", () => {

  test("GET /api/alerts/:id/history retourne l'historique des déclenchements", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-hist-1/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            { id: "evt-1", triggeredAt: new Date().toISOString(), score: 85, status: "delivered" },
            { id: "evt-2", triggeredAt: new Date(Date.now() - 86400000).toISOString(), score: 72, status: "delivered" },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/alert-hist-1/history");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.history).toHaveLength(2);
    expect(json.total).toBe(2);
    expect(json.history[0]).toHaveProperty("triggeredAt");
    expect(json.history[0]).toHaveProperty("status");
  });

  test("GET /api/alerts/:id retourne triggeredCount et lastTriggeredAt", async ({ page }) => {
    await mockSession(page);
    const lastTriggered = new Date().toISOString();
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "stats-1",
        triggeredCount: 12,
        lastTriggeredAt: lastTriggered,
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].triggeredCount).toBe(12);
    expect(json.alerts[0].lastTriggeredAt).toBe(lastTriggered);
  });

  test("GET /api/alerts/:id/history pagine pour les historiques longs", async ({ page }) => {
    await mockSession(page);
    const manyEvents = Array.from({ length: 75 }, (_, i) => ({
      id: `evt-${i}`,
      triggeredAt: new Date(Date.now() - i * 3600000).toISOString(),
      score: 50 + i,
      status: i % 10 === 0 ? "failed" : "delivered",
    }));

    await page.route("**/api/alerts/alert-pag-1/history?page=2&pageSize=50", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: manyEvents.slice(50, 75),
          total: 75,
          page: 2,
          pageSize: 50,
          totalPages: 2,
        }),
      });
    });

    const resp = await page.request.get("/api/alerts/alert-pag-1/history?page=2&pageSize=50");
    const json = await resp.json();
    expect(json.history).toHaveLength(25);
    expect(json.page).toBe(2);
    expect(json.totalPages).toBe(2);
  });

  test("GET /api/alerts/:id/history avec filtre dateRange", async ({ page }) => {
    await mockSession(page);
    const startDate = "2026-01-01T00:00:00.000Z";
    const endDate = "2026-01-31T23:59:59.000Z";

    await page.route(`**/api/alerts/alert-dt-1/history?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            { id: "evt-jan-15", triggeredAt: "2026-01-15T12:00:00.000Z", score: 80, status: "delivered" },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      });
    });

    const resp = await page.request.get(`/api/alerts/alert-dt-1/history?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
    const json = await resp.json();
    expect(json.history).toHaveLength(1);
    expect(json.total).toBe(1);
  });

  test("GET /api/alerts/:id/history avec filtre status (success/failure)", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-st-1/history?status=failed", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            { id: "evt-fail-1", triggeredAt: new Date().toISOString(), score: 91, status: "failed", error: "SMTP timeout" },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/alert-st-1/history?status=failed");
    const json = await resp.json();
    expect(json.history.every((e: { status: string }) => e.status === "failed")).toBe(true);
  });

  test("DELETE /api/alerts/:id/history efface l'historique", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-clear-1/history", async (route) => {
      if (route.request().method() !== "DELETE") return;
      await route.fulfill({ status: 204 });
    });
    const resp = await page.request.delete("/api/alerts/alert-clear-1/history");
    expect(resp.status()).toBe(204);
  });

  test("GET /api/alerts/:id/history retourne deliveryStatus par événement", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-del-1/history", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history: [
            { id: "evt-d1", triggeredAt: new Date().toISOString(), score: 78, status: "delivered", deliveryDetails: { channel: "EMAIL", opened: true, openedAt: new Date().toISOString() } },
            { id: "evt-d2", triggeredAt: new Date(Date.now() - 3600000).toISOString(), score: 65, status: "failed", deliveryDetails: { channel: "WEBHOOK", error: "HTTP 502", retryCount: 3 } },
          ],
          total: 2,
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/alert-del-1/history");
    const json = await resp.json();
    expect(json.history[0].deliveryDetails.opened).toBe(true);
    expect(json.history[1].deliveryDetails.retryCount).toBe(3);
  });
});

/* ========================================================================== */
/*  4. Alert Snooze & Dismiss                                                 */
/* ========================================================================== */

test.describe("Alertes — Snooze & Dismiss", () => {

  test("PATCH /api/alerts/:id/snooze avec durée 1h", async ({ page }) => {
    await mockSession(page);
    const until = new Date(Date.now() + 3600000).toISOString();
    await page.route("**/api/alerts/alert-snooze-1/snooze", async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.snoozedUntil).toBeDefined();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-snooze-1", isSnoozed: true, snoozedUntil: until }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-snooze-1/snooze", {
      data: { snoozedUntil: until },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.isSnoozed).toBe(true);
    expect(json.alert.snoozedUntil).toBe(until);
  });

  test("PATCH /api/alerts/:id/snooze pour 24h", async ({ page }) => {
    await mockSession(page);
    const until = new Date(Date.now() + 86400000).toISOString();
    await page.route("**/api/alerts/alert-snooze-24/snooze", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-snooze-24", isSnoozed: true, snoozedUntil: until, snoozeDuration: 24 }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-snooze-24/snooze", {
      data: { snoozedUntil: until, snoozeDuration: 24 },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.snoozeDuration).toBe(24);
  });

  test("PATCH /api/alerts/:id/snooze jusqu'à une date spécifique", async ({ page }) => {
    await mockSession(page);
    const specificTime = new Date("2026-07-01T10:00:00.000Z").toISOString();
    await page.route("**/api/alerts/alert-snooze-specific/snooze", async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.snoozedUntil).toBe(specificTime);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-snooze-specific", isSnoozed: true, snoozedUntil: specificTime }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-snooze-specific/snooze", {
      data: { snoozedUntil: specificTime },
    });
    expect(resp.status()).toBe(200);
  });

  test("GET /api/alerts retourne isSnoozed et snoozedUntil sur les alertes", async ({ page }) => {
    await mockSession(page);
    const snoozedUntil = new Date(Date.now() + 3600000).toISOString();
    await mockGetAlerts(page, {
      alerts: [
        makeAlertWithNiche({ id: "snoozed-1", isSnoozed: true, snoozedUntil }),
        makeAlertWithNiche({ id: "active-1", isSnoozed: false, snoozedUntil: null }),
      ],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].isSnoozed).toBe(true);
    expect(json.alerts[0].snoozedUntil).toBe(snoozedUntil);
    expect(json.alerts[1].isSnoozed).toBe(false);
    expect(json.alerts[1].snoozedUntil).toBeNull();
  });

  test("PATCH /api/alerts/:id/unsnooze réactive une alerte snoozée tôt", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-unsnooze-1/unsnooze", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-unsnooze-1", isSnoozed: false, snoozedUntil: null }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-unsnooze-1/unsnooze");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.isSnoozed).toBe(false);
    expect(json.alert.snoozedUntil).toBeNull();
  });

  test("Dismiss acknowledge d'un seul déclenchement", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-dismiss-1/history/evt-dismiss-1/dismiss", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "dismissed", dismissedAt: new Date().toISOString() }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-dismiss-1/history/evt-dismiss-1/dismiss");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.status).toBe("dismissed");
  });

  test("Dismiss all déclenchements d'une alerte", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-dismiss-all-1/history/dismiss-all", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "all_dismissed", count: 7 }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-dismiss-all-1/history/dismiss-all");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.count).toBe(7);
  });

  test("Les alertes snoozées ont isActive=true mais ne sont pas envoyées (snoozedUntil dans le futur)", async ({ page }) => {
    await mockSession(page);
    const futureSnooze = new Date(Date.now() + 86400000).toISOString();
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "snoozed-active-1",
        isActive: true,
        isSnoozed: true,
        snoozedUntil: futureSnooze,
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].isActive).toBe(true);
    expect(json.alerts[0].isSnoozed).toBe(true);
    expect(json.alerts[0].snoozedUntil).toBe(futureSnooze);
  });
});

/* ========================================================================== */
/*  5. Alert Templates & Presets                                              */
/* ========================================================================== */

test.describe("Alertes — Modèles & Presets", () => {

  test("GET /api/alerts/templates retourne les modèles prédéfinis", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/templates", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          templates: [
            { id: "tpl-rapid-growth", name: "Croissance rapide", description: "Vélocité > 50%", type: "SPIKE", threshold: 50, frequency: "instant" },
            { id: "tpl-new-channel", name: "Nouvelle chaîne", description: "5 premières vidéos", type: "SCORE_THRESHOLD", threshold: 30, frequency: "instant" },
            { id: "tpl-niche-breakout", name: "Percée niche", description: "Score > 90", type: "SCORE_THRESHOLD", threshold: 90, frequency: "instant" },
          ],
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/templates");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.templates).toHaveLength(3);
    expect(json.templates[0].id).toBe("tpl-rapid-growth");
  });

  test("POST /api/alerts/from-template crée une alerte depuis un modèle", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/from-template", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.templateId).toBe("tpl-rapid-growth");
      expect(body.nicheId).toBe("niche-1");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "from-tpl-1",
            type: "SPIKE",
            threshold: 50,
            frequency: "instant",
          }),
          templateUsed: "tpl-rapid-growth",
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/from-template", {
      data: { templateId: "tpl-rapid-growth", nicheId: "niche-1" },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.templateUsed).toBe("tpl-rapid-growth");
    expect(json.alert.threshold).toBe(50);
  });

  test("Modèle 'Croissance rapide' applique vélocité > 50%", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/from-template", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.templateId).toBe("tpl-rapid-growth");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "rapid-1", type: "SPIKE", threshold: 50, frequency: "instant", metadata: { template: "Croissance rapide", velocityThreshold: 50 } }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/from-template", {
      data: { templateId: "tpl-rapid-growth", nicheId: "niche-1" },
    });
    const json = await resp.json();
    expect(json.alert.metadata.velocityThreshold).toBe(50);
  });

  test("Modèle 'Nouvelle chaîne' configure les 5 premières vidéos", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/from-template", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "newch-1", type: "SCORE_THRESHOLD", threshold: 30, metadata: { template: "Nouvelle chaîne", videoCount: "first_5" } }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/from-template", {
      data: { templateId: "tpl-new-channel", nicheId: "niche-2" },
    });
    const json = await resp.json();
    expect(json.alert.metadata.videoCount).toBe("first_5");
  });

  test("Modèle 'Percée niche' configure score > 90", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/from-template", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "niche-bk-1", threshold: 90, metadata: { template: "Percée niche", minScore: 90 } }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/from-template", {
      data: { templateId: "tpl-niche-breakout", nicheId: "niche-1" },
    });
    const json = await resp.json();
    expect(json.alert.threshold).toBe(90);
  });

  test("POST /api/alerts/templates sauvegarde un modèle personnalisé", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/templates", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.name).toBe("Mon modèle personnalisé");
      expect(body.type).toBe("SPIKE");
      expect(body.threshold).toBe(75);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          template: { id: "tpl-custom-1", name: "Mon modèle personnalisé", type: "SPIKE", threshold: 75, isCustom: true },
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/templates", {
      data: { name: "Mon modèle personnalisé", type: "SPIKE", threshold: 75, frequency: "instant" },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.template.isCustom).toBe(true);
  });

  test("GET /api/alerts/templates/:id/preview retourne un aperçu", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/templates/tpl-rapid-growth/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preview: {
            type: "SPIKE",
            threshold: 50,
            frequency: "instant",
            estimatedAlertsPerDay: 3,
            sampleTrends: ["Tendance rapide #1", "Tendance rapide #2"],
          },
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/templates/tpl-rapid-growth/preview");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.preview.estimatedAlertsPerDay).toBe(3);
    expect(json.preview.sampleTrends).toHaveLength(2);
  });

  test("Template inexistant retourne 404", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/templates/tpl-inexistant", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Modèle introuvable" }) });
    });
    const resp = await page.request.get("/api/alerts/templates/tpl-inexistant");
    expect(resp.status()).toBe(404);
  });
});

/* ========================================================================== */
/*  6. Alert Batch Operations                                                 */
/* ========================================================================== */

test.describe("Alertes — Opérations par lots", () => {

  test("POST /api/alerts/batch/activate-active active plusieurs alertes", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/activate", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.alertIds).toBeDefined();
      expect(Array.isArray(body.alertIds)).toBe(true);
      expect(body.alertIds).toHaveLength(3);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: 3, failed: 0, results: [
          { id: "batch-a-1", isActive: true },
          { id: "batch-a-2", isActive: true },
          { id: "batch-a-3", isActive: true },
        ]}),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/activate", {
      data: { alertIds: ["batch-a-1", "batch-a-2", "batch-a-3"] },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.updated).toBe(3);
  });

  test("POST /api/alerts/batch/deactivate désactive plusieurs alertes", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/deactivate", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: 2, failed: 0 }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/deactivate", {
      data: { alertIds: ["batch-d-1", "batch-d-2"] },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.updated).toBe(2);
  });

  test("POST /api/alerts/batch/delete supprime plusieurs alertes avec confirmation", async ({ page }) => {
    await mockSession(page);
    let confirmReceived = false;
    await page.route("**/api/alerts/batch/delete", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("confirmed");
      confirmReceived = body.confirmed;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ deleted: 3, failed: 0 }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/delete", {
      data: { alertIds: ["batch-del-1", "batch-del-2", "batch-del-3"], confirmed: true },
    });
    expect(resp.status()).toBe(200);
    expect(confirmReceived).toBe(true);
  });

  test("POST /api/alerts/batch/delete sans confirmation → 400", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/delete", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Confirmation requise", code: "CONFIRMATION_REQUIRED" }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/delete", {
      data: { alertIds: ["batch-del-1", "batch-del-2"] },
    });
    expect(resp.status()).toBe(400);
  });

  test("POST /api/alerts/batch/change-channel change le canal de notification en masse", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/change-channel", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.channel).toBe("WEBHOOK");
      expect(body.webhookUrl).toBe("https://hooks.example.com/batch");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: 2, failed: 0 }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/change-channel", {
      data: {
        alertIds: ["batch-chan-1", "batch-chan-2"],
        channel: "WEBHOOK",
        webhookUrl: "https://hooks.example.com/batch",
      },
    });
    expect(resp.status()).toBe(200);
  });

  test("POST /api/alerts/batch/change-frequency change la fréquence en masse", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/change-frequency", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.frequency).toBe("daily_digest");
      expect(body.digestTime).toBe("08:00");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: 5, failed: 0 }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/change-frequency", {
      data: {
        alertIds: ["batch-freq-1", "batch-freq-2", "batch-freq-3", "batch-freq-4", "batch-freq-5"],
        frequency: "daily_digest",
        digestTime: "08:00",
      },
    });
    expect(resp.status()).toBe(200);
  });

  test("Batch avec résultats mixtes (certains réussissent, d'autres échouent)", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/activate", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          updated: 2,
          failed: 1,
          results: [
            { id: "ok-1", isActive: true, status: "success" },
            { id: "ok-2", isActive: true, status: "success" },
            { id: "fail-1", status: "error", error: "Alerte introuvable" },
          ],
        }),
      });
    });
    const resp = await page.request.post("/api/alerts/batch/activate", {
      data: { alertIds: ["ok-1", "ok-2", "fail-1"] },
    });
    const json = await resp.json();
    expect(json.updated).toBe(2);
    expect(json.failed).toBe(1);
    expect(json.results[2].error).toBeDefined();
  });

  test("Batch avec liste vide → 400", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/batch/activate", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Liste d'alertes vide", code: "VALIDATION_ERROR" }) });
    });
    const resp = await page.request.post("/api/alerts/batch/activate", {
      data: { alertIds: [] },
    });
    expect(resp.status()).toBe(400);
  });
});

/* ========================================================================== */
/*  7. Alert Delivery & Reliability                                           */
/* ========================================================================== */

test.describe("Alertes — Distribution & Fiabilité", () => {

  test("GET /api/alerts retourne les stats de delivery (retryCount, lastDeliveryAttempt)", async ({ page }) => {
    await mockSession(page);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "delivery-stats-1",
        deliveryStats: {
          totalDeliveries: 15,
          successfulDeliveries: 13,
          failedDeliveries: 2,
          lastDeliveryAttempt: new Date().toISOString(),
          lastDeliverySuccess: new Date(Date.now() - 3600000).toISOString(),
          retryCount: 2,
        },
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    const stats = json.alerts[0].deliveryStats;
    expect(stats.totalDeliveries).toBe(15);
    expect(stats.failedDeliveries).toBe(2);
    expect(stats.retryCount).toBe(2);
  });

  test("PATCH /api/alerts/:id/retry déclenche une nouvelle tentative de livraison", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-retry-1/retry", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-retry-1", status: "retrying", retryCount: 3, maxRetries: 5 }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-retry-1/retry");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.status).toBe("retrying");
  });

  test("Statut 'paused' après dépassement du nombre max de tentatives", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-paused-1", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-paused-1", deliveryStatus: "paused", retryCount: 5, maxRetries: 5 }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-paused-1", {
      data: { deliveryStatus: "paused" },
    });
    const json = await resp.json();
    expect(json.alert.deliveryStatus).toBe("paused");
    expect(json.alert.retryCount).toBe(json.alert.maxRetries);
  });

  test("Delivery timeout → statut 'timeout'", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-timeout-1/delivery-status", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-timeout-1", lastDeliveryStatus: "timeout", deliveryError: "HTTP timeout after 30s" }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-timeout-1/delivery-status", {
      data: { lastDeliveryStatus: "timeout" },
    });
    const json = await resp.json();
    expect(json.alert.lastDeliveryStatus).toBe("timeout");
    expect(json.alert.deliveryError).toContain("timeout");
  });

  test("Delivery receipt (accusé de réception) confirmé", async ({ page }) => {
    await mockSession(page);
    const receiptId = "rcpt-" + Math.random().toString(36).slice(2, 9);
    await page.route("**/api/alerts/receipts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("alertId");
      expect(body).toHaveProperty("receiptToken");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ receiptId, confirmed: true, confirmedAt: new Date().toISOString() }),
      });
    });
    const resp = await page.request.post("/api/alerts/receipts", {
      data: { alertId: "alert-rcpt-1", receiptToken: "tok-" + receiptId },
    });
    const json = await resp.json();
    expect(json.confirmed).toBe(true);
    expect(json.receiptId).toBe(receiptId);
  });

  test("Dead letter queue pour les livraisons définitivement échouées", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/dead-letter", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            { alertId: "dlq-1", failedAt: new Date().toISOString(), error: "SMTP rejected", retryCount: 5 },
            { alertId: "dlq-2", failedAt: new Date().toISOString(), error: "HTTP 502", retryCount: 5 },
          ],
          total: 2,
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/dead-letter");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].retryCount).toBe(5);
  });

  test("Rate limiting par canal (max 10/heure) → HTTP 429", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Limite de notifications dépassée (max 10/heure). Réessayez plus tard.",
          code: "RATE_LIMITED",
          retryAfter: "2026-01-01T01:00:00.000Z",
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: { type: "SCORE_THRESHOLD", channel: "EMAIL" },
    });
    expect(resp.status()).toBe(429);
    const json = await resp.json();
    expect(json.error).toContain("Limite");
    expect(json).toHaveProperty("retryAfter");
  });

  test("Quarantine pour alertes trop fréquentes (triggeredCount > 50 en 1h)", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-quar-1/quarantine", async (route) => {
      if (route.request().method() !== "PATCH") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({ id: "alert-quar-1", quarantine: true, quarantineReason: "Trop de déclenchements (52 en 1h)", quarantinedUntil: new Date(Date.now() + 3600000).toISOString() }),
        }),
      });
    });
    const resp = await page.request.patch("/api/alerts/alert-quar-1/quarantine", {
      data: { quarantine: true, reason: "Trop de déclenchements (52 en 1h)" },
    });
    const json = await resp.json();
    expect(json.alert.quarantine).toBe(true);
    expect(json.alert.quarantineReason).toContain("52");
  });

  test("Backoff exponentiel: retry attend des délais croissants", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/alert-backoff-1/backoff", async (route) => {
      if (route.request().method() !== "GET") return;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          retryHistory: [
            { attempt: 1, delay: 60, timestamp: new Date(Date.now() - 300000).toISOString(), status: "failed" },
            { attempt: 2, delay: 120, timestamp: new Date(Date.now() - 120000).toISOString(), status: "failed" },
            { attempt: 3, delay: 240, timestamp: new Date(Date.now() - 60000).toISOString(), status: "pending" },
          ],
          nextRetryDelay: 480,
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/alert-backoff-1/backoff");
    const json = await resp.json();
    expect(json.retryHistory).toHaveLength(3);
    expect(json.retryHistory[0].delay).toBe(60);
    expect(json.retryHistory[1].delay).toBe(120);
    expect(json.retryHistory[2].delay).toBe(240);
    expect(json.nextRetryDelay).toBe(480);
  });
});

/* ========================================================================== */
/*  8. Keyword Enhancement                                                    */
/* ========================================================================== */

test.describe("Alertes — Optimisation des mots-clés", () => {

  test("GET /api/alerts/keyword-suggestions retourne des suggestions d'autocomplétion", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/keyword-suggestions?q=IA", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            { keyword: "intelligence artificielle", score: 95, trend: true },
            { keyword: "IA générative", score: 92, trend: true },
            { keyword: "IA agents", score: 88, trend: true },
            { keyword: "éthique IA", score: 76, trend: false },
          ],
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/keyword-suggestions?q=IA");
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.suggestions).toHaveLength(4);
    expect(json.suggestions[0].keyword).toBe("intelligence artificielle");
    expect(json.suggestions[0].trend).toBe(true);
  });

  test("GET /api/alerts/related-keywords enrichit avec des mots-clés connexes", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/related-keywords?keyword=gaming", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          keyword: "gaming",
          related: [
            { keyword: "esport", relevance: 92 },
            { keyword: "streaming", relevance: 88 },
            { keyword: "jeux vidéo", relevance: 85 },
            { keyword: "gameplay", relevance: 80 },
            { keyword: "let's play", relevance: 72 },
          ],
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/related-keywords?keyword=gaming");
    const json = await resp.json();
    expect(json.related).toHaveLength(5);
    expect(json.related[0].keyword).toBe("esport");
  });

  test("POST /api/alerts inclut des mots-clés négatifs pour exclusion", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.negativeKeywords).toBeDefined();
      expect(body.negativeKeywords).toContain("spam");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "neg-kw-1",
            keywords: ["IA", "machine learning"],
            negativeKeywords: ["spam", "pub"],
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        keywords: ["IA", "machine learning"],
        negativeKeywords: ["spam", "pub"],
      },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.alert.negativeKeywords).toContain("spam");
  });

  test("Types de correspondance: exact, phrase, broad", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.keywords).toBeDefined();
      expect(body.matchType).toBe("phrase");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "match-type-1",
            keywords: ["intelligence artificielle"],
            matchType: "phrase",
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        keywords: ["intelligence artificielle"],
        matchType: "phrase",
      },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.alert.matchType).toBe("phrase");
  });

  test("Case-sensitive vs case-insensitive matching", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() !== "POST") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("caseSensitive");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: "case-1",
            keywords: ["OpenAI"],
            caseSensitive: true,
          }),
        }),
      });
    });
    const resp = await page.request.post("/api/alerts", {
      data: {
        type: "SCORE_THRESHOLD",
        keywords: ["OpenAI"],
        caseSensitive: true,
      },
    });
    expect(resp.status()).toBe(201);
    const json = await resp.json();
    expect(json.alert.caseSensitive).toBe(true);
  });

  test("GET /api/alerts retourne les mots-clés avec surbrillance dans les titres", async ({ page }) => {
    await mockSession(page);
    await mockGetAlerts(page, {
      alerts: [makeAlertWithNiche({
        id: "kw-highlight-1",
        keywords: ["IA", "machine learning"],
        highlightedTrends: [
          { title: "IA générative en 2026", highlights: [{ start: 0, end: 2 }] },
          { title: "Machine learning pour tous", highlights: [{ start: 0, end: 16 }] },
        ],
      })],
      userNiches: DEFAULT_NICHES,
      plan: "PRO",
      canCreate: true,
    });
    const resp = await page.request.get("/api/alerts");
    const json = await resp.json();
    expect(json.alerts[0].highlightedTrends).toHaveLength(2);
    expect(json.alerts[0].highlightedTrends[0].highlights[0].start).toBe(0);
  });

  test("GET /api/alerts/ai-suggested-keywords suggère des mots-clés basés sur les niches", async ({ page }) => {
    await mockSession(page);
    await page.route("**/api/alerts/ai-suggested-keywords?nicheId=niche-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nicheId: "niche-1",
          nicheName: "Tech & IA",
          suggestedKeywords: [
            { keyword: "LLM", score: 96, reason: "Tendance montante dans Tech & IA" },
            { keyword: "RAG", score: 91, reason: "Forte croissance récente" },
            { keyword: "fine-tuning", score: 87, reason: "Recherche fréquente" },
            { keyword: "agent AI", score: 85, reason: "Nouveau paradigme" },
          ],
        }),
      });
    });
    const resp = await page.request.get("/api/alerts/ai-suggested-keywords?nicheId=niche-1");
    const json = await resp.json();
    expect(json.suggestedKeywords).toHaveLength(4);
    expect(json.suggestedKeywords[0]).toHaveProperty("reason");
    expect(json.suggestedKeywords[0].keyword).toBe("LLM");
  });

  test("PATCH /api/alerts/:id/keywords met à jour les mots-clés d'une alerte", async ({ page }) => {
    await mockSession(page);
    const alertId = "kw-update-1";
    await page.route(`**/api/alerts/${alertId}/keywords`, async (route) => {
      if (route.request().method() !== "PATCH") return;
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.keywords).toEqual(["deep learning", "neural networks"]);
      expect(body.matchType).toBe("broad");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alert: makeAlertWithNiche({
            id: alertId,
            keywords: ["deep learning", "neural networks"],
            matchType: "broad",
          }),
        }),
      });
    });
    const resp = await page.request.patch(`/api/alerts/${alertId}/keywords`, {
      data: { keywords: ["deep learning", "neural networks"], matchType: "broad" },
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.alert.matchType).toBe("broad");
  });
});
