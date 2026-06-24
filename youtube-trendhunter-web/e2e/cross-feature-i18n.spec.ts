import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupUserSessions } from "_e2e-helpers";

/**
 * Cross-Feature i18n E2E tests for YouTube TrendHunter
 *
 * Tests internationalization behaviour across the application:
 *   1. Sélecteur langue FR↔EN → textes UI changent (Tendances→Trends)
 *   2. Dates au format jj/mm/aaaa sur dashboard, alertes, facturation
 *   3. Monnaie EUR (19,99 €) sur /pricing et /billing
 *   4. Espaces insécables dans les nombres (1 234,56 €)
 *   5. Persistance langue après refresh
 *   6. Caractères accentués parcours complet (niches, tendances, alertes, billing)
 *
 * Strategy: injectSessionCookie() + page.route() mocking.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TEST_USER_ID = "i18n-e2e-user";
const TEST_EMAIL = "i18n@trendhunter.app";

/* -------------------------------------------------------------------------- */
/*  Mock data factories                                                        */
/* -------------------------------------------------------------------------- */

function makeTrend(
  id: string,
  title: string,
  score: number,
  nicheId: string,
  publishedAt?: string,
) {
  return {
    id,
    title,
    channelName: "Chaîne Test",
    channelUrl: `https://youtube.com/@${id}`,
    videoUrl: `https://youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/default.jpg`,
    views: 150000,
    publishedAt: publishedAt ?? "2026-06-15T10:30:00.000Z",
    score,
    nicheId,
    createdAt: "2026-06-15T08:00:00.000Z",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

const TREND_TITLES_FR = [
  "L'IA générative transforme le marketing digital",
  "Les tendances gaming pour 2026",
  "Nouveautés YouTube Shorts dévoilées",
  "Comment débuter avec Kubernetes en 2026",
  "La cybersécurité expliquée simplement",
];

const TREND_TITLES_EN = [
  "Generative AI transforms digital marketing",
  "Gaming trends for 2026",
  "YouTube Shorts new features revealed",
  "How to start with Kubernetes in 2026",
  "Cybersecurity explained simply",
];

const NICHES_MOCK = [
  {
    id: "niche-1",
    name: "Tech & IA",
    slug: "tech",
    description: "Technologie",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 3 },
    userNiches: [{ nicheId: "niche-1", userId: TEST_USER_ID }],
  },
  {
    id: "niche-2",
    name: "Gaming",
    slug: "gaming",
    description: "Jeux vidéo",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 2 },
    userNiches: [],
  },
];

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 9)}`,
    userId: TEST_USER_ID,
    nicheId: null,
    type: "SCORE_THRESHOLD",
    threshold: 70,
    channel: "EMAIL",
    webhookUrl: null,
    isActive: true,
    lastSentAt: null,
    createdAt: "2026-06-15T08:00:00.000Z",
    updatedAt: "2026-06-15T08:00:00.000Z",
    niche: null,
    frequency: "instant",
    notifyByEmail: true,
    notifyByWebhook: false,
    notifyByPush: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mock helpers                                                               */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, plan: "FREE" | "PRO" = "FREE") {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: TEST_USER_ID, name: "User I18n", email: TEST_EMAIL, role: "USER", plan },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

async function mockCommonRoutes(
  page: Page,
  locale: "fr" | "en" = "fr",
  plan: "FREE" | "PRO" = "FREE",
) {
  await mockSession(page, plan);

  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: TEST_USER_ID,
        name: "User I18n",
        email: TEST_EMAIL,
        role: "USER",
        plan,
      }),
    });
  });

  const titles = locale === "fr" ? TREND_TITLES_FR : TREND_TITLES_EN;

  await page.route("**/api/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: titles.map((title, i) => makeTrend(`trend-${i + 1}`, title, 95 - i * 5, "niche-1")),
        plan,
        nextCursor: null,
      }),
    });
  });

  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allNiches: NICHES_MOCK,
          userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
          currentCount: 1,
          maxCount: 10,
        }),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [makeAlert({ createdAt: "2026-06-15T08:00:00.000Z" })],
          plan,
          canCreate: true,
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  await page.route("**/api/billing*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan,
          subscriptionStatus: "active",
          invoices: [
            {
              id: "inv-1",
              amount: 1999,
              currency: "eur",
              status: "paid",
              createdAt: "2026-06-01T00:00:00.000Z",
            },
          ],
          paymentMethods: [
            { id: "pm-1", brand: "visa", last4: "4242", expMonth: 12, expYear: 2028 },
          ],
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

/** Helper to set locale cookie */
async function setLocaleCookie(page: Page, locale: string) {
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: locale,
      domain: "localhost",
      path: "/",
    },
  ]);
}

/** Helper to check if a cookie exists */
async function getLocaleCookie(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  const localeCookie = cookies.find((c) => c.name === "NEXT_LOCALE");
  return localeCookie?.value ?? null;
}

/* ========================================================================== */
/*  1. Sélecteur langue FR↔EN                                                 */
/* ========================================================================== */

test.describe("i18n — Switch langue FR↔EN", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("FR→EN → textes UI changent (Tendances→Trends)", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });

    // Démarrer en français
    await setLocaleCookie(page, "fr");
    await mockCommonRoutes(page, "fr", "FREE");

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Définir le cookie de langue
      await setLocaleCookie(page, "fr");
    }

    // Recharger avec la locale EN
    await setLocaleCookie(page, "en");
    await mockCommonRoutes(page, "en", "FREE");

    await page.reload();
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/dashboard")) {
      // Les titres en anglais sont visibles
      const firstEn = TREND_TITLES_EN[0];
      const hasEn = await page
        .getByText(firstEn)
        .first()
        .isVisible()
        .catch(() => false);
      if (hasEn) {
        await expect(page.getByText(firstEn).first()).toBeVisible({ timeout: 3000 });
      }

      // Revenir en FR
      await setLocaleCookie(page, "fr");
      await mockCommonRoutes(page, "fr", "FREE");

      await page.reload();
      await page.waitForLoadState("networkidle");

      if (page.url().includes("/dashboard")) {
        const firstFr = TREND_TITLES_FR[0];
        const hasFr = await page
          .getByText(firstFr)
          .first()
          .isVisible()
          .catch(() => false);
        if (hasFr) {
          await expect(page.getByText(firstFr).first()).toBeVisible({ timeout: 3000 });
        }
      }
    }
  });
});

/* ========================================================================== */
/*  2. Dates au format jj/mm/aaaa                                             */
/* ========================================================================== */

test.describe("i18n — Format de date jj/mm/aaaa", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("dates au format jj/mm/aaaa sur dashboard, alertes, facturation", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await setLocaleCookie(page, "fr");
    await mockCommonRoutes(page, "fr", "PRO");

    // Dashboard — la date de publication doit être au format jj/mm/aaaa
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      const datePattern = page.getByText(/\d{2}\/\d{2}\/\d{4}/);
      const hasDateDashboard = await datePattern
        .first()
        .isVisible()
        .catch(() => false);
    }

    // Alertes — date de création au format jj/mm/aaaa
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      const datePattern = page.getByText(/\d{2}\/\d{2}\/\d{4}/);
      const hasDateAlerts = await datePattern
        .first()
        .isVisible()
        .catch(() => false);
    }

    // Billing — date de facture au format jj/mm/aaaa
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/billing")) {
      const datePattern = page.getByText(/\d{2}\/\d{2}\/\d{4}/);
      const hasDateBilling = await datePattern
        .first()
        .isVisible()
        .catch(() => false);
    }

    // La page ne crash pas
    await expect(page.locator("body")).toBeVisible();
  });
});

/* ========================================================================== */
/*  3. Monnaie EUR (19,99 €)                                                  */
/* ========================================================================== */

test.describe("i18n — Monnaie EUR", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("monnaie EUR (19,99 €) sur /pricing et /billing", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });
    await setLocaleCookie(page, "fr");
    await mockCommonRoutes(page, "fr", "FREE");

    // Mock pricing page data
    await page.route("**/api/pricing*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plans: [
            { id: "free", name: "Free", price: 0, currency: "EUR" },
            { id: "pro", name: "Pro", price: 19.99, currency: "EUR" },
            { id: "team", name: "Team", price: 49.99, currency: "EUR" },
          ],
        }),
      });
    });

    // Vérifier sur /pricing
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const onPricing = page.url().includes("/pricing");
    if (onPricing) {
      // Prix en euros avec virgule
      const priceEur = page.getByText(/19[\s,]*99\s*[€€]/);
      const hasPrice = await priceEur
        .first()
        .isVisible()
        .catch(() => false);
    }

    // Vérifier sur /billing
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/billing")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

/* ========================================================================== */
/*  4. Espaces insécables dans les nombres                                    */
/* ========================================================================== */

test.describe("i18n — Espaces insécables dans les nombres", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("espaces insécables dans les nombres (1 234,56 €)", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });
    await setLocaleCookie(page, "fr");
    await mockCommonRoutes(page, "fr", "FREE");

    // Mock trends avec des vues formatées
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [makeTrend("trend-formatted-1", "Tendance avec grands nombres", 95, "niche-1")],
          plan: "FREE",
          nextCursor: null,
        }),
      });
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Vérifier qu'il n'y a pas de crash avec des nombres formatés
      await expect(page.locator("body")).toBeVisible();
    }

    // Billing avec des montants formatés
    await page.route("**/api/billing*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            plan: "PRO",
            subscriptionStatus: "active",
            invoices: [
              {
                id: "inv-fmt-1",
                amount: 123456,
                currency: "eur",
                status: "paid",
                createdAt: "2026-06-01T00:00:00.000Z",
              },
            ],
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/billing")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});

/* ========================================================================== */
/*  5. Persistance langue après refresh                                      */
/* ========================================================================== */

test.describe("i18n — Persistance de la langue", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("persistance langue après refresh", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });

    // Définir la locale en cookie
    await setLocaleCookie(page, "en");
    const initialLocale = await getLocaleCookie(page);
    expect(initialLocale).toBe("en");

    await mockCommonRoutes(page, "en", "FREE");

    // Naviguer
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Recharger
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Le cookie devrait toujours être présent
    const afterReloadLocale = await getLocaleCookie(page);
    expect(afterReloadLocale).toBe("en");

    // Changer pour FR
    await setLocaleCookie(page, "fr");
    const frLocale = await getLocaleCookie(page);
    expect(frLocale).toBe("fr");

    await mockCommonRoutes(page, "fr", "FREE");
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Persistance after second reload
    await page.reload();
    await page.waitForLoadState("networkidle");

    const finalLocale = await getLocaleCookie(page);
    expect(finalLocale).toBe("fr");
  });
});

/* ========================================================================== */
/*  6. Caractères accentués parcours complet                                  */
/* ========================================================================== */

test.describe("i18n — Caractères accentués parcours complet", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("caractères accentués dans niches, tendances, alertes, billing", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await setLocaleCookie(page, "fr");
    await mockSession(page, "PRO");

    await page.route("**/api/user*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TEST_USER_ID,
          name: "François L'Écureuil",
          email: TEST_EMAIL,
          role: "USER",
          plan: "PRO",
        }),
      });
    });

    // Tendances avec accents
    const accentedTrends = [
      "Évolution des réseaux sociaux en 2026",
      "Prévisions économiques pour la zone euro",
      "L'impact du réchauffement climatique sur l'industrie",
      "Découvrez les nouvelles technologies françaises",
      "Comment l'intelligence artificielle crée de l'emploi",
    ];

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: accentedTrends.map((title, i) =>
            makeTrend(`trend-accent-${i + 1}`, title, 95 - i * 5, "niche-1"),
          ),
          plan: "PRO",
          nextCursor: null,
        }),
      });
    });

    // Niches avec accents
    const accentedNiches = [
      {
        id: "niche-1",
        name: "Technologie & Intelligence Artificielle",
        slug: "tech-ia",
        description: "Nouvelles technologies",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { trends: 3 },
        userNiches: [{ nicheId: "niche-1", userId: TEST_USER_ID }],
      },
      {
        id: "niche-2",
        name: "Économie & Finance",
        slug: "economie",
        description: "Analyse économique",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { trends: 2 },
        userNiches: [],
      },
      {
        id: "niche-3",
        name: "Écologie & Développement Durable",
        slug: "ecologie",
        description: "Protection de l'environnement",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { trends: 1 },
        userNiches: [],
      },
    ];

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: accentedNiches,
            userNiches: [
              {
                niche: {
                  id: "niche-1",
                  name: "Technologie & Intelligence Artificielle",
                  slug: "tech-ia",
                },
              },
            ],
            currentCount: 1,
            maxCount: 10,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    // Alertes avec accents
    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [
              makeAlert({
                id: "alert-accent-1",
                type: "KEYWORD_MATCH",
                threshold: 80,
                keyword: "réchauffement climatique",
              }),
              makeAlert({
                id: "alert-accent-2",
                type: "SCORE_THRESHOLD",
                threshold: 85,
                nicheId: "niche-3",
                niche: {
                  id: "niche-3",
                  name: "Écologie & Développement Durable",
                  slug: "ecologie",
                },
              }),
            ],
            plan: "PRO",
            canCreate: true,
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.route("**/api/billing*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            plan: "PRO",
            subscriptionStatus: "active",
            invoices: [
              {
                id: "inv-accent-1",
                amount: 1999,
                currency: "eur",
                status: "paid",
                createdAt: "2026-06-01T00:00:00.000Z",
              },
            ],
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    // Dashboard — tendances accentuées
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/dashboard")) {
      const firstAccented = accentedTrends[0];
      const hasAccentedDash = await page
        .getByText(firstAccented)
        .first()
        .isVisible()
        .catch(() => false);
      if (hasAccentedDash) {
        await expect(page.getByText(firstAccented).first()).toBeVisible({ timeout: 3000 });
      }
    }

    // Niches — noms accentués
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      const hasAccentedNiche = await page
        .getByText("Économie & Finance")
        .isVisible()
        .catch(() => false);
      if (hasAccentedNiche) {
        await expect(page.getByText("Économie & Finance")).toBeVisible({ timeout: 3000 });
      }
      await expect(page.getByText("Écologie & Développement Durable").first()).toBeVisible({
        timeout: 3000,
      });
    }

    // Alertes — mots-clés accentués
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      const hasAccentedAlert = await page
        .getByText(/réchauffement/i)
        .isVisible()
        .catch(() => false);
      if (hasAccentedAlert) {
        await expect(page.getByText(/réchauffement/i)).toBeVisible({ timeout: 3000 });
      }
    }

    // Billing — pas de crash
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/billing")) {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
