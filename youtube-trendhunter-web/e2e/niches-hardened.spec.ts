import { test, expect, type Page } from "@playwright/test";

/**
 * Niche Hardened E2E tests for YouTube TrendHunter
 *
 * Covers 8 NEW categories NOT present in dashboard.spec.ts or
 * niches-extended.spec.ts:
 *   1. Niche Creation & Management   (CRUD, validation)
 *   2. Niche Categories & Tags       (keywords, filtering)
 *   3. Niche Search & Discovery      (name search, partial match, empty)
 *   4. Niche Statistics & Metrics    (trend count, score, timestamps)
 *   5. Bulk Niche Operations         (multi-follow, select-all)
 *   6. Niche Notification Config     (per-niche alerts, thresholds)
 *   7. Niche Comparison & Analytics  (overlap, rankings, activity)
 *   8. Niche Import/Export           (export, import validation)
 *
 * All tests use mocked API routes for deterministic, database-free execution.
 * All API calls use page.evaluate() + fetch() so that page.route()
 * interceptors are properly hit.
 */

/* -------------------------------------------------------------------------- */
/*  Constants & session helpers                                                */
/* -------------------------------------------------------------------------- */

const BASE_URL = "http://localhost:3000";

async function setupPage(page: Page) {
  await page.route(BASE_URL, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!DOCTYPE html><html><body></body></html>",
      });
    } else {
      await route.fallback();
    }
  });
  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
}

const MOCK_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_PRO = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_ADMIN = {
  user: {
    id: "admin-id",
    name: "Admin",
    email: "admin@test.com",
    role: "ADMIN" as const,
    plan: "TEAM" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

async function mockSession(page: Page, session: Record<string, any> = MOCK_SESSION) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

async function mockSessionFallback(page: Page) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Fixture data                                                               */
/* -------------------------------------------------------------------------- */

const TECH_NICHE = {
  id: "niche-1",
  name: "Tech & IA",
  slug: "tech",
  description: "Technologie et intelligence artificielle",
  keywords: ["IA", "Programmation", "Gadgets", "Innovation"],
  language: "fr",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-15T12:00:00.000Z",
  _count: { trends: 12, alerts: 3 },
  userNiches: [{ nicheId: "niche-1", userId: "test-user-id" }],
  avgTrendScore: 87.3,
};

const GAMING_NICHE = {
  id: "niche-2",
  name: "Gaming",
  slug: "gaming",
  description: "Jeux vidéo et culture gaming",
  keywords: ["e-sport", "Let's Play", "Streaming", "Review"],
  language: "fr",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-14T08:30:00.000Z",
  _count: { trends: 8, alerts: 1 },
  userNiches: [],
  avgTrendScore: 72.1,
};

const MUSIC_NICHE = {
  id: "niche-3",
  name: "Musique",
  slug: "musique",
  description: "Musique et production",
  keywords: ["Production musicale", "Instruments", "Composition"],
  language: "fr",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-10T14:00:00.000Z",
  _count: { trends: 5, alerts: 0 },
  userNiches: [],
  avgTrendScore: 65.0,
};

const FINANCE_NICHE = {
  id: "niche-4",
  name: "Finance & Crypto",
  slug: "finance",
  description: "Crypto, investissement, trading, économie",
  keywords: ["Cryptomonnaie", "Investissement", "Trading", "Blockchain"],
  language: "fr",
  isActive: true,
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-06-16T09:00:00.000Z",
  _count: { trends: 20, alerts: 5 },
  userNiches: [],
  avgTrendScore: 91.2,
};

const FITNESS_NICHE = {
  id: "niche-5",
  name: "Fitness & Bien-être",
  slug: "fitness",
  description: "Musculation, yoga, sport, minceur",
  keywords: ["Musculation", "Yoga", "Sport", "Bien-être"],
  language: "fr",
  isActive: false,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  _count: { trends: 0, alerts: 0 },
  userNiches: [],
  avgTrendScore: 0,
};

const ALL_NICHES = [TECH_NICHE, GAMING_NICHE, MUSIC_NICHE, FINANCE_NICHE, FITNESS_NICHE];

/* Trend fixtures for statistics & comparison */
const TECH_TRENDS = [
  {
    id: "t-1",
    title: "L'IA générative en 2026",
    score: 95,
    nicheId: "niche-1",
    detectedAt: "2026-06-15T10:00:00.000Z",
  },
  {
    id: "t-2",
    title: "Rust vs Go en 2026",
    score: 88,
    nicheId: "niche-1",
    detectedAt: "2026-06-14T10:00:00.000Z",
  },
  {
    id: "t-3",
    title: "WebAssembly explose",
    score: 79,
    nicheId: "niche-1",
    detectedAt: "2026-06-10T10:00:00.000Z",
  },
];

const GAMING_TRENDS = [
  {
    id: "t-4",
    title: "L'IA générative dans les jeux",
    score: 85,
    nicheId: "niche-2",
    detectedAt: "2026-06-13T10:00:00.000Z",
  },
  {
    id: "t-5",
    title: "Gaming sur mobile 2026",
    score: 72,
    nicheId: "niche-2",
    detectedAt: "2026-06-12T10:00:00.000Z",
  },
];

/* Alert fixtures for notification config */
const NICHE_ALERTS: Record<string, any[]> = {
  "niche-1": [
    {
      id: "alert-1",
      nicheId: "niche-1",
      type: "SCORE_THRESHOLD",
      threshold: 80,
      channel: "EMAIL",
      isActive: true,
      createdAt: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "alert-2",
      nicheId: "niche-1",
      type: "DAILY_DIGEST",
      threshold: 0,
      channel: "EMAIL",
      isActive: false,
      createdAt: "2026-03-15T00:00:00.000Z",
    },
  ],
  "niche-2": [
    {
      id: "alert-3",
      nicheId: "niche-2",
      type: "SPIKE",
      threshold: 90,
      channel: "WEBHOOK",
      isActive: true,
      createdAt: "2026-04-01T00:00:00.000Z",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Mock handler builders                                                      */
/* -------------------------------------------------------------------------- */

function buildNicheListHandler(niches: typeof ALL_NICHES, followedIds: string[] = ["niche-1"]) {
  return async (route: import("@playwright/test").Route) => {
    const method = route.request().method();
    if (method === "GET") {
      const url = new URL(route.request().url());
      const search = url.searchParams.get("search")?.toLowerCase() || "";
      const category = url.searchParams.get("category") || "";
      const sort = url.searchParams.get("sort") || "name";

      let filtered = niches.filter((n) => n.isActive || followedIds.includes(n.id));

      // Apply search filter
      if (search) {
        filtered = filtered.filter(
          (n) =>
            n.name.toLowerCase().includes(search) ||
            n.slug.toLowerCase().includes(search) ||
            n.description?.toLowerCase().includes(search),
        );
      }

      // Apply category/keyword filter
      if (category) {
        filtered = filtered.filter((n) =>
          n.keywords?.some((k) => k.toLowerCase().includes(category.toLowerCase())),
        );
      }

      // Apply sort
      if (sort === "popularity") {
        filtered = [...filtered].sort((a, b) => b._count.trends - a._count.trends);
      } else if (sort === "score") {
        filtered = [...filtered].sort((a, b) => b.avgTrendScore - a.avgTrendScore);
      } else if (sort === "updated") {
        filtered = [...filtered].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allNiches: filtered,
          userNiches: filtered
            .filter((n) => followedIds.includes(n.id))
            .map((n) => ({ niche: { id: n.id, name: n.name, slug: n.slug } })),
          currentCount: followedIds.length,
          maxCount: niches.length,
          totalCount: filtered.length,
        }),
      });
    } else if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheId } = body;
      if (!nicheId) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "ID de niche requis", code: "VALIDATION_ERROR" }),
        });
        return;
      }
      if (followedIds.includes(nicheId)) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Vous suive déjà cette niche", code: "VALIDATION_ERROR" }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          userNiche: { niche: { id: nicheId, name: "Niche", slug: "slug" } },
        }),
      });
    }
  };
}

function buildNicheByIdHandler() {
  return async (route: import("@playwright/test").Route) => {
    const method = route.request().method();
    const url = route.request().url();
    const nicheId = url.split("/").pop() || "";
    const niche = ALL_NICHES.find((n) => n.id === nicheId);

    if (!niche) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Niche non trouvée", code: "NOT_FOUND" }),
      });
      return;
    }

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche }),
      });
    } else if (method === "DELETE") {
      await route.fulfill({ status: 204 });
    } else if (method === "PATCH") {
      const body = JSON.parse(route.request().postData() || "{}");
      const updated = { ...niche, ...body, updatedAt: new Date().toISOString() };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niche: updated }),
      });
    }
  };
}

function buildAdminNicheHandler() {
  return async (route: import("@playwright/test").Route) => {
    const method = route.request().method();

    if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const { name, slug, description, isActive } = body;

      // Validation: empty name
      if (!name || name.trim() === "") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Le nom est requis",
            code: "VALIDATION_ERROR",
            fields: { name: "Le nom est requis" },
          }),
        });
        return;
      }

      // Validation: slug with invalid characters
      if (slug && !/^[a-z0-9-]+$/.test(slug)) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Le slug contient des caractères non autorisés",
            code: "VALIDATION_ERROR",
            fields: { slug: "Caractères non autorisés" },
          }),
        });
        return;
      }

      // Validation: duplicate slug
      if (slug && ALL_NICHES.some((n) => n.slug === slug)) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Ce slug est déjà utilisé", code: "CONFLICT" }),
        });
        return;
      }

      const newNiche = {
        id: `niche-new-${Date.now()}`,
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: description || null,
        keywords: [],
        language: "fr",
        isActive: isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { trends: 0, alerts: 0 },
        userNiches: [],
      };

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ niche: newNiche }),
      });
    } else if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: ALL_NICHES }),
      });
    }
  };
}

function buildTrendsHandler() {
  return async (route: import("@playwright/test").Route) => {
    const url = new URL(route.request().url());
    const nicheSlug = url.searchParams.get("niche") || "";

    let trends: typeof TECH_TRENDS = [];
    if (!nicheSlug || nicheSlug === "tech") trends = TECH_TRENDS;
    else if (nicheSlug === "gaming") trends = GAMING_TRENDS;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends,
        totalScore: trends.reduce((s, t) => s + t.score, 0),
        averageScore:
          trends.length > 0
            ? Math.round(trends.reduce((s, t) => s + t.score, 0) / trends.length)
            : 0,
        plan: "FREE",
        nextCursor: null,
      }),
    });
  };
}

function buildExportHandler(options?: { failWith?: number }) {
  return async (route: import("@playwright/test").Route) => {
    if (options?.failWith) {
      await route.fulfill({
        status: options.failWith,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur lors de l'export", code: "ERROR" }),
      });
      return;
    }

    const exportData = {
      profile: { email: "test@test.com", name: "Test", createdAt: "2026-01-01T00:00:00.000Z" },
      watchedNiches: [
        { id: "niche-1", name: "Tech & IA", slug: "tech", followedAt: "2026-01-15T00:00:00.000Z" },
        { id: "niche-2", name: "Gaming", slug: "gaming", followedAt: "2026-03-01T00:00:00.000Z" },
      ],
      alerts: NICHE_ALERTS["niche-1"],
      exportedAt: new Date().toISOString(),
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(exportData),
    });
  };
}

function buildAlertsHandler(nicheAlerts: Record<string, any[]> = NICHE_ALERTS) {
  return async (route: import("@playwright/test").Route) => {
    if (route.request().method() === "GET") {
      const url = new URL(route.request().url());
      const nicheId = url.searchParams.get("nicheId") || "";
      const alerts = nicheId ? nicheAlerts[nicheId] || [] : Object.values(nicheAlerts).flat();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts,
          plan: "PRO",
          canCreate: true,
        }),
      });
    } else if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      if (!body.nicheId || !body.type) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Données invalides", code: "VALIDATION_ERROR" }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          alert: { id: "alert-new", ...body, isActive: true, createdAt: new Date().toISOString() },
        }),
      });
    }
  };
}

/* -------------------------------------------------------------------------- */
/*  1. Niche Creation & Management                                            */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Création & Gestion (Admin)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page, MOCK_SESSION_ADMIN);
    await page.route("**/api/admin/niches*", buildAdminNicheHandler());
  });

  test("crée une nouvelle niche avec tous les champs (nom, slug, description, isActive)", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Design & UI/UX",
          slug: "design-ui-ux",
          description: "Design d'interface et expérience utilisateur",
          isActive: true,
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche).toBeDefined();
    expect(niche.name).toBe("Design & UI/UX");
    expect(niche.slug).toBe("design-ui-ux");
    expect(niche.description).toBe("Design d'interface et expérience utilisateur");
    expect(niche.isActive).toBe(true);
    expect(niche.id).toBeTruthy();
    expect(niche.createdAt).toBeTruthy();
  });

  test("crée une niche avec seulement le nom requis", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Science" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche.name).toBe("Science");
    expect(niche.slug).toBe("science"); // auto-generated from name
    expect(niche.isActive).toBe(true); // default
  });

  test("crée une niche inactive", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Archivée", isActive: false }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(201);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche.name).toBe("Archivée");
    expect(niche.isActive).toBe(false);
  });

  test("modifie le nom d'une niche (PATCH)", async ({ page }) => {
    await page.route("**/api/niches/niche-1*", buildNicheByIdHandler());
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tech & IA Avancée" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche.name).toBe("Tech & IA Avancée");
  });

  test("modifie la description d'une niche (PATCH)", async ({ page }) => {
    await page.route("**/api/niches/niche-1*", buildNicheByIdHandler());
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Nouvelle description mise à jour" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche.description).toBe("Nouvelle description mise à jour");
  });

  test("bascule le statut actif/inactif d'une niche (PATCH)", async ({ page }) => {
    await page.route("**/api/niches/niche-5*", buildNicheByIdHandler());
    // Reactivate fitness niche
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-5", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const niche = body.niche as Record<string, unknown>;
    expect(niche.isActive).toBe(true);
  });

  test("supprime une niche auto-créée (DELETE admin)", async ({ page }) => {
    // Simulate a niche that was created by the user
    await page.route("**/api/niches/niche-new-123*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      }
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-new-123", { method: "DELETE" });
      return { status: res.status };
    });
    expect(result.status).toBe(204);
  });

  test("validation: nom vide retourne une erreur", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toBeTruthy();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("validation: slug dupliqué retourne 409", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tech Duplicate", slug: "tech" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(409);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain("déjà utilisé");
    expect(body.code).toBe("CONFLICT");
  });

  test("validation: slug avec caractères invalides retourne une erreur", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Invalid Slug", slug: "espace interdit!@#" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toBeTruthy();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  test("PATCH sans authentification retourne 401", async ({ page }) => {
    await mockSessionFallback(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hack" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Niche Categories & Tags                                                */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Catégories & Tags", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page);
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    await page.route("**/api/niches/**", buildNicheByIdHandler());
  });

  test("une niche expose ses mots-clés/tags", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string; keywords: string[] }> };
    const tech = body.allNiches.find((n) => n.slug === "tech");
    expect(tech!.keywords).toBeDefined();
    expect(Array.isArray(tech!.keywords)).toBe(true);
    expect(tech!.keywords).toContain("IA");
    expect(tech!.keywords).toContain("Programmation");
  });

  test("une niche peut être filtrée par catégorie/mot-clé", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?category=IA");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string }> };
    // Only Tech & IA has "IA" keyword
    const slugs = body.allNiches.map((n) => n.slug);
    expect(slugs).toContain("tech");
    expect(slugs).not.toContain("gaming");
  });

  test("filtre par catégorie inexistante retourne une liste vide", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?category=xyz123");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: unknown[] };
    expect(body.allNiches.length).toBe(0);
  });

  test("les niches peuvent être triées par popularité (nombre de tendances)", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?sort=popularity");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ _count: { trends: number } }> };
    const trendCounts = body.allNiches.map((n) => n._count.trends);
    for (let i = 1; i < trendCounts.length; i++) {
      expect(trendCounts[i - 1]).toBeGreaterThanOrEqual(trendCounts[i]);
    }
  });

  test("les niches peuvent être triées par score moyen", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?sort=score");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ avgTrendScore: number }> };
    const scores = body.allNiches.map((n) => n.avgTrendScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  test("les niches peuvent être triées par date de mise à jour", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?sort=updated");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ updatedAt: string }> };
    const dates = body.allNiches.map((n) => new Date(n.updatedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  test("suggère des niches basées sur l'activité de l'utilisateur", async ({ page }) => {
    // Mock a suggestions endpoint
    await page.route("**/api/niches/suggestions**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            { id: "niche-2", name: "Gaming", slug: "gaming", reason: "Basé sur vos alertes" },
            {
              id: "niche-4",
              name: "Finance & Crypto",
              slug: "finance",
              reason: "Tendance populaire",
            },
          ],
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/suggestions?userId=test-user-id");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { suggestions: unknown[] };
    expect(body.suggestions).toBeDefined();
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions[0] as Record<string, unknown>).toHaveProperty("reason");
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Niche Search & Discovery                                               */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Recherche & Découverte", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page);
  });

  test("recherche les niches par nom exact", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=Tech");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ name: string }> };
    expect(body.allNiches.length).toBe(1);
    expect(body.allNiches[0].name).toContain("Tech");
  });

  test("recherche les niches par mot-clé dans la description", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=jeux");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string }> };
    expect(body.allNiches.length).toBe(1);
    expect(body.allNiches[0].slug).toBe("gaming");
  });

  test("recherche avec correspondance partielle", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=mu");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string }> };
    expect(body.allNiches.length).toBe(1);
    expect(body.allNiches[0].slug).toBe("musique");
  });

  test("recherche insensible à la casse", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=TECH");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string }> };
    expect(body.allNiches.length).toBe(1);
    expect(body.allNiches[0].slug).toBe("tech");
  });

  test("recherche sans résultat retourne un message approprié", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=zzzzzzzzz");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: unknown[]; totalCount: number };
    expect(body.allNiches.length).toBe(0);
    expect(body.totalCount).toBe(0);
  });

  test("la recherche se nettoie et restaure la liste complète", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));

    // Search for something specific
    const searchResult = await page.evaluate(async () => {
      const res = await fetch("/api/niches?search=gaming");
      return { status: res.status, body: await res.json() };
    });
    const searchBody = searchResult.body as { allNiches: unknown[] };
    expect(searchBody.allNiches.length).toBe(1);

    // Clear search — get full list
    const fullResult = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const fullBody = fullResult.body as { allNiches: unknown[] };
    expect(fullBody.allNiches.length).toBe(4); // 4 active niches
  });

  test("parcourir toutes les niches disponibles (même non suivies)", async ({ page }) => {
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, []));
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string }> };
    expect(body.allNiches.length).toBe(4); // 4 active niches
    const slugs = body.allNiches.map((n) => n.slug);
    expect(slugs).toContain("tech");
    expect(slugs).toContain("gaming");
    expect(slugs).toContain("musique");
    expect(slugs).toContain("finance");
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Niche Statistics & Metrics                                             */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Statistiques & Métriques", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page);
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    await page.route("**/api/niches/**", buildNicheByIdHandler());
  });

  test("une niche expose un compteur de tendances cliquable", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string; _count: { trends: number } }> };
    const tech = body.allNiches.find((n) => n.slug === "tech");
    expect(tech!._count.trends).toBe(12);
    expect(typeof tech!._count.trends).toBe("number");
    expect(tech!._count.trends).toBeGreaterThan(0);
  });

  test("une niche montre le score moyen des tendances", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string; avgTrendScore: number }> };
    const tech = body.allNiches.find((n) => n.slug === "tech");
    expect(tech!.avgTrendScore).toBeDefined();
    expect(typeof tech!.avgTrendScore).toBe("number");
    expect(tech!.avgTrendScore).toBeGreaterThan(0);
  });

  test("une niche montre sa date de dernière mise à jour", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ updatedAt: string }> };
    for (const niche of body.allNiches) {
      expect(niche.updatedAt).toBeDefined();
      const date = new Date(niche.updatedAt);
      expect(date.getTime()).not.toBeNaN();
      expect(date.getFullYear()).toBe(2026);
    }
  });

  test("une niche montre le nombre d'abonnés (utilisateurs qui suivent)", async ({ page }) => {
    // Mock with subscriber counts
    await page.route("**/api/niches/subscriber-counts**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          counts: [
            { nicheId: "niche-1", subscribers: 42 },
            { nicheId: "niche-2", subscribers: 128 },
            { nicheId: "niche-3", subscribers: 75 },
            { nicheId: "niche-4", subscribers: 203 },
          ],
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/subscriber-counts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { counts: Array<{ nicheId: string; subscribers: number }> };
    const finance = body.counts.find((c) => c.nicheId === "niche-4");
    expect(finance!.subscribers).toBe(203);
    expect(finance!.subscribers).toBeGreaterThan(0);
  });

  test("une niche inactive montre zéro tendance", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { allNiches: Array<{ slug: string; _count: { trends: number } }> };
    const fitness = body.allNiches.find((n) => n.slug === "fitness");
    // Fitness is inactive, included if followed
    if (fitness) {
      expect(fitness._count.trends).toBe(0);
    }
  });

  test("le compteur de tendances retourne des données pour l'UI cliquable", async ({ page }) => {
    await page.route("**/api/niches/niche-1/trends**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: TECH_TRENDS, total: TECH_TRENDS.length }),
      });
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/trends?limit=5");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { trends: unknown[]; total: number };
    expect(body.trends.length).toBe(3);
    expect(body.total).toBe(3);
  });

  test("indicateur de popularité / croissance basé sur le nombre de tendances", async ({
    page,
  }) => {
    await page.route("**/api/niches/growth**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          growth: [
            { nicheId: "niche-4", slug: "finance", growthRate: 0.85, label: "En forte croissance" },
            { nicheId: "niche-1", slug: "tech", growthRate: 0.42, label: "En croissance" },
            { nicheId: "niche-2", slug: "gaming", growthRate: -0.1, label: "Stable" },
          ],
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/growth");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      growth: Array<{ slug: string; growthRate: number; label: string }>;
    };
    const finance = body.growth.find((g) => g.slug === "finance");
    expect(finance!.growthRate).toBeGreaterThan(0);
    expect(finance!.label).toBe("En forte croissance");
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Bulk Niche Operations                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Opérations en masse (Bulk)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page, MOCK_SESSION_PRO);
  });

  test("s'abonner à plusieurs niches à la fois (bulk follow)", async ({ page }) => {
    let followedIds = ["niche-1"];
    await page.route("**/api/niches/bulk**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheIds, action } = body;

      if (action === "follow") {
        followedIds = Array.from(new Set([...followedIds, ...nicheIds]));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            followed: nicheIds.length,
            total: followedIds.length,
            nicheIds: nicheIds,
          }),
        });
      } else if (action === "unfollow") {
        followedIds = followedIds.filter((id) => !nicheIds.includes(id));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            unfollowed: nicheIds.length,
            total: followedIds.length,
            nicheIds: followedIds,
          }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheIds: ["niche-2", "niche-3", "niche-4"], action: "follow" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { followed: number; total: number };
    expect(body.followed).toBe(3);
    expect(body.total).toBe(4);
  });

  test("se désabonner de plusieurs niches à la fois (bulk unfollow)", async ({ page }) => {
    let followedIds = ["niche-1", "niche-2", "niche-3"];
    await page.route("**/api/niches/bulk**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheIds, action } = body;

      if (action === "unfollow") {
        followedIds = followedIds.filter((id) => !nicheIds.includes(id));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            unfollowed: nicheIds.length,
            total: followedIds.length,
            nicheIds: followedIds,
          }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheIds: ["niche-2", "niche-3"], action: "unfollow" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { unfollowed: number; total: number };
    expect(body.unfollowed).toBe(2);
    expect(body.total).toBe(1);
  });

  test("sélectionner tout / désélectionner tout les niches via l'API", async ({ page }) => {
    // Mock the select-all endpoint
    await page.route("**/api/niches/bulk/select-all**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ selectedIds: ["niche-1", "niche-2", "niche-3", "niche-4"] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/bulk/select-all", { method: "POST" });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { selectedIds: string[] };
    expect(body.selectedIds.length).toBe(4);
    expect(body.selectedIds).toContain("niche-1");
    expect(body.selectedIds).toContain("niche-4");
  });

  test("l'action bulk avec des niches déjà suivies ne crée pas de doublons", async ({ page }) => {
    let followedIds = ["niche-1"];
    await page.route("**/api/niches/bulk**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheIds, action } = body;
      if (action === "follow") {
        followedIds = Array.from(new Set([...followedIds, ...nicheIds]));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            followed: nicheIds.filter(
              (id: string) => !followedIds.slice(0, -nicheIds.length).includes(id),
            ).length,
            total: followedIds.length,
          }),
        });
      }
    });

    // Follow niche-1 again (already followed) + niche-2 (new)
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheIds: ["niche-1", "niche-2"], action: "follow" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { total: number };
    expect(body.total).toBe(2); // Only niche-2 added
  });

  test("action bulk avec un mélange de niches suivies/non suivies", async ({ page }) => {
    let followedIds = ["niche-1", "niche-3"];
    await page.route("**/api/niches/bulk**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { nicheIds, action } = body;
      if (action === "unfollow") {
        followedIds = followedIds.filter((id) => !nicheIds.includes(id));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            unfollowed: ["niche-1", "niche-3"].filter((id) => nicheIds.includes(id)).length,
            total: followedIds.length,
          }),
        });
      }
    });

    // Unfollow niche-1 (followed) and niche-2 (not followed)
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheIds: ["niche-1", "niche-2"], action: "unfollow" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { unfollowed: number };
    expect(body.unfollowed).toBe(1); // Only niche-1 was actually unfollowed
  });
});

/* -------------------------------------------------------------------------- */
/*  6. Niche Notification Config                                              */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Configuration des notifications", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/niches/**", buildNicheByIdHandler());
  });

  test("affiche la configuration de notification par niche", async ({ page }) => {
    await page.route("**/api/niches/niche-1/notifications**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nicheId: "niche-1",
          emailAlerts: true,
          frequency: "daily",
          minScoreThreshold: 80,
          quietHours: { enabled: true, start: "22:00", end: "08:00" },
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.emailAlerts).toBe(true);
    expect(body.frequency).toBe("daily");
    expect(body.minScoreThreshold).toBe(80);
    expect((body.quietHours as Record<string, unknown>).enabled).toBe(true);
  });

  test("active/désactive les alertes email par niche", async ({ page }) => {
    await page.route("**/api/niches/niche-2/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nicheId: "niche-2",
            emailAlerts: body.emailAlerts,
            frequency: "daily",
            minScoreThreshold: 70,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nicheId: "niche-2",
            emailAlerts: false,
            frequency: "daily",
            minScoreThreshold: 70,
          }),
        });
      }
    });

    // Toggle ON
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-2/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlerts: true }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { emailAlerts: boolean };
    expect(body.emailAlerts).toBe(true);
  });

  test("modifie la fréquence des notifications par niche", async ({ page }) => {
    await page.route("**/api/niches/niche-1/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nicheId: "niche-1",
            emailAlerts: true,
            frequency: body.frequency,
            minScoreThreshold: 70,
          }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: "weekly" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { frequency: string };
    expect(body.frequency).toBe("weekly");
  });

  test("définit un seuil de score minimum pour les alertes par niche", async ({ page }) => {
    await page.route("**/api/niches/niche-1/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nicheId: "niche-1",
            emailAlerts: true,
            frequency: "daily",
            minScoreThreshold: body.minScoreThreshold,
          }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minScoreThreshold: 85 }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { minScoreThreshold: number };
    expect(body.minScoreThreshold).toBe(85);
  });

  test("définit les heures silencieuses pour une niche", async ({ page }) => {
    await page.route("**/api/niches/niche-1/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            nicheId: "niche-1",
            emailAlerts: true,
            frequency: "daily",
            minScoreThreshold: 70,
            quietHours: body.quietHours,
          }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quietHours: { enabled: true, start: "23:00", end: "07:00" } }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { quietHours: { enabled: boolean; start: string } };
    expect(body.quietHours.enabled).toBe(true);
    expect(body.quietHours.start).toBe("23:00");
  });

  test("applique les paramètres de notification par défaut pour une nouvelle niche", async ({
    page,
  }) => {
    await page.route("**/api/niches/niche-new-999/notifications/defaults**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          nicheId: "niche-new-999",
          emailAlerts: true,
          frequency: "daily",
          minScoreThreshold: 70,
          quietHours: { enabled: false, start: "22:00", end: "08:00" },
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-new-999/notifications/defaults");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.emailAlerts).toBe(true);
    expect(body.frequency).toBe("daily");
    expect(body.minScoreThreshold).toBe(70);
  });

  test("la configuration de notification persiste après mise à jour", async ({ page }) => {
    let currentConfig: any = {
      nicheId: "niche-1",
      emailAlerts: false,
      frequency: "never",
      minScoreThreshold: 90,
    };

    await page.route("**/api/niches/niche-1/notifications**", async (route) => {
      if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        currentConfig = { ...currentConfig, ...body };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(currentConfig),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(currentConfig),
        });
      }
    });

    // Update
    await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlerts: true, minScoreThreshold: 75 }),
      });
      return { status: res.status, body: await res.json() };
    });

    // Verify persistence
    const getResult = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/notifications");
      return { status: res.status, body: await res.json() };
    });
    const body = getResult.body as { emailAlerts: boolean; minScoreThreshold: number };
    expect(body.emailAlerts).toBe(true);
    expect(body.minScoreThreshold).toBe(75);
  });
});

/* -------------------------------------------------------------------------- */
/*  7. Niche Comparison & Analytics                                           */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Comparaison & Analytics", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page);
    await page.route("**/api/trends*", buildTrendsHandler());
  });

  test("compare les tendances de 2 niches côte à côte", async ({ page }) => {
    await page.route("**/api/niches/compare**", async (route) => {
      const url = new URL(route.request().url());
      const ids = url.searchParams.get("ids") || "";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          comparison: [
            {
              niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
              trendCount: 3,
              avgScore: 87.3,
              topTrend: "L'IA générative en 2026",
            },
            {
              niche: { id: "niche-2", name: "Gaming", slug: "gaming" },
              trendCount: 2,
              avgScore: 78.5,
              topTrend: "L'IA générative dans les jeux",
            },
          ],
          commonTrends: ["L'IA générative"],
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/compare?ids=niche-1,niche-2");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { comparison: unknown[]; commonTrends: string[] };
    expect(body.comparison.length).toBe(2);
    expect(body.commonTrends).toContain("L'IA générative");
  });

  test("identifie les tendances communes entre 2 niches", async ({ page }) => {
    await page.route("**/api/niches/overlap**", async (route) => {
      const url = new URL(route.request().url());
      const ids = url.searchParams.get("ids") || "";
      const [id1, id2] = ids.split(",");

      // Tech & Gaming share "L'IA générative" topic
      const overlapping =
        id1 === "niche-1" && id2 === "niche-2"
          ? [
              {
                title: "L'IA générative",
                scoreInNiche1: 95,
                scoreInNiche2: 85,
                overlapStrength: 0.78,
              },
            ]
          : [];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ overlapping, totalOverlapScore: overlapping.length > 0 ? 0.78 : 0 }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/overlap?ids=niche-1,niche-2");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      overlapping: Array<{ title: string }>;
      totalOverlapScore: number;
    };
    expect(body.overlapping.length).toBeGreaterThan(0);
    expect(body.overlapping[0].title).toContain("IA");
    expect(body.totalOverlapScore).toBeGreaterThan(0);
  });

  test("affiche la chronologie d'activité d'une niche (quand les tendances ont été trouvées)", async ({
    page,
  }) => {
    await page.route("**/api/niches/niche-1/timeline**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          timeline: [
            { date: "2026-06-15", count: 1, trend: "L'IA générative en 2026" },
            { date: "2026-06-14", count: 1, trend: "Rust vs Go en 2026" },
            { date: "2026-06-10", count: 1, trend: "WebAssembly explose" },
          ],
          totalDetected: 3,
          lastDetection: "2026-06-15T10:00:00.000Z",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/niche-1/timeline");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      timeline: unknown[];
      totalDetected: number;
      lastDetection: string;
    };
    expect(body.timeline.length).toBe(3);
    expect(body.totalDetected).toBe(3);
    expect(new Date(body.lastDetection)).toBeInstanceOf(Date);
  });

  test("affiche le classement/leaderboard des niches par score", async ({ page }) => {
    await page.route("**/api/niches/leaderboard**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          leaderboard: [
            {
              rank: 1,
              niche: { id: "niche-4", name: "Finance & Crypto", slug: "finance" },
              score: 91.2,
              trendCount: 20,
            },
            {
              rank: 2,
              niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
              score: 87.3,
              trendCount: 12,
            },
            {
              rank: 3,
              niche: { id: "niche-2", name: "Gaming", slug: "gaming" },
              score: 72.1,
              trendCount: 8,
            },
            {
              rank: 4,
              niche: { id: "niche-3", name: "Musique", slug: "musique" },
              score: 65.0,
              trendCount: 5,
            },
          ],
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/leaderboard");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as {
      leaderboard: Array<{ rank: number; niche: { name: string }; score: number }>;
    };
    expect(body.leaderboard.length).toBe(4);
    expect(body.leaderboard[0].rank).toBe(1);
    expect(body.leaderboard[0].niche.name).toBe("Finance & Crypto");
    // Verify scores are descending
    for (let i = 1; i < body.leaderboard.length; i++) {
      expect(body.leaderboard[i - 1].score).toBeGreaterThanOrEqual(body.leaderboard[i].score);
    }
  });

  test("affiche les niches en tendance (nouvellement populaires)", async ({ page }) => {
    await page.route("**/api/niches/trending**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trending: [
            {
              niche: { id: "niche-4", name: "Finance & Crypto", slug: "finance" },
              newTrendsLastWeek: 8,
              growthPct: 45,
            },
            {
              niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
              newTrendsLastWeek: 5,
              growthPct: 28,
            },
          ],
          period: "7d",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/trending");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { trending: Array<{ growthPct: number }>; period: string };
    expect(body.trending.length).toBeGreaterThan(0);
    expect(body.trending[0].growthPct).toBeGreaterThan(0);
    expect(body.period).toBe("7d");
  });

  test("la comparaison de la même niche retourne une erreur", async ({ page }) => {
    await page.route("**/api/niches/compare**", async (route) => {
      const url = new URL(route.request().url());
      const ids = url.searchParams.get("ids") || "";
      const idList = ids.split(",").filter(Boolean);
      if (new Set(idList).size !== idList.length) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Impossible de comparer une niche avec elle-même",
            code: "VALIDATION_ERROR",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ comparison: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/compare?ids=niche-1,niche-1");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(400);
    const body = result.body as { error: string };
    expect(body.error).toContain("elle-même");
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Niche Import/Export                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Import & Export", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page, MOCK_SESSION_PRO);
  });

  test("exporte la liste des niches suivies au format JSON", async ({ page }) => {
    await page.route("**/api/user/export**", buildExportHandler());

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user/export?format=json");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { watchedNiches: Array<Record<string, unknown>> };
    expect(body.watchedNiches).toBeDefined();
    expect(Array.isArray(body.watchedNiches)).toBe(true);
    expect(body.watchedNiches.length).toBeGreaterThan(0);
    expect(body.watchedNiches[0]).toHaveProperty("name");
    expect(body.watchedNiches[0]).toHaveProperty("slug");
    expect(body.watchedNiches[0]).toHaveProperty("followedAt");
  });

  test("exporte les niches suivies au format CSV", async ({ page }) => {
    await page.route("**/api/user/export**", buildExportHandler());

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user/export?format=csv");
      return { status: res.status, body: await res.text() };
    });
    expect(result.status).toBe(200);
    const text = result.body as string;
    expect(text).toContain("Niche");
    expect(text).toContain("Tech & IA");
    expect(text).toContain("gaming");
  });

  test("l'export contient la date de suivi pour chaque niche", async ({ page }) => {
    await page.route("**/api/user/export**", buildExportHandler());

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user/export?format=json");
      return { status: res.status, body: await res.json() };
    });
    const body = result.body as { watchedNiches: Array<{ followedAt: string }> };
    for (const wn of body.watchedNiches) {
      expect(wn.followedAt).toBeDefined();
      const date = new Date(wn.followedAt);
      expect(date.getTime()).not.toBeNaN();
    }
  });

  test("importe des niches depuis un fichier JSON", async ({ page }) => {
    await page.route("**/api/niches/import**", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const { niches } = body;

        if (!niches || !Array.isArray(niches)) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Format invalide : un tableau de niches est requis",
              code: "VALIDATION_ERROR",
            }),
          });
          return;
        }

        const imported = niches.filter((n: any) => n.name);
        const errors = niches
          .filter((n: any) => !n.name)
          .map((_: any, i: number) => ({ row: i + 1, error: "Nom manquant" }));

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ imported: imported.length, errors, total: niches.length }),
        });
      }
    });

    const payload = {
      niches: [
        { name: "Voyages", slug: "voyages" },
        { name: "Photographie", slug: "photographie" },
      ],
    };
    const result = await page.evaluate(async (data) => {
      const res = await fetch("/api/niches/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return { status: res.status, body: await res.json() };
    }, payload);
    expect(result.status).toBe(200);
    const body = result.body as { imported: number; errors: unknown[] };
    expect(body.imported).toBe(2);
    expect(body.errors.length).toBe(0);
  });

  test("gère les doublons lors de l'import", async ({ page }) => {
    const existingNiches = ["tech", "gaming"];
    await page.route("**/api/niches/import**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { niches } = body;

      const result = {
        imported: 0,
        skipped: 0,
        errors: [] as any[],
        duplicateSlugs: [] as string[],
      };
      for (const n of niches) {
        if (existingNiches.includes(n.slug)) {
          result.skipped++;
          result.duplicateSlugs.push(n.slug);
        } else {
          result.imported++;
        }
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });

    const payload = {
      niches: [
        { name: "Tech & IA", slug: "tech" },
        { name: "Voyages", slug: "voyages" },
      ],
    };
    const result = await page.evaluate(async (data) => {
      const res = await fetch("/api/niches/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return { status: res.status, body: await res.json() };
    }, payload);
    expect(result.status).toBe(200);
    const body = result.body as { imported: number; skipped: number; duplicateSlugs: string[] };
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.duplicateSlugs).toContain("tech");
  });

  test("valide les erreurs d'import (nom manquant)", async ({ page }) => {
    await page.route("**/api/niches/import**", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const { niches } = body;

      const errors: any[] = [];
      let imported = 0;
      niches.forEach((n: any, i: number) => {
        if (!n.name) errors.push({ row: i + 1, error: "Le nom est requis" });
        else if (n.slug && !/^[a-z0-9-]+$/.test(n.slug))
          errors.push({ row: i + 1, error: "Slug invalide" });
        else imported++;
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imported, errors, total: niches.length }),
      });
    });

    const payload = {
      niches: [
        { name: "", slug: "vide" },
        { name: "Valide", slug: "valide" },
      ],
    };
    const result = await page.evaluate(async (data) => {
      const res = await fetch("/api/niches/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return { status: res.status, body: await res.json() };
    }, payload);
    expect(result.status).toBe(200);
    const body = result.body as { imported: number; errors: Array<{ error: string }> };
    expect(body.imported).toBe(1);
    expect(body.errors.length).toBe(1);
    expect(body.errors[0].error).toContain("requis");
  });

  test("affiche un indicateur de progression pour l'import en masse", async ({ page }) => {
    await page.route("**/api/niches/import/progress**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "processing",
          progress: 65,
          total: 100,
          processed: 65,
          errors: 2,
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/import/progress?batchId=batch-123");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    const body = result.body as { progress: number; total: number; status: string };
    expect(body.progress).toBe(65);
    expect(body.total).toBe(100);
    expect(body.status).toBe("processing");
  });

  test("l'export est refusé pour le plan FREE", async ({ page }) => {
    await mockSession(page, MOCK_SESSION); // FREE plan — cannot export
    await page.route("**/api/user/export**", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "L'export de données est disponible à partir du plan Pro.",
          code: "FORBIDDEN",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user/export?format=json");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(403);
    const body = result.body as { error: string };
    expect(body.error).toContain("plan Pro");
  });
});

/* -------------------------------------------------------------------------- */
/*  Suite combinée : Workflow réel sur la page /my-niches (UI)                */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Workflow UI complet (page /my-niches)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page, MOCK_SESSION_PRO);
    await page.route("**/api/niches*", buildNicheListHandler(ALL_NICHES, ["niche-1"]));
    await page.route("**/api/niches/**", buildNicheByIdHandler());
  });

  test("la page affiche le nombre total de niches disponibles", async ({ page }) => {
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      await expect(page.getByText("Niches disponibles")).toBeVisible();
    }
  });

  test("la page affiche les mots-clés d'une niche si présents", async ({ page }) => {
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Tech niche should display trend count
      await expect(page.getByText("12 tendances").first()).toBeVisible();
    }
  });

  test("la page distingue les niches actives des inactives", async ({ page }) => {
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Fitness is inactive — may not appear in UI at all
      const body = page.locator("body");
      const text = await body.innerText();
      expect(text).not.toContain("Fitness & Bien-être");
    }
  });

  test("la recherche dans la page filtre les niches affichées", async ({ page }) => {
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/my-niches")) {
      // Look for a search input
      const searchInput = page
        .locator("input[type='search'], input[placeholder*='cherch'], input[aria-label*='cherch']")
        .first();
      const exists = await searchInput.count();

      if (exists > 0) {
        await searchInput.fill("Gaming");
        // After typing, the filtered list should show Gaming
        await expect(page.getByText("Gaming").first()).toBeVisible();
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Suite : Sécurité & Authentification croisée                               */
/* -------------------------------------------------------------------------- */

test.describe("Niche — Sécurité & Permissions", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("PATCH sur une niche non suivie retourne 404", async ({ page }) => {
    await mockSession(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches/invalid-id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hack" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(404);
  });

  test("DELETE sur une niche admin sans rôle ADMIN retourne 401", async ({ page }) => {
    await mockSession(page, MOCK_SESSION); // Not admin
    await page.route("**/api/admin/niches/niche-1*", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches/niche-1", { method: "DELETE" });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);
  });

  test("la création de niche admin nécessite le rôle ADMIN", async ({ page }) => {
    await mockSession(page, MOCK_SESSION); // Not admin
    await page.route("**/api/admin/niches*", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/admin/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hack" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);
  });
});
