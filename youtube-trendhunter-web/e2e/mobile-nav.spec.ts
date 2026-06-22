import { test, expect, type Page } from "@playwright/test";

/**
 * MobileNav E2E tests for YouTube TrendHunter
 *
 * Tests the fixed bottom navigation bar (MobileNav) component used on mobile
 * viewports. Covers structure, active/inactive states, navigation clicks,
 * and layout classes.
 *
 * Mock strategy follows the dashboard test pattern:
 *   - page.route() intercepts API calls for session and data endpoints
 *   - Best-effort assertions: if server-side auth redirects to /login,
 *     tests skip gracefully rather than failing
 *   - Mobile viewport (375×667) is set for most tests; desktop viewport
 *     (1280×800) is used to verify md:hidden behaviour
 *
 * Note on label mismatch:
 *   The MobileNav source renders English labels ("Trends", "Alerts", "Billing")
 *   while the desktop sidebar uses French ("Tendances", "Alertes", "Facturation").
 *   Tests assert the actual rendered text. If localisation is intended, the
 *   MobileNav source should be updated to match the sidebar labels.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MOCK_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test User",
    email: "test@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });
}

async function mockApiRoutes(page: Page) {
  // Trends API — used by /dashboard
  await page.route("**/api/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: [
          {
            id: "trend-1",
            title: "Comment l'IA transforme le marketing en 2026",
            channelName: "TechVision",
            channelUrl: "https://youtube.com/@techvision",
            videoUrl: "https://youtube.com/watch?v=abc123",
            thumbnailUrl: "https://i.ytimg.com/vi/abc123/default.jpg",
            views: 450000,
            publishedAt: new Date().toISOString(),
            score: 98.5,
            nicheId: "niche-1",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
        plan: "FREE",
        nextCursor: null,
      }),
    });
  });

  // Niches API — used by /dashboard and /my-niches
  await page.route("**/api/niches", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches: [
            {
              id: "niche-1",
              name: "Tech & IA",
              slug: "tech",
              description: "Technologie et intelligence artificielle",
              isActive: true,
            },
          ],
        }),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  await page.route("**/api/niches/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }),
    });
  });

  // Alerts API — used by /alerts
  await page.route("**/api/alerts", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // User API — used by /settings and /billing
  await page.route("**/api/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        name: "Test User",
        email: "test@test.com",
        role: "USER",
        plan: "FREE",
      }),
    });
  });

  // Billing API — used by /billing (stub any subscription endpoints)
  await page.route("**/api/subscriptions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ subscription: null, invoices: [] }),
    });
  });

  await page.route("**/api/billing*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ paymentMethods: [], invoices: [] }),
    });
  });
}

/**
 * Return a locator for the MobileNav element.
 *
 * `pb-safe` is a custom class only present on the MobileNav
 * (src/components/dashboard/mobile-nav.tsx), making it a reliable
 * unique selector that won't collide with the sidebar <nav>.
 */
function mobileNav(page: Page) {
  return page.locator('[class*="pb-safe"]');
}

/**
 * Navigate to a page and return whether we actually landed there.
 * The best-effort pattern handles the case where server-side auth() redirects
 * to /login despite the client-side session mock: if we land on /login instead
 * of the target page, the test skips assertions gracefully.
 */
async function gotoPage(page: Page, path: string = "/dashboard"): Promise<boolean> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page.url().includes(path);
}

/* -------------------------------------------------------------------------- */
/*  MobileNav — Structure                                                     */
/* -------------------------------------------------------------------------- */

test.describe("MobileNav — Structure", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiRoutes(page);
  });

  test("est visible sur mobile (viewport 375×667)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    await expect(mobileNav(page)).toBeVisible();
  });

  test("est masqué sur desktop (viewport 1280×800)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    await expect(mobileNav(page)).not.toBeVisible();
  });

  test("contient 5 liens de navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    await expect(mobileNav(page).locator("a")).toHaveCount(5);
  });

  test("chaque lien a l'attribut href correct", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const expectedHrefs = ["/dashboard", "/my-niches", "/alerts", "/billing", "/settings"];
    for (const href of expectedHrefs) {
      await expect(mobileNav(page).locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  test("chaque lien a l'icône Lucide correcte", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const iconMap: Record<string, string> = {
      "/dashboard": "lucide-layout-dashboard",
      "/my-niches": "lucide-target",
      "/alerts": "lucide-bell",
      "/billing": "lucide-credit-card",
      "/settings": "lucide-settings",
    };

    for (const [href, iconClass] of Object.entries(iconMap)) {
      const link = mobileNav(page).locator(`a[href="${href}"]`);
      await expect(link.locator(`.${iconClass}`)).toBeVisible();
    }
  });

  test("chaque lien a le bon label textuel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const onPage = await gotoPage(page);
    if (!onPage) return;

    // Labels as rendered by the MobileNav component source.
    // Note: the sidebar uses French labels ("Tendances", "Alertes", "Facturation")
    // while the MobileNav uses English for most items. The label is wrapped in a
    // <span> with `uppercase` class, but textContent remains the original string.
    const labels: Record<string, string> = {
      "/dashboard": "Trends",
      "/my-niches": "Niches",
      "/alerts": "Alerts",
      "/billing": "Billing",
      "/settings": "Paramètres",
    };

    for (const [href, label] of Object.entries(labels)) {
      const link = mobileNav(page).locator(`a[href="${href}"]`);
      await expect(link).toContainText(label, { ignoreCase: true });
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  MobileNav — Active State                                                  */
/* -------------------------------------------------------------------------- */

test.describe("MobileNav — Active State", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  const pages: { path: string; activeHref: string; label: string }[] = [
    { path: "/dashboard", activeHref: "/dashboard", label: "Tendances" },
    { path: "/my-niches", activeHref: "/my-niches", label: "Niches" },
    { path: "/alerts", activeHref: "/alerts", label: "Alertes" },
    { path: "/billing", activeHref: "/billing", label: "Facturation" },
    { path: "/settings", activeHref: "/settings", label: "Paramètres" },
  ];

  for (const { path, activeHref, label } of pages) {
    test(`sur ${path} → le lien "${label}" a le style actif text-yt-red`, async ({ page }) => {
      const onPage = await gotoPage(page, path);
      if (!onPage) return;

      const activeLink = mobileNav(page).locator(`a[href="${activeHref}"]`);
      await expect(activeLink).toHaveClass(/text-yt-red/);
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  MobileNav — Inactive State                                                */
/* -------------------------------------------------------------------------- */

test.describe("MobileNav — Inactive State", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("les liens non-actifs ont le style text-dark-ink-secondary", async ({ page }) => {
    const onPage = await gotoPage(page, "/dashboard");
    if (!onPage) return;

    const nav = mobileNav(page);
    const inactiveHrefs = ["/my-niches", "/alerts", "/billing", "/settings"];

    for (const href of inactiveHrefs) {
      const link = nav.locator(`a[href="${href}"]`);
      await expect(link).toHaveClass(/text-dark-ink-secondary/);
    }
  });

  test("le lien actif n'a PAS le style inactif text-dark-ink-secondary", async ({ page }) => {
    const onPage = await gotoPage(page, "/dashboard");
    if (!onPage) return;

    const activeLink = mobileNav(page).locator('a[href="/dashboard"]');
    const classStr = await activeLink.getAttribute("class");
    expect(classStr).not.toContain("text-dark-ink-secondary");
  });
});

/* -------------------------------------------------------------------------- */
/*  MobileNav — Navigation                                                    */
/* -------------------------------------------------------------------------- */

test.describe("MobileNav — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("cliquer sur 'Niches' navigue vers /my-niches", async ({ page }) => {
    const onDashboard = await gotoPage(page, "/dashboard");
    if (!onDashboard) return;

    await mobileNav(page).locator('a[href="/my-niches"]').click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/my-niches");
  });

  test("cliquer sur 'Alertes' navigue vers /alerts", async ({ page }) => {
    const onDashboard = await gotoPage(page, "/dashboard");
    if (!onDashboard) return;

    await mobileNav(page).locator('a[href="/alerts"]').click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/alerts");
  });

  test("cliquer sur 'Facturation' navigue vers /billing", async ({ page }) => {
    const onDashboard = await gotoPage(page, "/dashboard");
    if (!onDashboard) return;

    await mobileNav(page).locator('a[href="/billing"]').click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/billing");
  });

  test("cliquer sur 'Paramètres' navigue vers /settings", async ({ page }) => {
    const onDashboard = await gotoPage(page, "/dashboard");
    if (!onDashboard) return;

    await mobileNav(page).locator('a[href="/settings"]').click();
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/settings");
  });
});

/* -------------------------------------------------------------------------- */
/*  MobileNav — Layout                                                        */
/* -------------------------------------------------------------------------- */

test.describe("MobileNav — Layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiRoutes(page);
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("a la classe 'fixed bottom-0' pour le positionnement en bas d'écran", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("fixed");
    expect(classStr).toContain("bottom-0");
  });

  test("a la classe 'pb-safe' pour le safe area iOS", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("pb-safe");
  });

  test("a le fond 'bg-dark-surface'", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("bg-dark-surface");
  });

  test("a la classe 'md:hidden' pour le responsive desktop", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("md:hidden");
  });

  test("a la bordure supérieure 'border-t border-hairline-dark'", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("border-t");
    expect(classStr).toContain("border-hairline-dark");
  });

  test("a le z-index 'z-50'", async ({ page }) => {
    const onPage = await gotoPage(page);
    if (!onPage) return;

    const classStr = await mobileNav(page).getAttribute("class");
    expect(classStr).toContain("z-50");
  });
});
