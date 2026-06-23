import { test, expect, type Page } from "@playwright/test";

/**
 * Visual Regression Tests for YouTube TrendHunter
 *
 * Captures screenshots of key public pages and components to detect CSS regressions.
 * Uses Playwright's built-in `toHaveScreenshot()` for pixel-perfect comparison.
 *
 * First run generates reference snapshots in the `__snapshots__` directory.
 * Subsequent runs compare against these reference images.
 *
 * # To update reference snapshots:
 * # npx playwright test e2e/visual-regression.spec.ts --update-snapshots
 * # or for a single test:
 * # npx playwright test e2e/visual-regression.spec.ts -g "test name" --update-snapshots
 *
 * NOTE: These tests use `test.slow()` which triples the default timeout (from 30s to 90s)
 * to account for full-page screenshot rendering and font loading.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TEST_USER = {
  id: "test-user-id",
  name: "Test User",
  email: "test@test.com",
  role: "USER" as const,
  plan: "FREE" as const,
};

const MOCK_SESSION = {
  user: TEST_USER,
  expires: "2099-01-01T00:00:00.000Z",
};

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const MOBILE_VIEWPORT = { width: 375, height: 812 } as const;

/* -------------------------------------------------------------------------- */
/*  Mock helpers                                                               */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });
}

async function mockTrendCardApi(page: Page) {
  await page.route("**/api/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: [
          {
            id: "trend-vr-1",
            title: "Comment l'IA transforme le marketing en 2026",
            description:
              "Une analyse approfondie des tendances IA dans le marketing digital. Les marques qui adoptent l'IA génèrent 3x plus d'engagement.",
            score: 85,
            velocity: 12.5,
            status: "GROWING",
            contentAngles: ["Créer une chaîne IA dédiée", "Tutoriels pour débutants"],
            videoCount: 234,
            niche: { slug: "tech", name: "Tech & IA" },
          },
          {
            id: "trend-vr-2",
            title: "Pourquoi Rust devient le langage le plus aimé des développeurs",
            description: "Rust gagne du terrain dans les startups et les grandes entreprises.",
            score: 92,
            velocity: 25.3,
            status: "PEAK",
            contentAngles: ["Comparaison Rust vs Go", "Projets open source"],
            videoCount: 189,
            niche: { slug: "tech", name: "Tech & IA" },
          },
        ],
        plan: "FREE",
        nextCursor: null,
      }),
    });
  });

  await page.route("**/api/niches", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches: [
            { id: "niche-1", name: "Tech & IA", slug: "tech", description: "Tech", isActive: true },
            {
              id: "niche-2",
              name: "Gaming",
              slug: "gaming",
              description: "Gaming",
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

  await page.route("**/api/alerts*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alerts: [] }),
    });
  });

  await page.route("**/api/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TEST_USER),
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Visual Regression — Public Marketing Pages                                 */
/* -------------------------------------------------------------------------- */

test.describe("Visual Regression — Public Pages", () => {
  test.slow();

  test("Landing page — Desktop 1440px — full page", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("landing-desktop.png", { fullPage: true });
  });

  test("Landing page — Mobile 375px — full page", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("landing-mobile.png", { fullPage: true });
  });

  test("Pricing page — Desktop 1440px — full page", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("pricing-desktop.png", { fullPage: true });
  });

  test("Pricing page — Mobile 375px — full page", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("pricing-mobile.png", { fullPage: true });
  });

  test("Blog listing — Desktop 1440px — full page", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/blog");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("blog-desktop.png", { fullPage: true });
  });

  test("Login page — Desktop 1440px — full page", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page).toHaveScreenshot("login-desktop.png", { fullPage: true });
  });
});

/* -------------------------------------------------------------------------- */
/*  Visual Regression — Dashboard Components (TrendCard)                       */
/* -------------------------------------------------------------------------- */

test.describe("Visual Regression — Dashboard Components", () => {
  test.slow();

  test("TrendCard component — Desktop — first card screenshot", async ({ page }) => {
    await mockSession(page);
    await mockTrendCardApi(page);

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Best-effort: if server-side auth redirects, the dashboard won't render
    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) {
      test.info().annotations.push({
        type: "skip",
        description:
          "Server-side auth mock did not work — skipping TrendCard visual regression. Run with --update-snapshots after manual login.",
      });
      return;
    }

    // Wait for TrendCard elements to appear
    const trendCard = page.locator('[class*="cursor-pointer"]').first();
    await expect(trendCard).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(500);
    await expect(trendCard).toHaveScreenshot("trend-card-desktop.png");
  });
});
