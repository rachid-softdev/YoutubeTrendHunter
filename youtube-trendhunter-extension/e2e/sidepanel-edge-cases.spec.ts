import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";
import {
  openSidepanel,
  setStorageToken,
  clearStorage,
  getStorageToken,
  MOCK_NICHES,
  MOCK_TRENDS,
} from "./pages/sidepanel";

/* ================================================================
 * Sidepanel — Edge Cases supplémentaires
 *
 * Ce fichier cible des scénarios NON couverts (ou partiellement
 * couverts) par les tests existants :
 *   - sidepanel-auth.spec.ts
 *   - sidepanel-auth-hardened.spec.ts
 *   - sidepanel-main.spec.ts
 *   - sidepanel-main-hardened.spec.ts
 *   - sidepanel-interactions.spec.ts
 *   - sidepanel-state-machine.spec.ts
 *   - sidepanel-missing.spec.ts
 *
 * Focus : boundaries de score, toggle contentAngles, badge plan
 * null, empty states combinés, niche switch storage, validation
 * token sans appel API, cycle logout/re-login.
 * ================================================================ */

// ── Types ─────────────────────────────────────────────────────────

interface MockTrend {
  id?: string;
  title?: string;
  keyword?: string;
  score: number;
  videoCount?: number | null;
  velocity?: number | null;
  contentAngles?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────

/** Read selectedNiche from chrome.storage.session. */
async function getSelectedNicheFromStorage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      chrome.storage.session.get("selectedNiche", (res) => {
        resolve((res.selectedNiche as string) ?? null);
      });
    });
  });
}

/** Open sidepanel and wait for auth screen. */
async function openToAuth(page: Page, extensionId: string) {
  const sp = await openSidepanel(page, extensionId);
  await expect(sp.getAuthScreen()).toBeVisible({ timeout: 5000 });
  return sp;
}

/** Connect and wait for main screen (routes must be set up before). */
async function connectAndWaitForMain(page: Page, extensionId: string) {
  const sp = await openToAuth(page, extensionId);
  await sp.connect("th_edge_token");
  await expect(sp.getMainScreen()).toBeVisible({ timeout: 8000 });
  return sp;
}

// ── Shared route setup factory ────────────────────────────────────

/**
 * Install a route handler for the trends API that reads mutable
 * mockNiches / mockTrends / mockPlan variables at request time.
 * Returns a ref object whose .current is read by the handler.
 */
function setupRouteHandler(
  context: BrowserContext,
  mockNiches: { current: Array<{ slug: string; name: string }> },
  mockTrends: { current: MockTrend[] },
  mockPlan: { current: string },
): void {
  context.route("**/api/extension/trends**", async (route) => {
    const url = route.request().url();
    if (url.includes("/trends/niches")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNiches.current),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: mockTrends.current,
          plan: mockPlan.current,
        }),
      });
    }
  });
}

/* ================================================================
 * 1. Score Boundaries
 *
 * Vérifie chaque seuil de score et la classe CSS associée :
 *   0        → score-low
 *   49       → score-low
 *   50       → score-mid
 *   74       → score-mid
 *   75       → score-hot
 *   100      → score-hot
 * ================================================================ */

test.describe("Score Boundaries", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = MOCK_NICHES;
    mockPlan.current = "FREE";
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("score = 0 → classe CSS score-low", async ({ page, extensionId }) => {
    mockTrends.current = [
      { id: "1", title: "Zero", keyword: "z", score: 0, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-low/);
    await expect(badge).toHaveText("0");
  });

  test("score = 49 → classe CSS score-low", async ({ page, extensionId }) => {
    mockTrends.current = [
      { id: "1", title: "Low 49", keyword: "l49", score: 49, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-low/);
    await expect(badge).toHaveText("49");
  });

  test("score = 50 → classe CSS score-mid", async ({ page, extensionId }) => {
    mockTrends.current = [
      { id: "1", title: "Mid 50", keyword: "m50", score: 50, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-mid/);
    await expect(badge).toHaveText("50");
  });

  test("score = 74 → classe CSS score-mid", async ({ page, extensionId }) => {
    mockTrends.current = [
      { id: "1", title: "Mid 74", keyword: "m74", score: 74, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-mid/);
    await expect(badge).toHaveText("74");
  });

  test("score = 75 → classe CSS score-hot + trend-hot sur la card", async ({
    page,
    extensionId,
  }) => {
    mockTrends.current = [
      { id: "1", title: "Hot 75", keyword: "h75", score: 75, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-hot/);
    await expect(badge).toHaveText("75");
    // La card doit aussi porter trend-hot
    await expect(sp.getTrendCards().nth(0)).toHaveClass(/trend-hot/);
  });

  test("score = 100 → classe CSS score-hot + trend-hot sur la card", async ({
    page,
    extensionId,
  }) => {
    mockTrends.current = [
      { id: "1", title: "Perfect", keyword: "p", score: 100, videoCount: 5, velocity: 1 },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const badge = sp.getTrendCards().nth(0).locator(".trend-score");
    await expect(badge).toHaveClass(/score-hot/);
    await expect(badge).toHaveText("100");
    await expect(sp.getTrendCards().nth(0)).toHaveClass(/trend-hot/);
  });
});

/* ================================================================
 * 2. Content Angles Toggle
 *
 * Vérifie le bouton "Angles de contenu" : visibilité, expand,
 * collapse, et aria-expanded.
 * ================================================================ */

test.describe("Content Angles Toggle", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = MOCK_NICHES;
    mockPlan.current = "FREE";
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("bouton toggle 'Angles de contenu' visible pour une tendance avec contentAngles", async ({
    page,
    extensionId,
  }) => {
    mockTrends.current = [
      {
        id: "1",
        title: "Avec angles",
        keyword: "angles",
        score: 60,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Tuto", "Comparatif", "Cas client"],
      },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);

    // Le bouton porte le label "Angles de contenu"
    const toggle = sp.getTrendCards().nth(0).locator(".angle-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle.locator(".angle-toggle-label")).toHaveText("Angles de contenu");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("cliquer expand → les angles s'affichent (aria-expanded=true)", async ({
    page,
    extensionId,
  }) => {
    mockTrends.current = [
      {
        id: "1",
        title: "Expand",
        keyword: "exp",
        score: 60,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Angle A", "Angle B"],
      },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const toggle = sp.getTrendCards().nth(0).locator(".angle-toggle");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sp.getTrendCards().nth(0).locator(".angle-pills")).toBeVisible();
    await expect(sp.getTrendCards().nth(0).locator(".angle-pill")).toHaveCount(2);
    await expect(sp.getTrendCards().nth(0).locator(".angle-pill").nth(0)).toHaveText("Angle A");
  });

  test("cliquer collapse → les angles se cachent (aria-expanded=false)", async ({
    page,
    extensionId,
  }) => {
    mockTrends.current = [
      {
        id: "1",
        title: "Collapse",
        keyword: "col",
        score: 60,
        videoCount: 10,
        velocity: 5,
        contentAngles: ["Only"],
      },
    ];
    const sp = await connectAndWaitForMain(page, extensionId);
    const toggle = sp.getTrendCards().nth(0).locator(".angle-toggle");

    // Expand puis collapse
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sp.getTrendCards().nth(0).locator(".angle-pills")).toHaveCount(0);
  });
});

/* ================================================================
 * 3. Plan Badge Variations
 *
 * Vérifie le texte du badge selon le plan retourné par l'API,
 * y compris le cas null qui doit être traité comme "FREE".
 * ================================================================ */

test.describe("Plan Badge Variations", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = MOCK_NICHES;
    mockTrends.current = [
      {
        id: "1",
        title: "Test plan",
        keyword: "plan",
        score: 50,
        videoCount: 5,
        velocity: 1,
      },
    ];
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("Plan FREE → badge affiche 'Plan FREE' et porte la classe .plan-badge", async ({
    page,
    extensionId,
  }) => {
    mockPlan.current = "FREE";
    const sp = await connectAndWaitForMain(page, extensionId);

    const badge = sp.getPlanBadge();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass("plan-badge");
    await expect(badge).toHaveText("Plan FREE");
  });

  test("Plan PRO → badge affiche 'Plan PRO'", async ({ page, extensionId }) => {
    mockPlan.current = "PRO";
    const sp = await connectAndWaitForMain(page, extensionId);

    await expect(sp.getPlanBadge()).toHaveText("Plan PRO");
  });

  test("Plan TEAM → badge affiche 'Plan TEAM'", async ({ page, extensionId }) => {
    mockPlan.current = "TEAM";
    const sp = await connectAndWaitForMain(page, extensionId);

    await expect(sp.getPlanBadge()).toHaveText("Plan TEAM");
  });

  test("Plan null (ou absent) → badge affiche 'Plan FREE' par défaut", async ({
    page,
    extensionId,
  }) => {
    // Simule une réponse API où plan est null
    mockPlan.current = null as unknown as string;
    const sp = await connectAndWaitForMain(page, extensionId);

    // App.tsx: setPlan(response.data.plan ?? "FREE") → "FREE"
    await expect(sp.getPlanBadge()).toBeVisible();
    await expect(sp.getPlanBadge()).toHaveText("Plan FREE");
  });
});

/* ================================================================
 * 4. Empty States
 *
 * Vérifie le comportement quand l'API retourne un tableau de
 * tendances vide, avec différentes valeurs de plan.
 * ================================================================ */

test.describe("Empty States", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = MOCK_NICHES;
    mockTrends.current = [];
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("trends = [] et plan = FREE → empty state visible + upgrade banner visible (FREE)", async ({
    page,
    extensionId,
  }) => {
    mockPlan.current = "FREE";
    const sp = await connectAndWaitForMain(page, extensionId);

    // L'empty state doit s'afficher
    await expect(sp.getEmptyState()).toBeVisible();
    await expect(sp.getEmptyState()).toContainText("Aucune tendance trouvée pour cette niche.");
    await expect(sp.getTrendCards()).toHaveCount(0);

    // Le plan est FREE → l'upgrade banner est visible (indépendant des trends)
    await expect(sp.getUpgradeBanner()).toBeVisible();
    await expect(sp.getUpgradeLink()).toHaveText("Voir les offres");
  });

  test("trends = [] et plan = PRO → empty state visible, upgrade banner invisible", async ({
    page,
    extensionId,
  }) => {
    mockPlan.current = "PRO";
    const sp = await connectAndWaitForMain(page, extensionId);

    // Empty state toujours visible
    await expect(sp.getEmptyState()).toBeVisible();
    await expect(sp.getTrendCards()).toHaveCount(0);

    // PRO → pas d'upgrade banner
    await expect(sp.getUpgradeBanner()).toHaveCount(0);
  });
});

/* ================================================================
 * 5. Niche Switch
 *
 * Vérifie que changer de niche met à jour les tendances ET
 * persist selectedNiche dans chrome.storage.session.
 * ================================================================ */

test.describe("Niche Switch", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = [
      { slug: "tech-ia", name: "Tech & IA" },
      { slug: "finance", name: "Finance" },
      { slug: "fitness", name: "Fitness" },
    ];
    mockPlan.current = "FREE";
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("changer de niche via le select → tendances mises à jour + selectedNiche persisté", async ({
    page,
    extensionId,
  }) => {
    // Données initiales pour tech-ia
    mockTrends.current = [
      {
        id: "1",
        title: "Tech Trend",
        keyword: "tech",
        score: 80,
        videoCount: 100,
        velocity: 10,
      },
    ];

    const sp = await connectAndWaitForMain(page, extensionId);
    await expect(sp.getTrendCards()).toHaveCount(1);
    await expect(sp.getTrendCards().nth(0).locator(".trend-title")).toHaveText("Tech Trend");

    // Vérifier que selectedNiche est stocké dans chrome.storage.session
    let storedNiche = await getSelectedNicheFromStorage(page);
    expect(storedNiche).toBe("tech-ia");

    // Changer pour "finance" avec des données différentes
    mockTrends.current = [
      {
        id: "2",
        title: "Finance Trend",
        keyword: "finance",
        score: 75,
        videoCount: 200,
        velocity: 20,
        contentAngles: ["Investir", "Épargne"],
      },
    ];
    await sp.selectNiche("finance");

    // Vérifier que les tendances sont mises à jour
    await expect(sp.getTrendCards()).toHaveCount(1);
    await expect(sp.getTrendCards().nth(0).locator(".trend-title")).toHaveText("Finance Trend");
    await expect(sp.getNicheSelect()).toHaveValue("finance");

    // Vérifier que selectedNiche est stocké dans le storage
    storedNiche = await getSelectedNicheFromStorage(page);
    expect(storedNiche).toBe("finance");

    // Changer à nouveau pour "fitness"
    mockTrends.current = [
      {
        id: "3",
        title: "Fitness Trend",
        keyword: "fitness",
        score: 90,
        videoCount: 300,
        velocity: 30,
      },
    ];
    await sp.selectNiche("fitness");

    await expect(sp.getNicheSelect()).toHaveValue("fitness");
    storedNiche = await getSelectedNicheFromStorage(page);
    expect(storedNiche).toBe("fitness");
  });
});

/* ================================================================
 * 6. Token Validation Before API Call
 *
 * Vérifie qu'aucun appel API n'est effectué quand le token est
 * vide ou ne contient que des espaces (trim → empty).
 * Token très long → pas de crash.
 * ================================================================ */

test.describe("Token Validation — API Call Prevention", () => {
  /**
   * Installe un route qui compte les appels API et les refuse
   * (pour détecter les appels non désirés).
   */
  async function setupCountingRoute(context: BrowserContext): Promise<{ getCount: () => number }> {
    let count = 0;
    await context.route("**/api/extension/trends**", async (route) => {
      count++;
      await route.abort("connectionrefused");
    });
    return { getCount: () => count };
  }

  test("token vide → bouton cliqué mais aucun appel API", async ({
    page,
    context,
    extensionId,
  }) => {
    const counter = await setupCountingRoute(context);
    const sp = await openToAuth(page, extensionId);

    // Token vide
    await sp.getTokenInput().fill("");
    await sp.getConnectButton().click();

    // Attendre que d'éventuels appels asynchrones se déclenchent
    await page.waitForTimeout(500);

    // Aucun appel API ne doit avoir été fait
    expect(counter.getCount()).toBe(0);

    // On est toujours sur l'écran auth
    await expect(sp.getAuthScreen()).toBeVisible();
  });

  test("token avec seulement des espaces → aucun appel API", async ({
    page,
    context,
    extensionId,
  }) => {
    const counter = await setupCountingRoute(context);
    const sp = await openToAuth(page, extensionId);

    // Token avec espaces seulement
    await sp.getTokenInput().fill("   \t\n  ");
    await sp.getConnectButton().click();

    await page.waitForTimeout(500);

    expect(counter.getCount()).toBe(0);
    await expect(sp.getAuthScreen()).toBeVisible();
  });

  test("token très long (>1000 chars) → pas de crash, API appelée mais pas d'erreur", async ({
    page,
    context,
    extensionId,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // Route qui réussit (pour permettre la transition)
    await context.route("**/api/extension/trends**", async (route) => {
      const url = route.request().url();
      if (url.includes("/trends/niches")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_NICHES),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ trends: MOCK_TRENDS, plan: "FREE" }),
        });
      }
    });

    const sp = await openToAuth(page, extensionId);
    const longToken = "th_" + "a".repeat(1000);

    // Doit fonctionner sans erreur
    await sp.connect(longToken);

    await page.waitForTimeout(500);
    expect(pageErrors).toHaveLength(0);

    // Le token est stocké
    const stored = await getStorageToken(page);
    expect(stored).toBe(longToken);
  });
});

/* ================================================================
 * 7. Logout/Re-login Cycle
 *
 * Cycle complet : connect → main → logout → auth → reconnect → main
 * ================================================================ */

test.describe("Logout/Re-login Cycle", () => {
  const mockNiches = { current: MOCK_NICHES };
  const mockTrends = { current: [] as MockTrend[] };
  const mockPlan = { current: "FREE" };

  test.beforeEach(({ context }) => {
    mockNiches.current = MOCK_NICHES;
    mockPlan.current = "FREE";
    mockTrends.current = [
      {
        id: "1",
        title: "Cycle Trend",
        keyword: "cycle",
        score: 85,
        videoCount: 100,
        velocity: 20,
      },
    ];
    setupRouteHandler(context, mockNiches, mockTrends, mockPlan);
  });

  test("cycle complet : connect → voir tendances → déconnecter → reconnecter → voir tendances", async ({
    page,
    extensionId,
  }) => {
    // Phase 1 : Connexion → Main screen
    const sp = await connectAndWaitForMain(page, extensionId);
    await expect(sp.getTrendCards()).toHaveCount(1);
    await expect(sp.getTrendCards().nth(0).locator(".trend-title")).toHaveText("Cycle Trend");

    // Vérifier que le token est stocké
    let stored = await getStorageToken(page);
    expect(stored).toBe("th_edge_token");

    // Phase 2 : Déconnexion → Auth screen
    await sp.logout();
    await expect(sp.getAuthScreen()).toBeVisible({ timeout: 5000 });

    // Token effacé
    stored = await getStorageToken(page);
    expect(stored).toBeNull();

    // Phase 3 : Reconnexion avec un nouveau token → Main screen
    await sp.connect("th_reconnect_token");
    await expect(sp.getMainScreen()).toBeVisible({ timeout: 8000 });

    // Les tendances s'affichent à nouveau
    await expect(sp.getTrendCards()).toHaveCount(1);
    await expect(sp.getTrendCards().nth(0).locator(".trend-title")).toHaveText("Cycle Trend");

    // Nouveau token stocké
    stored = await getStorageToken(page);
    expect(stored).toBe("th_reconnect_token");

    // Phase 4 : Déconnexion propre finale
    await sp.logout();
    await expect(sp.getAuthScreen()).toBeVisible({ timeout: 5000 });
    stored = await getStorageToken(page);
    expect(stored).toBeNull();
  });
});
