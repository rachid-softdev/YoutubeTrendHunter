import { test, expect } from "./fixtures";
import {
  openSidepanel,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";
import type { BrowserContext, Page } from "@playwright/test";

/* ================================================================
 * Types
 * ================================================================ */

interface MockTrend {
  id?: string;
  title?: string;
  keyword?: string;
  score: number;
  videoCount?: number | string;
  velocity?: number;
  contentAngles?: string[];
  status?: string;
}

/* ================================================================
 * Helpers
 * ================================================================ */

/**
 * Mutable mock state — each test sets these before connecting.
 * Reset to defaults in beforeEach.
 */
let mockNiches: Array<{ slug: string; name: string }> = MOCK_NICHES;
let mockTrends: MockTrend[] = MOCK_TRENDS;
let mockPlan = "FREE";

/**
 * Helper: open the sidepanel, connect with a token, and wait for
 * the main screen to render.
 * Routes for the trends API must already be set up via context.route.
 */
async function connectAndWaitForMain(page: Page, extensionId: string) {
  const sidepanel = await openSidepanel(page, extensionId);
  await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });
  await sidepanel.connect("th_test_token");
  await expect(sidepanel.getMainScreen()).toBeVisible({ timeout: 8000 });
  return sidepanel;
}

/* ================================================================
 * Setup
 * ================================================================ */

test.beforeEach(async ({ context }) => {
  // Reset mock state to defaults
  mockNiches = MOCK_NICHES;
  mockTrends = MOCK_TRENDS;
  mockPlan = "FREE";

  // Intercept ALL requests to the trends API.
  // The background service worker fetches:
  //   - GET /api/extension/trends/niches        (from loadNiches)
  //   - GET /api/extension/trends?niche=…       (from GET_TRENDS handler)
  await context.route("**/api/extension/trends**", async (route) => {
    const url = route.request().url();

    if (url.includes("/trends/niches")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNiches),
      });
    } else {
      // Trends list endpoint
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: mockTrends,
          plan: mockPlan,
        }),
      });
    }
  });
});

/* ================================================================
 * UI Structure
 * ================================================================ */

test.describe("Main Screen — UI Structure", () => {
  test("shows header with logo SVG play icon and TrendHunter brand text", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getMainLogo()).toBeVisible();

    // SVG play icon path
    const svg = sidepanel.getMainLogoIcon();
    await expect(svg).toBeVisible();
    const pathD = await svg.locator("path").getAttribute("d");
    expect(pathD).toBe("M8 5v14l11-7z");

    // Brand text
    await expect(sidepanel.getMainLogoText()).toBeVisible();
    await expect(sidepanel.getMainLogoText()).toHaveText("TrendHunter");
  });

  test("plan badge is visible and shows correct plan text (FREE)", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "FREE";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getPlanBadge()).toBeVisible();
    await expect(sidepanel.getPlanBadge()).toHaveText("Plan FREE");
  });

  test("plan badge shows PRO plan text", async ({ page, extensionId }) => {
    mockPlan = "PRO";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getPlanBadge()).toBeVisible();
    await expect(sidepanel.getPlanBadge()).toHaveText("Plan PRO");
  });

  test("plan badge shows TEAM plan text", async ({ page, extensionId }) => {
    mockPlan = "TEAM";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getPlanBadge()).toBeVisible();
    await expect(sidepanel.getPlanBadge()).toHaveText("Plan TEAM");
  });

  test("niche selector dropdown is visible with Niche label", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    // The toolbar has a "Niche" label text and a select
    await expect(sidepanel.getNicheSelect()).toBeVisible();

    // Verify the label text exists in the toolbar
    await expect(page.locator(".main-toolbar")).toContainText("Niche");
  });

  test("niche dropdown has correct options from API response", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "finance", name: "Finance personnelle" },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const options = page.locator(".niche-select option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveValue("tech-ia");
    await expect(options.nth(0)).toHaveText("Tech & IA");
    await expect(options.nth(1)).toHaveValue("finance");
    await expect(options.nth(1)).toHaveText("Finance personnelle");
  });

  test("trends list renders trend cards", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Trend One",
        keyword: "one",
        score: 80,
        videoCount: 100,
        velocity: 10,
        contentAngles: ["Angle 1"],
      },
      {
        id: "2",
        title: "Trend Two",
        keyword: "two",
        score: 60,
        videoCount: 50,
        velocity: 5,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getTrendsList()).toBeVisible();
    await expect(sidepanel.getTrendCards()).toHaveCount(2);
  });

  test("each trend card has score badge, title, meta, and content angles toggle", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Full Trend Card",
        keyword: "full",
        score: 75,
        videoCount: 999,
        velocity: 50,
        contentAngles: ["Tuto", "Review"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);

    // Score badge
    await expect(card.locator(".trend-score")).toBeVisible();
    await expect(card.locator(".trend-score")).toHaveText("75");

    // Title
    await expect(card.locator(".trend-title")).toBeVisible();
    await expect(card.locator(".trend-title")).toHaveText("Full Trend Card");

    // Meta (video count + velocity)
    await expect(card.locator(".trend-meta")).toBeVisible();
    await expect(card.locator(".trend-meta")).toHaveText("999 vidéos · +50%");

    // Content angles toggle
    await expect(card.locator(".angle-toggle")).toBeVisible();
  });

  test("SE DÉCONNECTER button is visible in footer", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getLogoutButton()).toBeVisible();
    await expect(sidepanel.getLogoutButton()).toHaveText("SE DÉCONNECTER");
  });
});

/* ================================================================
 * Score Color Coding
 * ================================================================ */

test.describe("Main Screen — Score Color Coding", () => {
  test("score >= 75 has class score-hot", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Hot Trend",
        keyword: "hot",
        score: 85,
        videoCount: 100,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-hot/);
  });

  test("score 50-74 has class score-mid", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Mid Trend",
        keyword: "mid",
        score: 62,
        videoCount: 100,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-mid/);
  });

  test("score < 50 has class score-low", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Low Trend",
        keyword: "low",
        score: 35,
        videoCount: 100,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-low/);
  });

  test("boundary: score exactly 75 → score-hot", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Boundary Hot",
        keyword: "bh",
        score: 75,
        videoCount: 1,
        velocity: 1,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-hot/);
  });

  test("boundary: score exactly 74 → score-mid", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Boundary Mid 74",
        keyword: "bm74",
        score: 74,
        videoCount: 1,
        velocity: 1,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-mid/);
  });

  test("boundary: score exactly 50 → score-mid", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Boundary Mid 50",
        keyword: "bm50",
        score: 50,
        videoCount: 1,
        velocity: 1,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-mid/);
  });

  test("boundary: score exactly 49 → score-low", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Boundary Low 49",
        keyword: "bl49",
        score: 49,
        videoCount: 1,
        velocity: 1,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveClass(/score-low/);
  });
});

/* ================================================================
 * Content Angles
 * ================================================================ */

test.describe("Main Screen — Content Angles", () => {
  test("trend with contentAngles array shows toggle button", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "With Angles",
        keyword: "angles",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Tuto", "Review", "Comparison"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    const toggle = card.locator(".angle-toggle");
    await expect(toggle).toBeVisible();
  });

  test("toggle shows count of angles", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Count Test",
        keyword: "count",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["A", "B", "C", "D", "E"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const toggleCount = sidepanel
      .getTrendCards()
      .nth(0)
      .locator(".angle-toggle-count");
    await expect(toggleCount).toHaveText("5");
  });

  test("toggle click expands angle pills", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Expand Test",
        keyword: "expand",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Tuto", "Review"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    const toggle = card.locator(".angle-toggle");

    // Pills should initially NOT be visible
    await expect(card.locator(".angle-pills")).toHaveCount(0);

    // Click to expand
    await toggle.click();
    await expect(card.locator(".angle-pills")).toBeVisible();
    await expect(card.locator(".angle-pill")).toHaveCount(2);
    await expect(card.locator(".angle-pill").nth(0)).toHaveText("Tuto");
    await expect(card.locator(".angle-pill").nth(1)).toHaveText("Review");
  });

  test("toggle click collapses angle pills (expand then collapse)", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Collapse Test",
        keyword: "collapse",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["One", "Two"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    const toggle = card.locator(".angle-toggle");

    // Expand
    await toggle.click();
    await expect(card.locator(".angle-pills")).toBeVisible();

    // Collapse
    await toggle.click();
    await expect(card.locator(".angle-pills")).toHaveCount(0);
  });

  test("chevron icon rotates on expand", async ({ page, extensionId }) => {
    mockTrends = [
      {
        id: "1",
        title: "Chevron Test",
        keyword: "chevron",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Angle"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    const toggle = card.locator(".angle-toggle");
    const chevron = card.locator(".angle-chevron");

    // Before expand — no chevron-open class
    await expect(chevron).not.toHaveClass(/chevron-open/);

    // Expand
    await toggle.click();
    await expect(chevron).toHaveClass(/chevron-open/);

    // Collapse
    await toggle.click();
    await expect(chevron).not.toHaveClass(/chevron-open/);
  });

  test("toggle has aria-expanded attribute reflecting state", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Aria Test",
        keyword: "aria",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Angle"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const toggle = sidepanel.getTrendCards().nth(0).locator(".angle-toggle");

    // Initially collapsed
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Expand
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Collapse
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("trend with empty contentAngles array shows no toggle", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Empty Angles",
        keyword: "empty",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: [],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    await expect(card.locator(".angle-toggle")).toHaveCount(0);
  });

  test("trend with undefined contentAngles shows no toggle", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Undefined Angles",
        keyword: "undefined",
        score: 70,
        videoCount: 10,
        velocity: 5,
        // contentAngles is intentionally omitted
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    await expect(card.locator(".angle-toggle")).toHaveCount(0);
  });

  test("trend with null contentAngles shows no toggle", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Null Angles",
        keyword: "null",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: null as unknown as undefined,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    await expect(card.locator(".angle-toggle")).toHaveCount(0);
  });

  test("angle toggle shows label 'Angles de contenu'", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Label Test",
        keyword: "label",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["A"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const label = sidepanel
      .getTrendCards()
      .nth(0)
      .locator(".angle-toggle-label");
    await expect(label).toHaveText("Angles de contenu");
  });
});

/* ================================================================
 * Empty / Null States
 * ================================================================ */

test.describe("Main Screen — Empty & Null States", () => {
  test("empty trends array shows 'Aucune tendance trouvée pour cette niche.' message", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getEmptyState()).toBeVisible();
    await expect(sidepanel.getEmptyState()).toContainText(
      "Aucune tendance trouvée pour cette niche."
    );
  });

  test("trend with null title falls back to keyword", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: null as unknown as string,
        keyword: "fallback-keyword",
        score: 50,
        videoCount: 10,
        velocity: 5,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("fallback-keyword");
  });

  test("trend with null title and null keyword falls back to 'Sans titre'", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: null as unknown as string,
        keyword: null as unknown as string,
        score: 50,
        videoCount: 10,
        velocity: 5,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("Sans titre");
  });

  test("trend with null videoCount shows '?' fallback", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "No Video Count",
        keyword: "no-vc",
        score: 50,
        videoCount: null as unknown as number,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-meta")
    ).toContainText("? vidéos");
  });

  test("trend with null velocity shows '+0%' fallback", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "No Velocity",
        keyword: "no-vel",
        score: 50,
        videoCount: 10,
        velocity: null as unknown as number,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-meta")
    ).toContainText("+0%");
  });
});

/* ================================================================
 * Plan Enforcement
 * ================================================================ */

test.describe("Main Screen — Plan Enforcement", () => {
  test("FREE plan shows upgrade banner with correct text", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "FREE";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getUpgradeBanner()).toBeVisible();
    await expect(sidepanel.getUpgradeBanner()).toContainText(
      "Passez en Pro pour plus de tendances !"
    );
  });

  test("FREE plan upgrade banner has 'Voir les offres' link", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "FREE";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getUpgradeLink()).toBeVisible();
    await expect(sidepanel.getUpgradeLink()).toHaveText("Voir les offres");
  });

  test("upgrade link has correct href and target=_blank", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "FREE";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getUpgradeLink()).toHaveAttribute(
      "href",
      "https://trendhunter.app/pricing"
    );
    await expect(sidepanel.getUpgradeLink()).toHaveAttribute("target", "_blank");
    await expect(sidepanel.getUpgradeLink()).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
  });

  test("PRO plan shows NO upgrade banner", async ({ page, extensionId }) => {
    mockPlan = "PRO";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getUpgradeBanner()).toHaveCount(0);
  });

  test("TEAM plan shows NO upgrade banner", async ({ page, extensionId }) => {
    mockPlan = "TEAM";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getUpgradeBanner()).toHaveCount(0);
  });

  test("plan badge shows correct plan string from API (PRO)", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "PRO";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getPlanBadge()).toHaveText("Plan PRO");
  });

  test("plan badge shows correct plan string from API (TEAM)", async ({
    page,
    extensionId,
  }) => {
    mockPlan = "TEAM";
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getPlanBadge()).toHaveText("Plan TEAM");
  });
});

/* ================================================================
 * Interactions
 * ================================================================ */

test.describe("Main Screen — Interactions", () => {
  test("logout button click clears token and shows auth screen", async ({
    page,
    extensionId,
  }) => {
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    // Click the logout button
    await sidepanel.logout();

    // Auth screen should be visible
    await expect(sidepanel.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Token should be cleared from storage
    const stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });

  test("niche selector change triggers trend reload with new data", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "finance", name: "Finance" },
    ];
    mockTrends = [
      {
        id: "1",
        title: "AI Trends",
        keyword: "ai",
        score: 80,
        videoCount: 100,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    // Verify initial trends
    await expect(sidepanel.getTrendCards()).toHaveCount(1);
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("AI Trends");

    // Update mock data to simulate different trends for the new niche
    mockTrends = [
      {
        id: "2",
        title: "Bitcoin Boom",
        keyword: "bitcoin",
        score: 90,
        videoCount: 200,
        velocity: 20,
      },
    ];

    // Change niche
    await sidepanel.selectNiche("finance");

    // Wait for new trends to render
    await expect(sidepanel.getTrendCards()).toHaveCount(1);
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("Bitcoin Boom");
  });

  test("content angle toggle click expands then collapses pills", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Toggle Interaction",
        keyword: "toggle",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Alpha", "Beta", "Gamma"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const card = sidepanel.getTrendCards().nth(0);
    const toggle = card.locator(".angle-toggle");

    // Initially collapsed
    await expect(card.locator(".angle-pills")).toHaveCount(0);

    // First click: expand
    await toggle.click();
    await expect(card.locator(".angle-pills")).toBeVisible();
    await expect(card.locator(".angle-pill")).toHaveCount(3);

    // Second click: collapse
    await toggle.click();
    await expect(card.locator(".angle-pills")).toHaveCount(0);
  });

  test("multiple angle toggles operate independently per trend card", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "First",
        keyword: "first",
        score: 70,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["A"],
      },
      {
        id: "2",
        title: "Second",
        keyword: "second",
        score: 60,
        videoCount: 20,
        velocity: 3,
        contentAngles: ["B", "C"],
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const toggles = page.locator(".angle-toggle");
    await expect(toggles).toHaveCount(2);

    // Expand first card's angles
    await toggles.nth(0).click();
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".angle-pills")
    ).toBeVisible();
    await expect(
      sidepanel.getTrendCards().nth(1).locator(".angle-pills")
    ).toHaveCount(0);

    // Expand second card's angles
    await toggles.nth(1).click();
    await expect(
      sidepanel.getTrendCards().nth(1).locator(".angle-pills")
    ).toBeVisible();
  });
});

/* ================================================================
 * Edge Cases
 * ================================================================ */

test.describe("Main Screen — Edge Cases", () => {
  test("renders many trends (10+) without errors", async ({
    page,
    extensionId,
  }) => {
    mockTrends = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      title: `Trend Number ${i + 1}`,
      keyword: `trend-${i + 1}`,
      score: 30 + (i * 5),
      videoCount: 10 * (i + 1),
      velocity: i * 2,
    }));
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getTrendCards()).toHaveCount(12);
  });

  test("renders very long trend title (100+ chars) without breaking", async ({
    page,
    extensionId,
  }) => {
    const longTitle =
      "Ceci est un titre de tendance extrêmement long qui dépasse largement les cent caractères afin de tester le comportement du composant avec des chaînes de caractères très longues";
    expect(longTitle.length).toBeGreaterThan(100);

    mockTrends = [
      {
        id: "1",
        title: longTitle,
        keyword: "long-title",
        score: 50,
        videoCount: 10,
        velocity: 5,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const titleEl = sidepanel.getTrendCards().nth(0).locator(".trend-title");
    await expect(titleEl).toBeVisible();
    // Title should contain all the text (might be truncated visually but DOM has full text)
    await expect(titleEl).toHaveText(longTitle);
  });

  test("handles special characters, unicode, and emoji in trend titles", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Café français — 100% élu #1 🏆",
        keyword: "cafe",
        score: 85,
        videoCount: 50,
        velocity: 15,
      },
      {
        id: "2",
        title: "日本語のトレンドテスト",
        keyword: "japanese",
        score: 60,
        videoCount: 30,
        velocity: 8,
      },
      {
        id: "3",
        title: "Русский заголовок & spécial €100 ↓↑",
        keyword: "russian",
        score: 40,
        videoCount: 20,
        velocity: 5,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getTrendCards()).toHaveCount(3);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("Café français — 100% élu #1 🏆");
    await expect(
      sidepanel.getTrendCards().nth(1).locator(".trend-title")
    ).toHaveText("日本語のトレンドテスト");
    await expect(
      sidepanel.getTrendCards().nth(2).locator(".trend-title")
    ).toHaveText("Русский заголовок & spécial €100 ↓↑");
  });

  test("multiple trends with same score value all render correctly", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Same Score A",
        keyword: "a",
        score: 75,
        videoCount: 10,
        velocity: 5,
      },
      {
        id: "2",
        title: "Same Score B",
        keyword: "b",
        score: 75,
        videoCount: 20,
        velocity: 10,
      },
      {
        id: "3",
        title: "Same Score C",
        keyword: "c",
        score: 75,
        videoCount: 30,
        velocity: 15,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getTrendCards()).toHaveCount(3);

    // All should have score-hot class
    const scoreBadges = page.locator(".trend-score.score-hot");
    await expect(scoreBadges).toHaveCount(3);
  });

  test("score 0 (minimum) renders correctly with score-low class", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Zero Score",
        keyword: "zero",
        score: 0,
        videoCount: 0,
        velocity: 0,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveText("0");
    await expect(scoreBadge).toHaveClass(/score-low/);
  });

  test("score 100 (maximum) renders correctly with score-hot class and trend-hot border", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Max Score",
        keyword: "max",
        score: 100,
        videoCount: 9999,
        velocity: 200,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    await expect(scoreBadge).toHaveText("100");
    await expect(scoreBadge).toHaveClass(/score-hot/);

    // Card should have the trend-hot class for scoring >= 75
    await expect(sidepanel.getTrendCards().nth(0)).toHaveClass(/trend-hot/);
  });

  test("niche with only 1 option in dropdown", async ({ page, extensionId }) => {
    mockNiches = [{ slug: "tech-ia", name: "Tech & IA" }];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const options = page.locator(".niche-select option");
    await expect(options).toHaveCount(1);
    await expect(options.nth(0)).toHaveValue("tech-ia");
    await expect(options.nth(0)).toHaveText("Tech & IA");
  });

  test("niche with many options (5+) all rendered", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "a", name: "Alpha" },
      { slug: "b", name: "Beta" },
      { slug: "c", name: "Gamma" },
      { slug: "d", name: "Delta" },
      { slug: "e", name: "Epsilon" },
      { slug: "f", name: "Zeta" },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const options = page.locator(".niche-select option");
    await expect(options).toHaveCount(6);
    await expect(options.nth(0)).toHaveText("Alpha");
    await expect(options.nth(5)).toHaveText("Zeta");
  });

  test("trend card with id missing renders without error (falls back to title or index)", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        // id intentionally omitted
        title: "No ID Trend",
        keyword: "no-id",
        score: 55,
        videoCount: 10,
        velocity: 5,
      },
      {
        title: "Also No ID",
        keyword: "no-id-2",
        score: 45,
        videoCount: 5,
        velocity: 2,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(sidepanel.getTrendCards()).toHaveCount(2);
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("No ID Trend");
    await expect(
      sidepanel.getTrendCards().nth(1).locator(".trend-title")
    ).toHaveText("Also No ID");
  });

  test("switch niche updates trends list with new data", async ({
    page,
    extensionId,
  }) => {
    mockNiches = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "fitness", name: "Fitness" },
    ];
    mockTrends = [
      {
        id: "1",
        title: "Tech Trend",
        keyword: "tech",
        score: 80,
        videoCount: 100,
        velocity: 10,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    // Verify initial state
    await expect(sidepanel.getTrendCards()).toHaveCount(1);
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("Tech Trend");

    // Update mock data for the new niche
    mockTrends = [
      {
        id: "2",
        title: "Fitness Trend",
        keyword: "fitness",
        score: 70,
        videoCount: 50,
        velocity: 8,
        contentAngles: ["Workout", "Nutrition"],
      },
    ];

    // Switch to fitness niche
    await sidepanel.selectNiche("fitness");

    // Wait for the new trends to load and render
    await expect(sidepanel.getTrendCards()).toHaveCount(1);
    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-title")
    ).toHaveText("Fitness Trend");

    // Verify the new niche is selected in the dropdown
    await expect(sidepanel.getNicheSelect()).toHaveValue("fitness");
  });

  test("score badge displays integer-rounded score value", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Decimal Score",
        keyword: "decimal",
        score: 74.8,
        videoCount: 10,
        velocity: 5.7,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    const scoreBadge = sidepanel.getTrendCards().nth(0).locator(".trend-score");
    // Math.round(74.8) = 75, so it should display "75" with score-hot class
    await expect(scoreBadge).toHaveText("75");
    await expect(scoreBadge).toHaveClass(/score-hot/);
  });

  test("velocity is displayed as rounded integer with + prefix", async ({
    page,
    extensionId,
  }) => {
    mockTrends = [
      {
        id: "1",
        title: "Velocity Test",
        keyword: "velocity",
        score: 50,
        videoCount: 10,
        velocity: 45.7,
      },
    ];
    const sidepanel = await connectAndWaitForMain(page, extensionId);

    await expect(
      sidepanel.getTrendCards().nth(0).locator(".trend-meta")
    ).toContainText("+46%");
  });
});
