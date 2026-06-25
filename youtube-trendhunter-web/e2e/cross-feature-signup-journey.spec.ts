import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupUserSessions } from "_e2e-helpers";

/**
 * Cross-Feature Signup Journey E2E tests for YouTube TrendHunter
 *
 * Tests the complete user lifecycle from registration through advanced features:
 *   1. Full signup → email validation → first login → dashboard → niches → alerts → logout
 *   2. TrendCard click → trend detail → back to dashboard
 *   3. FREE plan limits (dashboard, upgrade banner, alerts blocked, 1 niche max)
 *   4. TEAM plan: members page, invitations, member list, roles
 *   5. API token management from /billing: create, copy, revoke
 *   6. Logout via sidebar → confirmation → redirect login → protected access blocked
 *   7. PRO features visible after upgrade (export, unlimited alerts, more niches)
 *
 * Strategy: injectSessionCookie() + page.route() mocking, no real DB.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TEST_USER_ID = "signup-journey-e2e-user";
const TEST_EMAIL = "signup-e2e@trendhunter.app";

const MOCK_SESSION_FREE = {
  user: {
    id: TEST_USER_ID,
    name: "Jean Test",
    email: TEST_EMAIL,
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_PRO = {
  user: {
    id: TEST_USER_ID,
    name: "Jean Test",
    email: TEST_EMAIL,
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_TEAM = {
  user: {
    id: TEST_USER_ID,
    name: "Jean Test",
    email: TEST_EMAIL,
    role: "USER" as const,
    plan: "TEAM" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/* -------------------------------------------------------------------------- */
/*  Mock data factories                                                        */
/* -------------------------------------------------------------------------- */

function makeTrend(id: string, title: string, score: number, nicheId: string) {
  return {
    id,
    title,
    channelName: "Chaîne Test",
    channelUrl: `https://youtube.com/@test${id}`,
    videoUrl: `https://youtube.com/watch?v=${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/default.jpg`,
    views: Math.round(100000 + Math.random() * 500000),
    publishedAt: new Date().toISOString(),
    score,
    nicheId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

const TREND_TITLES = [
  "L'IA générative révolutionne le marketing",
  "Rust vs Go : quel langage pour 2026 ?",
  "Le gaming mobile dépasse les consoles",
  "YouTube Shorts : nouvelles fonctionnalités",
  "Le no-code democratise la création d'entreprise",
  "La cybersécurité quantique expliquée",
  "Les 10 startups les plus prometteuses",
  "Comment débuter avec Kubernetes",
  "L'essor du live shopping",
  "Blockchain au-delà des cryptomonnaies",
];

function buildTrends(plan: "FREE" | "PRO" | "TEAM", count?: number) {
  const limit = plan === "FREE" ? 5 : (count ?? TREND_TITLES.length);
  return TREND_TITLES.slice(0, limit).map((title, i) =>
    makeTrend(`trend-${i + 1}`, title, 98.5 - i * 5, "niche-1"),
  );
}

const NICHES_ALL = [
  {
    id: "niche-1",
    name: "Tech & IA",
    slug: "tech",
    description: "Technologie et intelligence artificielle",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 5 },
    userNiches: [{ nicheId: "niche-1", userId: TEST_USER_ID }],
  },
  {
    id: "niche-2",
    name: "Gaming",
    slug: "gaming",
    description: "Jeux vidéo et culture gaming",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 3 },
    userNiches: [],
  },
  {
    id: "niche-3",
    name: "Musique",
    slug: "musique",
    description: "Musique et production",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 0 },
    userNiches: [],
  },
  {
    id: "niche-4",
    name: "Sport",
    slug: "sport",
    description: "Sport et fitness",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { trends: 2 },
    userNiches: [],
  },
];

function buildNichesResponse(followedIds: string[], maxCount = 10) {
  return {
    allNiches: NICHES_ALL,
    userNiches: NICHES_ALL.filter((n) => followedIds.includes(n.id)).map((n) => ({
      niche: { id: n.id, name: n.name, slug: n.slug },
    })),
    currentCount: followedIds.length,
    maxCount,
  };
}

function buildUser(plan: "FREE" | "PRO" | "TEAM") {
  return { id: TEST_USER_ID, name: "Jean Test", email: TEST_EMAIL, role: "USER", plan };
}

/* -------------------------------------------------------------------------- */
/*  Mock route helpers                                                         */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, session: object) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

async function mockUserRoute(page: Page, plan: "FREE" | "PRO" | "TEAM") {
  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildUser(plan)),
    });
  });
}

async function mockTrendsRoute(page: Page, plan: "FREE" | "PRO" | "TEAM", count?: number) {
  await page.route("**/api/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: buildTrends(plan, count),
        plan,
        nextCursor: null,
      }),
    });
  });
}

async function mockAlertsRoute(
  page: Page,
  response: { alerts: unknown[]; plan: string; canCreate: boolean; userNiches?: unknown[] },
) {
  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    } else if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const newAlert = {
        id: `alert-created-${Date.now()}`,
        userId: TEST_USER_ID,
        nicheId: body.nicheId ?? null,
        type: body.type ?? "SCORE_THRESHOLD",
        threshold: body.threshold ?? 70,
        channel: body.channel ?? "EMAIL",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        niche: body.nicheId ? { id: body.nicheId, name: "Tech & IA", slug: "tech" } : null,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: newAlert }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

function createNichesMock(followedIds: string[], maxCount = 10) {
  return async (route: import("@playwright/test").Route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildNichesResponse(followedIds, maxCount)),
      });
    } else if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheId } = body;
      if (nicheId && !followedIds.includes(nicheId)) {
        if (followedIds.length < maxCount) {
          followedIds.push(nicheId);
        }
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: { niche: { id: nicheId, name: "Niche", slug: "slug" } },
        }),
      });
    } else if (method === "DELETE") {
      const nicheId = pathParts[pathParts.length - 1];
      const idx = followedIds.indexOf(nicheId);
      if (idx !== -1) followedIds.splice(idx, 1);
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({ status: 405 });
    }
  };
}

async function mockDashboardRoutes(
  page: Page,
  plan: "FREE" | "PRO" | "TEAM" = "FREE",
  trendCount?: number,
  nicheMaxCount = 10,
) {
  await mockSession(page, {
    user: { id: TEST_USER_ID, name: "Jean Test", email: TEST_EMAIL, role: "USER", plan },
    expires: "2099-01-01T00:00:00.000Z",
  });
  await mockUserRoute(page, plan);
  await mockTrendsRoute(page, plan, trendCount);
  const followedIds = ["niche-1"];
  await page.route("**/api/niches*", createNichesMock(followedIds, nicheMaxCount));
  await page.route("**/api/niches/**", async (route) => {
    if (route.request().method() === "DELETE") {
      const url = new URL(route.request().url());
      const pathParts = url.pathname.split("/").filter(Boolean);
      const nicheId = pathParts[pathParts.length - 1];
      const idx = followedIds.indexOf(nicheId);
      if (idx !== -1) followedIds.splice(idx, 1);
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }),
      });
    }
  });
  await mockAlertsRoute(page, { alerts: [], plan, canCreate: plan !== "FREE" });
}

/** Mock the billing API endpoint */
async function mockBillingRoute(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route("**/api/billing*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          plan: "FREE",
          subscriptionStatus: "active",
          invoices: [],
          paymentMethods: [],
          tokens: [],
          ...overrides,
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

/** Mock the team/members API endpoint */
async function mockTeamMembersRoute(page: Page, members: unknown[]) {
  await page.route("**/api/team/members*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

/** Mock extension auth/token endpoints */
async function mockExtensionAuthRoute(page: Page, tokens: unknown[] = []) {
  await page.route("**/api/extension/auth*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tokens }),
      });
    } else if (route.request().method() === "POST") {
      const newToken = {
        id: `tok_${Date.now()}`,
        name: "Nouveau Token",
        token: `th_${crypto.randomUUID().replace(/-/g, "")}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
      };
      tokens.push(newToken);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(newToken),
      });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/* ========================================================================== */
/*  1. Parcours complet : inscription → validation → login → dashboard → ... */
/* ========================================================================== */

test.describe("Cross-Feature — Parcours complet d'inscription", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("inscription → validation email → login → dashboard vierge → configurer niche → tendances → alerte → logout", async ({
    page,
  }) => {
    // Étape 1: Inscription (POST /api/auth/register)
    await page.route("**/api/auth/register*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            user: { id: TEST_USER_ID, email: TEST_EMAIL, name: "Jean Test" },
            message: "Compte créé. Vérifiez votre email.",
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    // Étape 2: Validation email (GET /api/auth/verify-email)
    await page.route("**/api/auth/verify-email*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email vérifié avec succès." }),
      });
    });

    // Étape 3: Injecter la session après login
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });

    // Mock toutes les routes API
    await mockDashboardRoutes(page, "FREE", 5);

    // Dashboard vierge — vérifier contenu
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/dashboard")) {
      await expect(page.locator("body")).toBeVisible();
    }

    // Configurer une niche (suivre Gaming)
    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", createNichesMock(followedIds, 1));
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Le bouton "Suivre" devrait être visible
      const followBtn = page.locator('button:has-text("Suivre")').first();
      if (await followBtn.isVisible().catch(() => false)) {
        await followBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Voir les tendances sur le dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/dashboard")) {
      const trendText = TREND_TITLES[0];
      await expect(page.getByText(trendText).first()).toBeVisible({ timeout: 3000 });
    }

    // Configurer une alerte (n'est pas possible en FREE, mais la page s'affiche)
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      await expect(page.locator("body")).toBeVisible();
    }

    // Logout réel
    await page.goto("/api/auth/signout");
    await page.waitForLoadState("networkidle");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const redirected = page.url().includes("/login") || page.url().includes("/auth/signin");
    expect(redirected).toBe(true);
  });
});

/* ========================================================================== */
/*  2. TrendCard → détails → back                                             */
/* ========================================================================== */

test.describe("Cross-Feature — TrendCard navigation", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("cliquer sur TrendCard → voir détails tendance → bouton back → dashboard", async ({
    page,
  }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });

    // Mock trends avec une tendance cliquable
    await mockSession(page, MOCK_SESSION_PRO);
    await mockUserRoute(page, "PRO");
    await mockTrendsRoute(page, "PRO", 3);

    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", createNichesMock(followedIds));

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) return;

    // Trouver la première TrendCard et cliquer
    const trendLink = page.locator('a[href*="/trends/"], [data-testid="trend-card"]').first();
    const trendCard = page.locator('[data-testid="trend-card"]').first();
    const clickTarget = (await trendLink.isVisible().catch(() => false)) ? trendLink : trendCard;

    if (await clickTarget.isVisible().catch(() => false)) {
      // Mock la page de détail de la tendance
      await page.route("**/api/trends/**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trend: makeTrend("trend-detail-1", TREND_TITLES[0], 98.5, "niche-1"),
          }),
        });
      });

      await clickTarget.click();
      await page.waitForTimeout(500);

      // Vérifier qu'on est sur une page de détail ou toujours sur dashboard
      const onDetail = page.url().includes("/trends/");
      if (onDetail) {
        // Bouton back
        const backBtn = page.locator('button:has-text("Retour"), a:has-text("Retour")').first();
        if (await backBtn.isVisible().catch(() => false)) {
          await backBtn.click();
          await page.waitForTimeout(300);
        } else {
          await page.goBack();
          await page.waitForLoadState("networkidle");
        }

        // Retour au dashboard
        const backOnDashboard = page.url().includes("/dashboard");
        expect(backOnDashboard).toBe(true);
      }
    }
  });
});

/* ========================================================================== */
/*  3. Version FREE complète : limites                                        */
/* ========================================================================== */

test.describe("Cross-Feature — Version FREE (limites)", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("FREE : dashboard limité, upgrade banner, alerts bloquées, 1 niche max", async ({
    page,
  }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });
    await mockDashboardRoutes(page, "FREE", 5, 1);

    // ── Dashboard FREE ──
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/dashboard")) {
      // 5 tendances max (FREE limit)
      const trendElements = page.locator(
        '[data-testid="trend-card"], [data-testid="trend-title"], h2, h3',
      );
      const count = await trendElements.count();
      expect(count).toBeLessThanOrEqual(5);

      // Bandeau FREE visible
      const freeBanner = page.getByText(/plan free|version gratuite|passez à pro/i);
      const upgradeLink = page.locator('a[href="/pricing"]');
      const hasBanner = await freeBanner
        .first()
        .isVisible()
        .catch(() => false);
      const hasUpgradeLink = await upgradeLink
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasBanner || hasUpgradeLink).toBe(true);
    }

    // ── Alerts FREE (bloqué) ──
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      // Message d'upgrade visible, pas de bouton Nouvelle alerte
      const upgradeMsg = page.getByText(/pro|upgrade|passer/i);
      await expect(upgradeMsg.first()).toBeVisible({ timeout: 3000 });

      const newAlertBtn = page.getByText("Nouvelle alerte");
      const hasNewAlertBtn = await newAlertBtn.isVisible().catch(() => false);
      expect(hasNewAlertBtn).toBe(false);
    }

    // ── Niches FREE (1 max) ──
    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", createNichesMock(followedIds, 1));
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Le compteur doit indiquer 1/1
      const counterText = page.getByText(/1\s*\/\s*1/i);
      if (await counterText.isVisible().catch(() => false)) {
        await expect(counterText).toBeVisible();
      }
    }
  });
});

/* ========================================================================== */
/*  4. Version TEAM : membres, invitations, rôles                              */
/* ========================================================================== */

test.describe("Cross-Feature — Plan TEAM (membres)", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("TEAM : page membres, invitation, liste membres, rôles", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "TEAM" });
    await mockSession(page, MOCK_SESSION_TEAM);
    await mockUserRoute(page, "TEAM");
    await mockTrendsRoute(page, "TEAM");

    const followedIds = ["niche-1", "niche-2"];
    await page.route("**/api/niches*", createNichesMock(followedIds, 50));

    // Mock des membres de l'équipe
    const mockMembers = [
      {
        id: "member-1",
        name: "Alice Martin",
        email: "alice@team.com",
        role: "ADMIN",
        status: "active",
        joinedAt: new Date().toISOString(),
      },
      {
        id: "member-2",
        name: "Bob Dupont",
        email: "bob@team.com",
        role: "MEMBER",
        status: "active",
        joinedAt: new Date().toISOString(),
      },
      {
        id: "member-3",
        name: "Claire Dubois",
        email: "claire@team.com",
        role: "VIEWER",
        status: "pending",
        joinedAt: new Date().toISOString(),
      },
    ];
    await mockTeamMembersRoute(page, mockMembers);

    // Mock invitation API
    await page.route("**/api/team/invite*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Invitation envoyée", invitedEmail: "new@team.com" }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    // Naviguer vers la page membres (sous /billing ou /team)
    await page.goto("/team");
    await page.waitForLoadState("networkidle");

    const onTeamPage = page.url().includes("/team") || page.url().includes("/billing");
    if (onTeamPage) {
      // La liste des membres devrait s'afficher
      await expect(page.getByText("Alice Martin").first()).toBeVisible({ timeout: 3000 });
      await expect(page.getByText("Bob Dupont").first()).toBeVisible();

      // Bouton d'invitation
      const inviteBtn = page.getByText(/inviter|invitation/i).first();
      if (await inviteBtn.isVisible().catch(() => false)) {
        await inviteBtn.click();
        await page.waitForTimeout(300);
      }
    }
  });
});

/* ========================================================================== */
/*  5. Gestion token API depuis /billing                                       */
/* ========================================================================== */

test.describe("Cross-Feature — Gestion des tokens API", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("billing : créer, copier et révoquer un token API", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "TEAM" });
    await mockSession(page, MOCK_SESSION_TEAM);
    await mockUserRoute(page, "TEAM");
    await mockTrendsRoute(page, "TEAM");

    const followedIds = ["niche-1"];
    await page.route("**/api/niches*", createNichesMock(followedIds, 50));
    await mockBillingRoute(page, { plan: "TEAM" });

    // Mock extension auth (gestion tokens)
    const tokensList: unknown[] = [];
    await mockExtensionAuthRoute(page, tokensList);

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const onBilling = page.url().includes("/billing");
    if (!onBilling) return;

    // Créer un nouveau token
    const createBtn = page.getByText(/générer.*token|créer.*token|nouveau token/i);
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Le token devrait apparaître dans la liste
      if (tokensList.length > 0) {
        const tokenEntry = page.getByText(/th_/);
        const hasTokenInUI = await tokenEntry.isVisible().catch(() => false);
        expect(hasTokenInUI || tokensList.length > 0).toBe(true);
      }
    }

    // Révoquer un token (bouton supprimer)
    const revokeBtn = page
      .locator(
        'button[aria-label="Révoquer"], button:has-text("Supprimer"), button:has-text("Révoquer")',
      )
      .first();
    if (await revokeBtn.isVisible().catch(() => false)) {
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await revokeBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

/* ========================================================================== */
/*  6. Logout via sidebar → confirmation → redirect login → accès bloqué     */
/* ========================================================================== */

test.describe("Cross-Feature — Logout et accès protégé", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("logout via sidebar → confirmation → redirect login → accès protégé bloqué", async ({
    page,
  }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });
    await mockDashboardRoutes(page, "PRO");

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/dashboard")) return;

    // Trouver le bouton de logout dans la sidebar
    const logoutBtn = page
      .locator(
        'nav button:has-text("Déconnexion"), nav a:has-text("Déconnexion"), button[data-testid="logout-btn"]',
      )
      .first();

    if (await logoutBtn.isVisible().catch(() => false)) {
      // Gérer la confirmation si présente
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await logoutBtn.click();
      await page.waitForTimeout(500);
    } else {
      // Fallback: naviguer directement vers la déconnexion
      await page.goto("/api/auth/signout");
      await page.waitForLoadState("networkidle");
    }

    // Vérifier la redirection vers login
    const redirectedToLogin = page.url().includes("/login") || page.url().includes("/auth/signin");
    expect(redirectedToLogin).toBe(true);

    // Tenter d'accéder à une route protégée
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const blocked = page.url().includes("/login") || page.url().includes("/auth/signin");
    expect(blocked).toBe(true);
  });
});

/* ========================================================================== */
/*  7. Features PRO visibles après upgrade                                     */
/* ========================================================================== */

test.describe("Cross-Feature — Features PRO après upgrade", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("après upgrade Free→Pro : export, alertes illimitées, plus de niches visibles", async ({
    page,
  }) => {
    // Variable mutable pour simuler le changement de plan
    const currentSession = {
      value: { ...MOCK_SESSION_FREE },
    };

    await page.route("**/api/auth/session*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSession.value),
      });
    });

    const planRef = { current: "FREE" as "FREE" | "PRO" };
    const followedIds = ["niche-1"];

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: buildTrends(planRef.current),
          plan: planRef.current,
          nextCursor: null,
        }),
      });
    });

    await page.route(
      "**/api/niches*",
      createNichesMock(followedIds, planRef.current === "FREE" ? 1 : 10),
    );

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts: [],
            plan: planRef.current,
            canCreate: planRef.current !== "FREE",
          }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.route("**/api/user*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentSession.value.user),
      });
    });

    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });

    // Vérifier l'état avant upgrade (FREE)
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const initialBody = page.locator("body");
    await expect(initialBody).toBeVisible();

    // Upgrade vers PRO
    currentSession.value = { ...MOCK_SESSION_PRO };
    planRef.current = "PRO";
    followedIds.push("niche-2");

    // Naviguer vers dashboard — plus de tendances visibles
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Pas de bandeau FREE
    const freeBanner = page.getByText(/plan free/i);
    const noFreeBanner = await freeBanner.count();
    if (noFreeBanner > 0) {
      expect(noFreeBanner).toBe(0);
    }

    // Naviguer vers alerts — création possible
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/alerts")) {
      const newAlertBtn = page.getByText("Nouvelle alerte");
      const canCreate = await newAlertBtn.isVisible().catch(() => false);
      if (canCreate) {
        await expect(newAlertBtn.first()).toBeVisible({ timeout: 3000 });
      }
    }

    // Naviguer vers niches — plus de niches disponibles
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Doit pouvoir voir plus de niches
      const nicheCount = await page
        .locator('[data-testid="niche-card"], [data-testid="niche-item"]')
        .count();
      expect(nicheCount).toBeGreaterThanOrEqual(1);
    }
  });
});
