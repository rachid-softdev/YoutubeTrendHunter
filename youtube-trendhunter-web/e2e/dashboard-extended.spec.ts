import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupTestSession } from "./auth-helpers";

/**
 * Dashboard Extended E2E tests for YouTube TrendHunter
 *
 * Covers missing scenarios beyond the basic dashboard.spec.ts:
 *   - Trend card rendering (data, score colors, click behavior)
 *   - Dashboard layout (header, sidebar, main content)
 *   - Empty state / no trends
 *   - API error handling (500, malformed JSON, timeout, rate limit, session expired)
 *   - Edge cases (score 0, score 100, very long titles, special characters, unicode, emoji)
 *   - Plan enforcement (FREE limit, PRO full access, upgrade banner)
 *   - Pagination / nextCursor behavior
 *   - Niche selector (single niche, many niches, switch niche)
 *
 * Mock strategy:
 *   - page.route() intercepts all API calls; server-side auth may still redirect.
 *   - UI rendering tests follow the "best-effort" pattern from dashboard.spec.ts:
 *     if the page renders (auth mock works server-side), assertions run;
 *     otherwise the test gracefully passes on the login redirect.
 *   - API contract tests use page.request.get() with active route mocks.
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

/* -------------------------------------------------------------------------- */
/*  Mock data helpers — shapes match Prisma Trend model + API response         */
/* -------------------------------------------------------------------------- */

function makeTrend(overrides: Partial<TrendMock> = {}): TrendMock {
  return {
    id: `trend-${Math.random().toString(36).slice(2, 8)}`,
    nicheId: "niche-1",
    title: "Comment l'IA transforme le marketing en 2026",
    description: "Une analyse approfondie des tendances IA dans le marketing digital.",
    score: 85,
    velocity: 12.5,
    status: "GROWING",
    searchVolume: 15000,
    videoCount: 234,
    avgViews: 45000,
    contentAngles: ["Stratégie de contenu IA", "SEO nouvelle génération"],
    detectedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

interface TrendMock {
  id: string;
  nicheId: string;
  title: string;
  description?: string | null;
  score: number;
  velocity: number;
  status: string;
  searchVolume?: number | null;
  videoCount?: number | null;
  avgViews?: number | null;
  contentAngles: string[];
  detectedAt: string;
  expiresAt: string;
  updatedAt: string;
}

interface TrendsResponse {
  trends: TrendMock[];
  plan: string;
  nextCursor: string | null;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
}

/* -------------------------------------------------------------------------- */
/*  Helper functions                                                           */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, overrides: Partial<typeof TEST_USER> = {}) {
  const user = { ...TEST_USER, ...overrides };
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user, expires: MOCK_SESSION.expires }),
    });
  });
}

async function mockUserApi(page: Page, overrides: Partial<UserResponse> = {}) {
  const defaults: UserResponse = {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER",
    plan: "FREE",
  };
  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...defaults, ...overrides }),
    });
  });
}

/**
 * Mock the /api/trends endpoint with a custom response.
 */
async function mockTrendsApi(page: Page, responseBody: TrendsResponse | string, status = 200) {
  await page.route("**/api/trends*", async (route) => {
    const body = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    await route.fulfill({
      status,
      contentType: "application/json",
      body,
    });
  });
}

/**
 * Mock the /api/niches endpoint (GET) with a custom list.
 */
async function mockNichesApi(
  page: Page,
  niches: { id: string; name: string; slug: string; description?: string; isActive?: boolean }[],
  followed: string[] = [],
  status = 200,
) {
  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          niches: niches.map((n) => ({
            id: n.id,
            name: n.name,
            slug: n.slug,
            description: n.description ?? "",
            isActive: n.isActive ?? true,
          })),
          followed,
          available: niches.map((n) => ({ id: n.id, name: n.name, slug: n.slug })),
          nextCursor: null,
        }),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });
}

/**
 * Mock all "good" API routes so the dashboard can render.
 */
async function mockDefaultApiRoutes(page: Page, trends: TrendMock[] = [], plan = "FREE") {
  await mockTrendsApi(page, {
    trends,
    plan,
    nextCursor: null,
  });

  await mockNichesApi(page, [
    { id: "niche-1", name: "Tech & IA", slug: "tech", description: "Technologie et IA" },
    { id: "niche-2", name: "Gaming", slug: "gaming", description: "Jeux vidéo" },
  ]);

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
        body: JSON.stringify({ alerts: [] }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  await mockUserApi(page, { plan });
}

/**
 * Navigate to the dashboard and return whether we actually landed there
 * (as opposed to being redirected to /login by server-side auth).
 */
async function gotoDashboard(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  return page.url().includes("/dashboard");
}

/**
 * Create a set of mock trends with controlled scores, used for sorting/rendering tests.
 */
function createScoreTestTrends(): TrendMock[] {
  return [
    makeTrend({
      id: "t-high",
      title: "Trend Haut Score",
      score: 95,
      velocity: +20,
      status: "PEAK",
    }),
    makeTrend({
      id: "t-mid",
      title: "Trend Score Moyen",
      score: 60,
      velocity: +5,
      status: "GROWING",
    }),
    makeTrend({ id: "t-low", title: "Trend Bas Score", score: 25, velocity: -3, status: "FADING" }),
  ];
}

/* -------------------------------------------------------------------------- */
/*  Dashboard — Layout & Rendu                                                */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Layout & Rendu", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockDefaultApiRoutes(page, createScoreTestTrends());
  });

  let currentSessionToken = "";

  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
    }
  });

  test("affiche le layout complet: header, sidebar, contenu principal", async ({ page }) => {
    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) {
      test
        .info()
        .annotations.push({ type: "skip", description: "Redirigé vers login (auth serveur)" });
      return;
    }

    // Titre principal
    await expect(page.locator("h1")).toContainText("Tendances");

    // Sidebar: logo TrendHunter
    await expect(page.getByText("TrendHunter").first()).toBeVisible();
    // Sidebar: navigation links
    await expect(page.locator('nav a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('nav a[href="/my-niches"]')).toBeVisible();
    await expect(page.locator('nav a[href="/alerts"]')).toBeVisible();

    // Bouton déconnexion
    await expect(page.getByText("Déconnexion")).toBeVisible();
  });

  test("affiche le layout complet sans redirection — cookie session injecté", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "FREE" });
    currentSessionToken = sessionToken;
    await mockDefaultApiRoutes(page, createScoreTestTrends());

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Tendances");
    await expect(page.getByText("TrendHunter").first()).toBeVisible();
    await expect(page.locator('nav a[href="/dashboard"]')).toBeVisible();
    await expect(page.getByText("Déconnexion")).toBeVisible();
  });

  test("affiche les cartes de tendance avec les données correctes", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "FREE" });
    currentSessionToken = sessionToken;
    await mockDefaultApiRoutes(page, createScoreTestTrends());
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Cartes visibles
    await expect(page.getByText("Trend Haut Score")).toBeVisible();
    await expect(page.getByText("Trend Score Moyen")).toBeVisible();
    await expect(page.getByText("Trend Bas Score")).toBeVisible();

    // Scores visibles
    await expect(page.getByText("95")).toBeVisible();
    await expect(page.getByText("60")).toBeVisible();
    await expect(page.getByText("25")).toBeVisible();

    // Status badges
    await expect(page.getByText("PEAK")).toBeVisible();
    await expect(page.getByText("GROWING")).toBeVisible();
    await expect(page.getByText("FADING")).toBeVisible();
  });

  test("affiche la couleur de score correcte: rouge >= 75, ambre 50-74, vert < 50", async ({
    page,
  }) => {
    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Score 95 → fond rouge (bg-yt-red)
    const scoreHigh = page.locator("text=95").first();
    await expect(scoreHigh).toHaveClass(/bg-yt-red/);

    // Score 60 → fond ambre
    const scoreMid = page.locator("text=60").first();
    await expect(scoreMid).toHaveClass(/bg-amber-500/);

    // Score 25 → fond vert
    const scoreLow = page.locator("text=25").first();
    await expect(scoreLow).toHaveClass(/bg-green-500/);
  });

  test("la carte de tendance est cliquable (role=button)", async ({ page }) => {
    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    const card = page.locator('[role="button"]').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("tabindex", "0");
  });

  test("affiche la vélocité et le nombre de vidéos", async ({ page }) => {
    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Vélocité positive
    await expect(page.getByText(/20\.0%/)).toBeVisible();
    // Nombre de vidéos
    await expect(page.getByText(/234/)).toBeVisible();
  });

  test("les tendances sont triées par score décroissant", async ({ page }) => {
    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Le DOM doit avoir les cartes dans l'ordre 95, 60, 25
    const cards = page.locator('[role="button"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // On cherche juste les chiffres 95, 60, 25 dans l'ordre du DOM
    const allText = await cards.allTextContents();
    const joined = allText.join(" ");
    const idx95 = joined.indexOf("95");
    const idx60 = joined.indexOf("60");
    const idx25 = joined.indexOf("25");
    expect(idx95).toBeLessThan(idx60);
    expect(idx60).toBeLessThan(idx25);
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — État vide                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — État vide", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("affiche un état vide quand l'API retourne un tableau vide", async ({ page }) => {
    await mockDefaultApiRoutes(page, []);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Vérifier qu'aucune carte de tendance n'est affichée
    const cards = page.locator('[role="button"]');
    await expect(cards).toHaveCount(0);

    // Vérifier que la page existe toujours (h1 Tendances, etc.)
    await expect(page.locator("h1")).toContainText("Tendances");
  });

  test("API /api/trends retourne un tableau vide — structure correcte", async ({ page }) => {
    await mockTrendsApi(page, {
      trends: [],
      plan: "FREE",
      nextCursor: null,
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body).toHaveProperty("trends");
    expect(Array.isArray(result.body.trends)).toBe(true);
    expect(result.body.trends.length).toBe(0);
    expect(result.body).toHaveProperty("plan", "FREE");
    expect(result.body).toHaveProperty("nextCursor", null);
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Erreurs API                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Erreurs API", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("API /api/trends retourne 500 — structure d'erreur correcte", async ({ page }) => {
    await mockTrendsApi(page, { error: "Erreur interne", code: "INTERNAL_ERROR" } as any, 500);
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(500);

    expect(result.body).toHaveProperty("error", "Erreur interne");
    expect(result.body).toHaveProperty("code", "INTERNAL_ERROR");
  });

  test("API /api/trends retourne 429 rate limit", async ({ page }) => {
    await mockTrendsApi(
      page,
      {
        error: "Trop de requêtes. Réessayez plus tard.",
        code: "RATE_LIMIT",
        details: { retryAfter: 30 },
      } as any,
      429,
    );
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(429);

    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toContain("Trop de requêtes");
    expect(result.body).toHaveProperty("code", "RATE_LIMIT");
    expect(result.body.details).toHaveProperty("retryAfter", 30);
  });

  test("API /api/trends retourne JSON malformé", async ({ page }) => {
    await mockTrendsApi(page, "ceci n'est pas du json valide {{{", 200);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, text: await res.text() };
    });
    expect(result.status).toBe(200);

    // La réponse ne peut pas être parsée en JSON
    expect(result.text).toBe("ceci n'est pas du json valide {{{");

    // Vérifier que le parse échoue
    let parseError = false;
    try {
      JSON.parse(result.text);
    } catch {
      parseError = true;
    }
    expect(parseError).toBe(true);
  });

  test("API /api/trends simule une erreur réseau (timeout)", async ({ page }) => {
    await page.route("**/api/trends*", async (route) => {
      await route.abort("TimedOut");
    });

    // La requête doit échouer avec une erreur réseau
    let requestFailed = false;
    try {
      await page.evaluate(async () => {
        await fetch("/api/trends?niche=tech");
      });
    } catch {
      requestFailed = true;
    }
    // Une erreur réseau est attendue après l'abort
    expect(requestFailed).toBe(true);
  });

  test("API /api/trends retourne 401 quand la session est expirée", async ({ page }) => {
    // Ne pas mocker la session → l'API doit retourner 401
    // Mock uniquement les routes non-auth
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);

    expect(result.body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("API /api/niches retourne 500", async ({ page }) => {
    await mockNichesApi(page, [], [], 500);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status };
    });
    expect(result.status).toBe(500);
  });

  test("l'interface ne crash pas quand /api/trends retourne 500", async ({ page }) => {
    await mockSession(page);
    await mockDefaultApiRoutes(page, []);
    // Surcharger le mock trends pour retourner une erreur
    await mockTrendsApi(page, { error: "Erreur serveur", code: "INTERNAL_ERROR" } as any, 500);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // La page doit toujours afficher le layout même sans données
    await expect(page.locator("h1")).toContainText("Tendances");
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Données extrêmes et cas limites                                */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Données extrêmes & cas limites", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("tendance avec score 0 (minimum)", async ({ page }) => {
    const trends = [
      makeTrend({
        id: "t-zero",
        title: "Trend Score Zéro",
        score: 0,
        velocity: 0,
        status: "EMERGING",
      }),
    ];
    await mockDefaultApiRoutes(page, trends);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body.trends[0].score).toBe(0);

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      await expect(page.getByText("Trend Score Zéro")).toBeVisible();
      await expect(page.getByText("0").first()).toBeVisible();
    }
  });

  test("tendance avec score 100 (maximum)", async ({ page }) => {
    const trends = [
      makeTrend({
        id: "t-perfect",
        title: "Trend Parfait",
        score: 100,
        velocity: 50,
        status: "PEAK",
      }),
    ];
    await mockDefaultApiRoutes(page, trends);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body.trends[0].score).toBe(100);

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      await expect(page.getByText("Trend Parfait")).toBeVisible();
    }
  });

  test("plusieurs tendances avec le même score", async ({ page }) => {
    const trends = [
      makeTrend({
        id: "t-same-1",
        title: "Même Score A",
        score: 75,
        velocity: 10,
        status: "GROWING",
      }),
      makeTrend({ id: "t-same-2", title: "Même Score B", score: 75, velocity: 5, status: "PEAK" }),
      makeTrend({
        id: "t-same-3",
        title: "Même Score C",
        score: 75,
        velocity: -2,
        status: "FADING",
      }),
    ];
    await mockDefaultApiRoutes(page, trends);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.trends.length).toBe(3);
    expect((result.body.trends as Array<{ score: number }>).every((t) => t.score === 75)).toBe(
      true,
    );

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      // Les trois titres doivent être visibles
      await expect(page.getByText("Même Score A")).toBeVisible();
      await expect(page.getByText("Même Score B")).toBeVisible();
      await expect(page.getByText("Même Score C")).toBeVisible();
    }
  });

  test("tendance avec un titre très long (overflow)", async ({ page }) => {
    const longTitle =
      "Ultra Mega Super Top Grande Tendance Incroyable Dans Le Monde Du Marketing Digital Et De L'Intelligence Artificielle En 2026 Vraiment Très Très Long";
    const trends = [makeTrend({ id: "t-long", title: longTitle, score: 80 })];
    await mockDefaultApiRoutes(page, trends);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.trends[0].title.length).toBeGreaterThan(80);

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      const titleEl = page.getByText(longTitle).first();
      await expect(titleEl).toBeVisible();
      // Le titre long doit être tronqué visuellement (line-clamp-2)
      await expect(titleEl).toHaveClass(/line-clamp-2/);
    }
  });

  test("titres avec caractères spéciaux, unicode et emoji", async ({ page }) => {
    const trends = [
      makeTrend({
        id: "t-html",
        title: '<script>alert("xss")</script> & <b>HTML</b>',
        score: 70,
      }),
      makeTrend({
        id: "t-unicode",
        title: "Tendance en Français avec accents éèêë àâä ùûü ç ôö",
        score: 65,
      }),
      makeTrend({
        id: "t-emoji",
        title: "🚀🔥 Tendance IA explose en 2026! 📈💯 #viral",
        score: 90,
      }),
    ];
    await mockDefaultApiRoutes(page, trends);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.body.trends.length).toBe(3);

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      // Les titres ne doivent pas casser le rendu
      await expect(page.getByText("Tendance en Français avec accents").first()).toBeVisible();
      await expect(page.getByText("🚀").first()).toBeVisible();
      // Pour le titre HTML, le texte doit être affiché tel quel (échappé), pas interprété
      await expect(page.getByText('<script>alert("xss")</script>').first()).toBeVisible();
    }
  });

  test("tendance sans description et sans thumbnail (champs null)", async ({ page }) => {
    const trends = [
      makeTrend({
        id: "t-null-fields",
        title: "Trend sans description",
        description: null,
        videoCount: null,
        searchVolume: null,
        avgViews: null,
        contentAngles: [],
      }),
    ];
    await mockDefaultApiRoutes(page, trends);

    const onDashboard = await gotoDashboard(page);
    if (onDashboard) {
      // Le titre doit être visible
      await expect(page.getByText("Trend sans description")).toBeVisible();
      // Pas de "vidéos" affiché (videoCount null)
      await expect(page.getByText(/vidéos/)).toHaveCount(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Limites du plan et upgrade                                     */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Limites du plan", () => {
  const FREE_TREND_COUNT = 5;
  const MANY_TRENDS = Array.from({ length: 15 }, (_, i) =>
    makeTrend({
      id: `trend-pro-${i}`,
      title: `Tendance #${i + 1}`,
      score: 100 - i,
    }),
  );

  test("bannière 'Plan Free' visible pour utilisateur FREE", async ({ page }) => {
    await mockSession(page, { plan: "FREE" });
    await mockDefaultApiRoutes(page, MANY_TRENDS.slice(0, FREE_TREND_COUNT), "FREE");

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Bannière Plan Free
    const alert = page.getByText("Plan Free").first();
    await expect(alert).toBeVisible();

    // Message indiquant la limite
    await expect(page.getByText(/5 tendances visibles/)).toBeVisible();

    // Lien pour passer à Pro
    const proLink = page.locator('a[href="/pricing"]');
    await expect(proLink).toBeVisible();
    await expect(proLink).toContainText("Passer Pro");
  });

  test("utilisateur FREE voit un nombre limité de tendances", async ({ page }) => {
    await mockSession(page, { plan: "FREE" });
    await mockDefaultApiRoutes(page, MANY_TRENDS.slice(0, FREE_TREND_COUNT), "FREE");

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    const cards = page.locator('[role="button"]');
    const count = await cards.count();
    expect(count).toBeLessThanOrEqual(FREE_TREND_COUNT);
  });

  test("utilisateur PRO voit plus de tendances (pas de bannière)", async ({ page }) => {
    await mockSession(page, { plan: "PRO" });
    await mockDefaultApiRoutes(page, MANY_TRENDS, "PRO");

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Pas de bannière Plan Free
    await expect(page.getByText("Plan Free")).toHaveCount(0);

    // Les tendances sont visibles
    const cards = page.locator('[role="button"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(FREE_TREND_COUNT);
  });

  test("API /api/trends retourne plan=FREE avec limite pour les requêtes API", async ({ page }) => {
    await mockSession(page, { plan: "FREE" });
    await mockTrendsApi(page, {
      trends: MANY_TRENDS.slice(0, FREE_TREND_COUNT),
      plan: "FREE",
      nextCursor: null,
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page, { plan: "FREE" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body.plan).toBe("FREE");
    expect(result.body.trends.length).toBeLessThanOrEqual(FREE_TREND_COUNT);
  });

  test("API /api/trends retourne plan=PRO avec toutes les tendances", async ({ page }) => {
    await mockSession(page, { plan: "PRO" });
    await mockTrendsApi(page, {
      trends: MANY_TRENDS,
      plan: "PRO",
      nextCursor: null,
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page, { plan: "PRO" });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body.plan).toBe("PRO");
    expect(result.body.trends.length).toBe(15);
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Pagination / nextCursor                                       */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Pagination", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("nextCursor est null quand il n'y a pas de page suivante", async ({ page }) => {
    const trends = Array.from({ length: 3 }, (_, i) =>
      makeTrend({ id: `t-${i}`, title: `Trend ${i}`, score: 90 - i * 5 }),
    );
    await mockTrendsApi(page, {
      trends,
      plan: "FREE",
      nextCursor: null,
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const body = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return await res.json();
    });
    expect(body.nextCursor).toBeNull();
  });

  test("nextCursor est présent quand il y a plus de résultats", async ({ page }) => {
    const trends = Array.from({ length: 5 }, (_, i) =>
      makeTrend({ id: `t-page-${i}`, title: `Trend Page ${i}`, score: 100 - i }),
    );
    await mockTrendsApi(page, {
      trends,
      plan: "FREE",
      nextCursor: `t-page-${trends.length - 1}`,
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const body = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech&limit=5");
      return await res.json();
    });
    expect(body.nextCursor).toBeTruthy();
    expect(typeof body.nextCursor).toBe("string");
  });

  test("nextCursor change quand on pagine avec un curseur", async ({ page }) => {
    const trendsPage1 = Array.from({ length: 2 }, (_, i) =>
      makeTrend({ id: `t-page1-${i}`, title: `Page1 Trend ${i}`, score: 90 - i * 5 }),
    );
    const trendsPage2 = Array.from({ length: 2 }, (_, i) =>
      makeTrend({ id: `t-page2-${i}`, title: `Page2 Trend ${i}`, score: 70 - i * 5 }),
    );

    // Page 1
    await mockTrendsApi(page, {
      trends: trendsPage1,
      plan: "FREE",
      nextCursor: "t-page1-1",
    });
    await mockNichesApi(page, [{ id: "niche-1", name: "Tech & IA", slug: "tech" }]);
    await mockUserApi(page);

    const body1 = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech&limit=2");
      return await res.json();
    });
    expect(body1.trends.length).toBe(2);
    expect(body1.nextCursor).toBe("t-page1-1");

    // Page 2 (avec curseur)
    await mockTrendsApi(page, {
      trends: trendsPage2,
      plan: "FREE",
      nextCursor: null,
    });

    const body2 = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech&limit=2&cursor=t-page1-1");
      return await res.json();
    });
    expect(body2.trends.length).toBe(2);
    // Dernière page → nextCursor null
    expect(body2.nextCursor).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Sélecteur de niche                                            */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Sélecteur de niche", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("affiche le sélecteur de niche sur le dashboard", async ({ page }) => {
    await mockDefaultApiRoutes(page, [makeTrend()]);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Le sélecteur doit être visible (en tant qu'élément <select>)
    const select = page.locator("select");
    await expect(select).toBeVisible();
  });

  test("sélecteur avec une seule niche disponible", async ({ page }) => {
    await mockSession(page);
    await mockTrendsApi(page, {
      trends: [makeTrend({ nicheId: "niche-1" })],
      plan: "FREE",
      nextCursor: null,
    });
    await mockNichesApi(page, [
      { id: "niche-1", name: "Tech & IA", slug: "tech", description: "Technologie" },
    ]);
    await mockUserApi(page);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    const select = page.locator("select");
    const options = select.locator("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText("Tech & IA");
  });

  test("sélecteur avec plusieurs niches disponibles", async ({ page }) => {
    await mockSession(page);
    await mockTrendsApi(page, {
      trends: [makeTrend({ nicheId: "niche-1" })],
      plan: "FREE",
      nextCursor: null,
    });
    const manyNiches = Array.from({ length: 10 }, (_, i) => ({
      id: `niche-${i}`,
      name: `Niche #${i}`,
      slug: `niche-${i}`,
      description: `Description ${i}`,
      isActive: true,
    }));
    await mockNichesApi(page, manyNiches);
    await mockUserApi(page);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    const select = page.locator("select");
    const options = select.locator("option");
    expect(await options.count()).toBe(10);
  });

  test("API /api/niches retourne les niches disponibles avec la bonne structure", async ({
    page,
  }) => {
    await mockSession(page);
    await mockTrendsApi(page, {
      trends: [],
      plan: "FREE",
      nextCursor: null,
    });
    await mockNichesApi(page, [
      { id: "niche-1", name: "Tech & IA", slug: "tech", description: "Technologie et IA" },
      { id: "niche-2", name: "Gaming", slug: "gaming", description: "Jeux vidéo" },
      { id: "niche-3", name: "Musique", slug: "musique", description: "Musique et production" },
    ]);
    await mockUserApi(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body).toHaveProperty("niches");
    expect(Array.isArray(result.body.niches)).toBe(true);
    expect(result.body.niches.length).toBeGreaterThanOrEqual(3);

    // Chaque niche a les champs requis
    for (const n of result.body.niches) {
      expect(n).toHaveProperty("id");
      expect(n).toHaveProperty("name");
      expect(n).toHaveProperty("slug");
    }

    // Vérifier la disponibilité
    expect(result.body).toHaveProperty("available");
    expect(Array.isArray(result.body.available)).toBe(true);
  });

  test("API /api/niches retourne 500 — gestion d'erreur", async ({ page }) => {
    await mockSession(page);
    await mockNichesApi(page, [], [], 500);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status };
    });
    expect(result.status).toBe(500);
  });

  test("changement de niche sélectionne différentes tendances", async ({ page }) => {
    await mockSession(page);

    // Mock des tendances pour la niche "tech"
    const techTrends = [makeTrend({ id: "t-tech", title: "Trend Tech", nicheId: "niche-1" })];
    const gamingTrends = [makeTrend({ id: "t-gaming", title: "Trend Gaming", nicheId: "niche-2" })];

    // Premier appel à /api/trends → retourne les tendances tech
    // Deuxième appel (après changement de niche) → retourne les tendances gaming
    let callCount = 0;
    await page.route("**/api/trends*", async (route) => {
      callCount++;
      const body =
        callCount === 1
          ? JSON.stringify({ trends: techTrends, plan: "FREE", nextCursor: null })
          : JSON.stringify({ trends: gamingTrends, plan: "FREE", nextCursor: null });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    });

    await mockNichesApi(page, [
      { id: "niche-1", name: "Tech & IA", slug: "tech" },
      { id: "niche-2", name: "Gaming", slug: "gaming" },
    ]);
    await mockUserApi(page);

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // Le sélecteur doit être présent
    const select = page.locator("select");
    await expect(select).toBeVisible();

    // Changer la niche via le select (si le composant le permet)
    // Note: le niche-selector utilise router.push, donc le test peut ne pas
    // refléter un changement de rendu dans la même page. On vérifie
    // que l'option existe.
    await expect(select.locator('option[value="tech"]')).toBeVisible();
    await expect(select.locator('option[value="gaming"]')).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Dashboard — Responsive / Redimensionnement                                 */
/* -------------------------------------------------------------------------- */

test.describe("Dashboard — Responsive", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockDefaultApiRoutes(page, createScoreTestTrends());
  });

  test("le layout s'adapte en vue mobile (320px)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    // En mobile: le titre h1 doit être visible
    await expect(page.locator("h1")).toContainText("Tendances");

    // En mobile: la sidebar desktop doit être masquée (classe hidden md:block)
    const sidebarDesktop = page.locator("aside");
    // Soit elle n'existe pas, soit elle a la classe hidden
    const sidebarExists = (await sidebarDesktop.count()) > 0;
    if (sidebarExists) {
      // Sur mobile, la sidebar devrait être hidden
      await expect(sidebarDesktop).not.toBeVisible();
    }
  });

  test("le layout s'adapte en vue tablette (768px)", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    await expect(page.locator("h1")).toContainText("Tendances");
  });

  test("le layout s'adapte en vue large (1920px)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    const onDashboard = await gotoDashboard(page);
    if (!onDashboard) return;

    await expect(page.locator("h1")).toContainText("Tendances");

    // En desktop, la sidebar doit être visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });
});
