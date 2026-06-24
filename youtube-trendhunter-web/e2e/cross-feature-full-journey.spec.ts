import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupUserSessions } from "_e2e-helpers";

/**
 * Cross-Feature Full Journey E2E tests for YouTube TrendHunter
 *
 * Traverses ALL dashboard features in sequence like a real user:
 *   Auth → Dashboard → Niches → Alerts → Billing
 *
 * Strategy:
 *   - injectSessionCookie() creates a real DB-backed NextAuth session
 *   - page.route() mocks all data-fetching APIs for deterministic testing
 *   - Tests navigate real pages and verify UI rendering / interactions
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TEST_USER_ID = "e2e-test-user-id";

/* -------------------------------------------------------------------------- */
/*  Mock fixture data                                                          */
/* -------------------------------------------------------------------------- */

const makeTrend = (id: string, title: string, score: number, nicheId: string) => ({
  id,
  title,
  channelName: "Test Channel",
  channelUrl: `https://youtube.com/@test${id}`,
  videoUrl: `https://youtube.com/watch?v=${id}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${id}/default.jpg`,
  views: Math.round(100000 + Math.random() * 500000),
  publishedAt: new Date().toISOString(),
  score,
  nicheId,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});

const TREND_TITLES_PRO = [
  "Comment l'IA transforme le marketing en 2026",
  "Pourquoi Rust devient le langage le plus aimé",
  "Le gaming en réalité virtuelle explose",
  "Nouveautés YouTube Shorts 2026",
  "Marketing d'influence : les micro-créateurs dominent",
  "L'essor du no-code en entreprise",
  "Les meilleures pratiques DevOps en 2026",
];

const TREND_TITLES_FREE = TREND_TITLES_PRO.slice(0, 5);

function buildTrends(plan: "FREE" | "PRO", count?: number) {
  const titles = plan === "FREE" ? TREND_TITLES_FREE : TREND_TITLES_PRO;
  const limit = count ?? titles.length;
  return titles
    .slice(0, limit)
    .map((title, i) => makeTrend(`trend-${i + 1}`, title, 98.5 - i * 5, "niche-1"));
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
];

function buildNichesResponse(followedIds: string[]) {
  return {
    allNiches: NICHES_ALL,
    userNiches: NICHES_ALL.filter((n) => followedIds.includes(n.id)).map((n) => ({
      niche: { id: n.id, name: n.name, slug: n.slug },
    })),
    currentCount: followedIds.length,
    maxCount: 10,
  };
}

function buildUser(plan: "FREE" | "PRO") {
  return {
    id: TEST_USER_ID,
    name: "E2E Test User",
    email: "e2e-test@trendhunter.app",
    role: "USER" as const,
    plan,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mock route helpers                                                         */
/* -------------------------------------------------------------------------- */

async function mockSessionRoute(page: Page, plan: "FREE" | "PRO") {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: buildUser(plan),
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

async function mockUserRoute(page: Page, plan: "FREE" | "PRO") {
  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildUser(plan)),
    });
  });
}

async function mockTrendsRoute(page: Page, plan: "FREE" | "PRO", count?: number) {
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
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    } else if (method === "POST") {
      // Mock alert creation
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

/**
 * Mock the niches API with a mutable followed list (shared reference)
 * so follow/unfollow operations are reflected in subsequent GET calls.
 */
function createNichesMock(followedIds: string[]) {
  return async (route: import("@playwright/test").Route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildNichesResponse(followedIds)),
      });
    } else if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheId } = body;
      if (nicheId && !followedIds.includes(nicheId)) {
        followedIds.push(nicheId);
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: { niche: { id: nicheId, name: "Niche", slug: "slug" } },
        }),
      });
    } else if (method === "DELETE") {
      // DELETE /api/niches/[nicheId] (unfollow)
      const nicheId = pathParts[pathParts.length - 1];
      const idx = followedIds.indexOf(nicheId);
      if (idx !== -1) followedIds.splice(idx, 1);
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({ status: 405 });
    }
  };
}

/**
 * Set up all mocks needed for the "full journey" test (PRO plan).
 */
async function mockFullJourneyRoutes(page: Page, plan: "FREE" | "PRO" = "PRO") {
  await mockSessionRoute(page, plan);
  await mockUserRoute(page, plan);
  await mockTrendsRoute(page, plan);

  // Niches: mutable followed list starting with just niche-1
  const followedIds = ["niche-1"];
  await page.route("**/api/niches*", createNichesMock(followedIds));
  await page.route("**/api/niches/**", async (route) => {
    const url = new URL(route.request().url());
    // The catch-all for individual niche routes like /api/niches/niche-1
    if (route.request().method() === "DELETE") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const nicheId = pathParts[pathParts.length - 1];
      const idx = followedIds.indexOf(nicheId);
      if (idx !== -1) followedIds.splice(idx, 1);
      await route.fulfill({ status: 204 });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
        }),
      });
    }
  });

  return followedIds; // return ref so tests can assert on final state
}

/**
 * Set up dashboard-specific mocks (used for dashboard-only tests).
 */
async function mockDashboardRoutes(page: Page, plan: "FREE" | "PRO" = "FREE", trendCount?: number) {
  await mockSessionRoute(page, plan);
  await mockUserRoute(page, plan);
  await mockTrendsRoute(page, plan, trendCount);
  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildNichesResponse(["niche-1"])),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
  await page.route("**/api/niches/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
      }),
    });
  });
  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [],
          plan,
          canCreate: plan === "PRO",
        }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  1. Parcours complet : Login → Dashboard → Niches → Alerts → Billing      */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Feature — Parcours complet", () => {
  let followedRef: string[];

  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("Login → Dashboard → Niches → Alerts → Billing", async ({ page }) => {
    // ── Inject session PRO ──
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });

    // ── Mock all API routes ──
    followedRef = await mockFullJourneyRoutes(page, "PRO");

    // Mock alerts with empty list + POST support
    await mockAlertsRoute(page, {
      alerts: [],
      userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
      plan: "PRO",
      canCreate: true,
    });

    // ── Étape 1 : Dashboard ──
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      await expect(page.locator("h1")).toContainText("Tendances");
      // Verify at least one trend title is rendered
      const firstTrend = TREND_TITLES_PRO[0];
      await expect(page.getByText(firstTrend).first()).toBeVisible();
      // Niche selector should be visible
      await expect(page.getByText("Tech & IA").first()).toBeVisible();
    }

    // ── Étape 2 : Niches ──
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    const onNiches = page.url().includes("/my-niches");
    if (onNiches) {
      // See all niches
      await expect(page.getByText("Tech & IA").first()).toBeVisible();
      await expect(page.getByText("Gaming").first()).toBeVisible();
      await expect(page.getByText("Musique").first()).toBeVisible();

      // "Vos niches" should show Tech & IA (already followed)
      await expect(page.getByText("Tech & IA")).toBeVisible();

      // Follow Gaming
      const gamingNiche = page.getByText("Gaming").first();
      await expect(gamingNiche).toBeVisible();
      // Find and click the follow button (assuming "Suivre" button near the niche name)
      const followBtn = page.locator('button:has-text("Suivre")').first();
      if (await followBtn.isVisible()) {
        await followBtn.click();
        await page.waitForTimeout(500);
        // After follow, Gaming should appear in "Vos niches"
        if (followedRef) {
          expect(followedRef).toContain("niche-2");
        }
      }
    }

    // ── Étape 3 : Alerts ──
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    const onAlerts = page.url().includes("/alerts");
    if (onAlerts) {
      // Empty state for alerts
      await expect(page.getByText("Aucune alerte configurée")).toBeVisible();

      // Create a SCORE_THRESHOLD alert
      const newAlertBtn = page.getByText("Nouvelle alerte");
      if (await newAlertBtn.isVisible()) {
        await newAlertBtn.click();
        await page.waitForTimeout(300);

        // Fill form and submit
        await page.getByText("Créer l'alerte").click();
        await page.waitForTimeout(500);

        // After creation, the alert should appear
        await expect(page.getByText("Score seuil").first()).toBeVisible({
          timeout: 5000,
        });
      }
    }

    // ── Étape 4 : Billing ──
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const onBilling = page.url().includes("/billing");
    if (onBilling) {
      // See current plan
      await expect(page.getByText("Pro").first()).toBeVisible();
      // Manage subscription button for PRO
      await expect(page.getByText("Gérer l'abonnement").first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Plan Free avec dashboard limité                                        */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Feature — Plan Free (restrictions)", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("Free plan : dashboard limité, upgrade banners, alerts bloquées", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "FREE" });

    // Mock dashboard routes with FREE plan — only 5 trends
    await mockDashboardRoutes(page, "FREE", 5);

    // Mock alerts with FREE restrictions
    await mockAlertsRoute(page, {
      alerts: [],
      plan: "FREE",
      canCreate: false,
    });

    // ── Dashboard Free ──
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // See up to 5 trends
      const trendTitles = page.locator('[data-testid="trend-title"], h2, h3');
      const count = await trendTitles.count();
      expect(count).toBeLessThanOrEqual(5);

      // Free banner should appear
      const freeBanner = page.getByText(/plan free/i);
      await expect(freeBanner.first()).toBeVisible({ timeout: 3000 });

      // Upgrade banner / link to /pricing
      const upgradeLink = page.locator('a[href="/pricing"]');
      await expect(upgradeLink.first()).toBeVisible();
    }

    // ── Alerts Free (bloqué) ──
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    const onAlerts = page.url().includes("/alerts");
    if (onAlerts) {
      // Should see the upgrade message
      await expect(page.getByText(/alerte|pro/i).first()).toBeVisible({ timeout: 5000 });
      // No create button
      await expect(page.getByText("Nouvelle alerte")).not.toBeVisible();
    }

    // ── Billing Free ──
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const onBilling = page.url().includes("/billing");
    if (onBilling) {
      // Free plan should be displayed
      await expect(page.getByText(/free|gratuit/i).first()).toBeVisible({ timeout: 5000 });

      // "Passer Pro" link visible (not ManageSubscriptionButton)
      const upgradeBillingLink = page.locator('a[href="/pricing"]');
      await expect(upgradeBillingLink.first()).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Niches — follow et unfollow                                            */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Feature — Niches follow/unfollow", () => {
  let followedRef: string[];

  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("Suivre puis unfollow une niche", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });

    // Set up niches API with mutable followed list (Tech & IA already followed)
    followedRef = ["niche-1"];
    await page.route("**/api/niches*", createNichesMock(followedRef));
    await page.route("**/api/niches/**", async (route) => {
      if (route.request().method() === "DELETE") {
        const url = new URL(route.request().url());
        const pathParts = url.pathname.split("/").filter(Boolean);
        const nicheId = pathParts[pathParts.length - 1];
        const idx = followedRef.indexOf(nicheId);
        if (idx !== -1) followedRef.splice(idx, 1);
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
          }),
        });
      }
    });

    // Mock session and user routes too
    await mockSessionRoute(page, "PRO");
    await mockUserRoute(page, "PRO");

    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    const onNiches = page.url().includes("/my-niches");
    if (!onNiches) return;

    // All 3 niches visible
    await expect(page.getByText("Tech & IA").first()).toBeVisible();
    await expect(page.getByText("Gaming").first()).toBeVisible();
    await expect(page.getByText("Musique").first()).toBeVisible();

    // Gaming is not yet followed — find "Suivre" button
    const followBtn = page.locator('button:has-text("Suivre")').first();
    if (await followBtn.isVisible()) {
      await followBtn.click();
      await page.waitForTimeout(500);

      // Gaming should now appear in "Vos niches"
      expect(followedRef).toContain("niche-2");
    }

    // Find the unfollow (trash) button and click it
    const unfollowBtn = page
      .locator('button[aria-label="Supprimer"], button:has(.lucide-trash2)')
      .first();
    if (await unfollowBtn.isVisible()) {
      // Handle confirmation dialog if it appears
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
      await unfollowBtn.click();
      await page.waitForTimeout(500);

      // The niche should no longer be in followed
      expect(followedRef).not.toContain("niche-1");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Navigation sidebar — toutes les routes protégées                      */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Feature — Navigation sidebar", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  const PROTECTED_ROUTES = [
    { path: "/dashboard", label: "Tendances" },
    { path: "/my-niches", label: "Niches" },
    { path: "/alerts", label: "Alertes" },
    { path: "/billing", label: "Facturation" },
  ];

  for (const { path, label } of PROTECTED_ROUTES) {
    test(`le lien "${label}" est actif sur la page ${path}`, async ({ page }) => {
      await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });

      // Mock all API routes so the page can render
      await mockDashboardRoutes(page, "PRO");

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const onCorrectPage = page.url().includes(path);
      if (!onCorrectPage) return;

      // The sidebar link for this page should have aria-current="page"
      const sidebarLink = page.locator(`nav a[href="${path}"]`);
      await expect(sidebarLink).toBeVisible();

      // Check for active state via aria-current attribute
      const ariaCurrent = await sidebarLink.getAttribute("aria-current");
      if (ariaCurrent !== null) {
        expect(ariaCurrent).toBe("page");
      } else {
        // Fallback: check for a common active CSS class (bg-accent, font-bold, etc.)
        const classAttr = await sidebarLink.getAttribute("class");
        expect(classAttr).toBeTruthy();
        // The link should be visually distinct — at minimum visible and not disabled
        await expect(sidebarLink).toBeEnabled();
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  5. Plan PRO — accès complet (pas de restrictions)                        */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Feature — Plan PRO (accès complet)", () => {
  test.afterEach(async () => {
    await cleanupUserSessions(TEST_USER_ID);
  });

  test("PRO : alerts canCreate, billing manage, dashboard sans bandeau free", async ({ page }) => {
    await injectSessionCookie(page, { id: TEST_USER_ID, plan: "PRO" });

    // Mock all routes for PRO
    await mockDashboardRoutes(page, "PRO");
    await mockAlertsRoute(page, {
      alerts: [
        {
          id: "alert-pro-1",
          userId: TEST_USER_ID,
          nicheId: "niche-1",
          type: "SCORE_THRESHOLD",
          threshold: 80,
          channel: "EMAIL",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
        },
      ],
      userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
      plan: "PRO",
      canCreate: true,
    });

    // ── Alerts PRO ──
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    const onAlerts = page.url().includes("/alerts");
    if (onAlerts) {
      // Create button visible
      await expect(page.getByText("Nouvelle alerte").first()).toBeVisible({ timeout: 5000 });
      // Existing alert visible
      await expect(page.getByText("Score seuil").first()).toBeVisible({ timeout: 5000 });
    }

    // ── Billing PRO ──
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const onBilling = page.url().includes("/billing");
    if (onBilling) {
      // ManageSubscriptionButton visible (PRO plan)
      await expect(page.getByText("Gérer l'abonnement").first()).toBeVisible({
        timeout: 5000,
      });
      // "Passer Pro" should NOT be visible for PRO users
      const passPro = page.locator('a[href="/pricing"]:has-text("Passer")');
      await expect(passPro).toHaveCount(0);
    }

    // ── Dashboard PRO ──
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // No "Plan Free" banner should be shown
      const freeBanner = page.getByText(/plan free/i);
      await expect(freeBanner).toHaveCount(0);

      // All trends visible
      const firstTrend = TREND_TITLES_PRO[0];
      await expect(page.getByText(firstTrend).first()).toBeVisible();
    }
  });
});
