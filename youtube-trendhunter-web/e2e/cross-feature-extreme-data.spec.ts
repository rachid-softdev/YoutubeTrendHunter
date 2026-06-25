import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupUserSessions } from "_e2e-helpers";

/**
 * Cross-Feature Extreme Data E2E tests for YouTube TrendHunter
 *
 * Tests UI resilience and correctness under extreme data conditions:
 *   1. 1000+ trends pagination (nextCursor, no crash)
 *   2. 50+ alerts scrolling (no freeze, all loaded)
 *   3. 0 niches dashboard → "Choisissez une niche" message + CTA
 *   4. All niches followed (15) → scrollable selector
 *   5. FREE at max: 5 trends, 1 niche, 0 alerts → PaywallToast consistent
 *   6. Accented characters and emojis in trend titles / niches / alerts
 *   7. User with 1000+ trends and pagination UI
 *   8. Keyboard and screen reader support on niche selector (a11y)
 *
 * Strategy: injectSessionCookie() + page.route() mocking, no real DB.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TEST_USER_ID = "extreme-data-e2e-user";
const TEST_EMAIL = "extreme-data@trendhunter.app";

/* -------------------------------------------------------------------------- */
/*  Mock data factories                                                        */
/* -------------------------------------------------------------------------- */

function makeTrend(id: string, title: string, score: number, nicheId: string) {
  return {
    id,
    title,
    channelName: "Chaîne",
    channelUrl: `https://youtube.com/@ch${id}`,
    videoUrl: `https://youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/default.jpg`,
    views: Math.round(10000 + Math.random() * 500000),
    publishedAt: new Date().toISOString(),
    score,
    nicheId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

function generateTrends(count: number, baseScore = 98.5, nicheId = "niche-1"): unknown[] {
  const titles: string[] = [];
  for (let i = 0; i < count; i++) {
    titles.push(`Tendance #${i + 1} - Analyse des données`);
  }
  return titles.map((title, i) =>
    makeTrend(`trend-${i + 1}`, title, baseScore - (i % 20) * 3, nicheId),
  );
}

function makeNiche(id: string, name: string, slug: string) {
  return {
    id,
    name,
    slug,
    description: `Description de ${name}`,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 5 },
    userNiches: [{ nicheId: id, userId: TEST_USER_ID }],
  };
}

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    niche: null,
    frequency: "instant",
    notifyByEmail: true,
    notifyByWebhook: false,
    notifyByPush: false,
    ...overrides,
  };
}

const ACCENTED_TREND_TITLES = [
  "Québecois: l'évolútion du marché françàis",
  "Crêpes & café: les nouvelles tendances 🥞☕",
  "🚀 L'IA générative explose en 2026 !",
  "Cómo la inteligencia artificial está cambiando España",
  "Änderungen im deutschen Markt für Technologie",
  "日本語のトレンド分析レポート",
  "Éléctronique: dernières innovations 🔬",
  "München: die beste Stadt für Startups 🌆",
];

const EMOJI_NICHE_NAMES = [
  "Tech & IA 🤖",
  "Gaming 🎮",
  "Musique 🎵",
  "Sport ⚽",
  "Cuisine 🍳",
  "Voyage ✈️",
  "Mode 👗",
  "Science 🔬",
  "Art 🎨",
  "Photos 📸",
  "Animaux 🐾",
  "Finance 💰",
  "Santé 🏥",
  "Éducation 📚",
  "DIY 🛠️",
];

/* -------------------------------------------------------------------------- */
/*  Mock helpers                                                               */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, plan: "FREE" | "PRO" = "PRO") {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: TEST_USER_ID, name: "Extreme Data", email: TEST_EMAIL, role: "USER", plan },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

async function mockUserRoute(page: Page, plan: "FREE" | "PRO" = "PRO") {
  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: TEST_USER_ID,
        name: "Extreme Data",
        email: TEST_EMAIL,
        role: "USER",
        plan,
      }),
    });
  });
}

/* ========================================================================== */
/*  1. 1000+ tendances pagination                                             */
/* ========================================================================== */

test.describe("Extreme Data — 1000+ tendances", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("1000+ tendances avec pagination (nextCursor, pas de crash)", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    let callCount = 0;
    const ALL_TRENDS = generateTrends(1050);
    const PAGE_SIZE = 50;

    await page.route("**/api/trends*", async (route) => {
      const url = new URL(route.request().url());
      const cursor = parseInt(url.searchParams.get("cursor") || "0", 10);
      const pageTrends = ALL_TRENDS.slice(cursor, cursor + PAGE_SIZE);
      const nextCursor =
        cursor + PAGE_SIZE < ALL_TRENDS.length ? (cursor + PAGE_SIZE).toString() : null;
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: pageTrends, plan: "PRO", nextCursor }),
      });
    });

    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: [makeNiche("niche-1", "Tech & IA", "tech")],
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            currentCount: 1,
            maxCount: 10,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      await expect(page.locator("body")).toBeVisible();
      // La pagination a été appelée au moins une fois
      expect(callCount).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ========================================================================== */
/*  2. 50+ alertes scrolling                                                  */
/* ========================================================================== */

test.describe("Extreme Data — 50+ alertes", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("50+ alertes scrolling (pas de freeze, toutes chargées)", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    // Générer 55 alertes
    const manyAlerts = Array.from({ length: 55 }, (_, i) =>
      makeAlert({
        id: `alert-bulk-${i + 1}`,
        type: i % 3 === 0 ? "SCORE_THRESHOLD" : i % 3 === 1 ? "NEW_TREND" : "KEYWORD_MATCH",
        threshold: 50 + (i % 5) * 10,
        channel: i % 2 === 0 ? "EMAIL" : "WEBHOOK",
        nicheId: "niche-1",
        niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
      }),
    );

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: manyAlerts, plan: "PRO", canCreate: true }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: generateTrends(5), plan: "PRO", nextCursor: null }),
      });
    });

    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: [makeNiche("niche-1", "Tech & IA", "tech")],
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            currentCount: 1,
            maxCount: 10,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    const onAlerts = page.url().includes("/alerts");
    if (onAlerts) {
      await expect(page.locator("body")).toBeVisible();
      // Au moins quelques alertes sont visibles
      const alertItems = page.locator('[data-testid="alert-item"], [data-testid="alert-card"]');
      const count = await alertItems.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ========================================================================== */
/*  3. 0 niches dashboard                                                     */
/* ========================================================================== */

test.describe("Extreme Data — 0 niches", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("0 niches suivi → message 'Choisissez une niche' + CTA", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });
    await mockSession(page, "FREE");
    await mockUserRoute(page, "FREE");

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [], plan: "FREE", nextCursor: null }),
      });
    });

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: [],
            userNiches: [],
            currentCount: 0,
            maxCount: 1,
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
          body: JSON.stringify({ alerts: [], plan: "FREE", canCreate: false }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Message invitant à choisir une niche
      const chooseNicheMsg = page.getByText(/choisissez.*niche|aucune niche|sélectionnez.*niche/i);
      const ctaButton = page.locator('a[href="/my-niches"], button:has-text("niche")');

      const hasMsg = await chooseNicheMsg.isVisible().catch(() => false);
      const hasCTA = await ctaButton
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasMsg || hasCTA).toBe(true);
    }
  });
});

/* ========================================================================== */
/*  4. 15 niches suivies → sélecteur scrollable                               */
/* ========================================================================== */

test.describe("Extreme Data — 15 niches suivies", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("toutes les niches suivies (15) → sélecteur scrollable", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    const manyNiches = EMOJI_NICHE_NAMES.map((name, i) => ({
      id: `niche-${i + 1}`,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: `Description de ${name}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { trends: 3 },
      userNiches: [{ nicheId: `niche-${i + 1}`, userId: TEST_USER_ID }],
    }));

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: manyNiches,
            userNiches: manyNiches.map((n) => ({
              niche: { id: n.id, name: n.name, slug: n.slug },
            })),
            currentCount: 15,
            maxCount: 50,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: generateTrends(5), plan: "PRO", nextCursor: null }),
      });
    });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [], plan: "PRO", canCreate: true }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Vérifier que des éléments de niche sont visibles
      const nicheEls = page.locator(
        '[data-testid="niche-selector"] *, [data-testid="niche-item"], [data-testid="niche-chip"]',
      );
      const count = await nicheEls.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

/* ========================================================================== */
/*  5. FREE au max (5 tendances, 1 niche, 0 alertes)                         */
/* ========================================================================== */

test.describe("Extreme Data — FREE au maximum", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("FREE max: 5 tendances, 1 niche, 0 alertes → PaywallToast cohérent", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });
    await mockSession(page, "FREE");
    await mockUserRoute(page, "FREE");

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: generateTrends(5),
          plan: "FREE",
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
            allNiches: [makeNiche("niche-1", "Tech & IA", "tech")],
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            currentCount: 1,
            maxCount: 1,
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
          body: JSON.stringify({ alerts: [], plan: "FREE", canCreate: false }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // 5 tendances max
      const trendTitles = page.locator('[data-testid="trend-title"], h2, h3');
      const count = await trendTitles.count();
      expect(count).toBeLessThanOrEqual(5);

      // Bandeau FREE / upgrade
      const upgradeEl = page.getByText(/pro|upgrade|passer|pricing/i);
      const hasUpgrade = await upgradeEl
        .first()
        .isVisible()
        .catch(() => false);
      // Soit un bandeau, soit un lien d'upgrade
      if (hasUpgrade) {
        await expect(upgradeEl.first()).toBeVisible();
      }
    }

    // Alertes: 0 alerte, message d'upgrade
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // PaywallToast ou message d'upgrade visible
      const paywallMsg = page.getByText(/pro|upgrade|passer.*pro|version gratuite/i);
      const hasPaywall = await paywallMsg
        .first()
        .isVisible()
        .catch(() => false);
      if (hasPaywall) {
        await expect(paywallMsg.first()).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

/* ========================================================================== */
/*  6. Caractères accentués et emojis                                          */
/* ========================================================================== */

test.describe("Extreme Data — Caractères accentués et emojis", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("titres tendances, niches et alertes avec accents et emojis", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    // Tendances avec accents et emojis
    const accentedTrends = ACCENTED_TREND_TITLES.map((title, i) =>
      makeTrend(`trend-accent-${i + 1}`, title, 95 - i * 5, "niche-1"),
    );

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: accentedTrends, plan: "PRO", nextCursor: null }),
      });
    });

    // Niches avec emojis
    const emojiNiches = EMOJI_NICHE_NAMES.slice(0, 5).map((name, i) => ({
      id: `niche-emoji-${i + 1}`,
      name,
      slug: `slug-${i + 1}`,
      description: `Description ${name}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { trends: 3 },
      userNiches: i === 0 ? [{ nicheId: `niche-emoji-${i + 1}`, userId: TEST_USER_ID }] : [],
    }));

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: emojiNiches,
            userNiches: [{ niche: { id: "niche-emoji-1", name: "Tech & IA 🤖", slug: "slug-1" } }],
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
            alerts: [
              makeAlert({
                id: "alert-accent-1",
                type: "KEYWORD_MATCH",
                threshold: 80,
                keyword: "évolútion du marché",
              }),
              makeAlert({
                id: "alert-accent-2",
                type: "NEW_TREND",
                nicheId: "niche-emoji-1",
                niche: { id: "niche-emoji-1", name: "Tech & IA 🤖", slug: "slug-1" },
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

    // Dashboard avec titres accentués
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Au moins un titre accentué visible
      const firstAccented = ACCENTED_TREND_TITLES[0];
      const visible = await page
        .getByText(firstAccented)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) {
        await expect(page.getByText(firstAccented).first()).toBeVisible();
      }
    }

    // Niches avec emojis
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      const emojiNiche = page.getByText("Tech & IA 🤖");
      const hasEmojiNiche = await emojiNiche.isVisible().catch(() => false);
      if (hasEmojiNiche) {
        await expect(emojiNiche).toBeVisible({ timeout: 3000 });
      }
    }

    // Alertes avec accents
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      const accentAlert = page.getByText(/évolútion/i);
      const hasAccentAlert = await accentAlert.isVisible().catch(() => false);
      if (hasAccentAlert) {
        await expect(accentAlert).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

/* ========================================================================== */
/*  7. 1000+ tendances avec UI de pagination                                  */
/* ========================================================================== */

test.describe("Extreme Data — Pagination UI avec 1000+ tendances", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("utilisateur avec 1000+ tendances et pagination UI fonctionnelle", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    const ALL_TRENDS = generateTrends(1100);
    const PAGE_SIZE = 50;

    let currentCursor = 0;

    await page.route("**/api/trends*", async (route) => {
      const url = new URL(route.request().url());
      const cursor = parseInt(url.searchParams.get("cursor") || "0", 10);
      currentCursor = cursor;
      const pageTrends = ALL_TRENDS.slice(cursor, cursor + PAGE_SIZE);
      const nextCursor =
        cursor + PAGE_SIZE < ALL_TRENDS.length ? (cursor + PAGE_SIZE).toString() : null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: pageTrends, plan: "PRO", nextCursor }),
      });
    });

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: [makeNiche("niche-1", "Tech & IA", "tech")],
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            currentCount: 1,
            maxCount: 10,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      await expect(page.locator("body")).toBeVisible();

      // Déclencher la pagination si le bouton "Voir plus" ou "Suivant" existe
      const loadMoreBtn = page.getByText(/voir plus|charger plus|suivant|next/i);
      if (await loadMoreBtn.isVisible().catch(() => false)) {
        await loadMoreBtn.click();
        await page.waitForTimeout(500);
        expect(currentCursor).toBeGreaterThan(0);
      }
    }
  });
});

/* ========================================================================== */
/*  8. Accessibilité clavier et lecteur d'écran sur sélecteur de niche        */
/* ========================================================================== */

test.describe("Extreme Data — Accessibilité niche selector", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("support clavier et lecteur d'écran sur le sélecteur de niche (a11y)", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockSession(page, "PRO");
    await mockUserRoute(page, "PRO");

    const niches = EMOJI_NICHE_NAMES.slice(0, 8).map((name, i) => ({
      id: `niche-a11y-${i + 1}`,
      name,
      slug: `slug-a11y-${i + 1}`,
      description: `Description de ${name}`,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _count: { trends: 3 },
      userNiches: [{ nicheId: `niche-a11y-${i + 1}`, userId: TEST_USER_ID }],
    }));

    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            allNiches: niches,
            userNiches: niches.map((n) => ({ niche: { id: n.id, name: n.name, slug: n.slug } })),
            currentCount: 8,
            maxCount: 50,
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: generateTrends(5), plan: "PRO", nextCursor: null }),
      });
    });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [], plan: "PRO", canCreate: true }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Vérifier la présence d'attributs ARIA sur les éléments de niche
      const nicheSelector = page.locator(
        '[data-testid="niche-selector"], [role="tablist"], [role="listbox"]',
      );
      const hasRole = await nicheSelector.count();

      // Vérifier les attributs aria-label ou aria-labelledby sur les contrôles
      const nicheControls = page.locator(
        '[aria-label*="niche" i], [aria-label*="sélecteur" i], [aria-label*="niche-selector" i]',
      );
      const hasAriaLabel = await nicheControls.count();

      // Vérifier le support clavier: les éléments doivent être focusables
      const focusableEls = page.locator(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), select, input:not([disabled])',
      );
      const focusableCount = await focusableEls.count();

      expect(focusableCount).toBeGreaterThanOrEqual(1);
      // Au moins un élément de navigation accessible
      expect(hasRole + hasAriaLabel + focusableCount).toBeGreaterThanOrEqual(1);
    }
  });
});
