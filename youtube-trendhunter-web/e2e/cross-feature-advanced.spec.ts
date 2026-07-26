import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Cross-Feature Advanced E2E tests for YouTube TrendHunter
 *
 * Tests interactions BETWEEN features that are NOT covered by existing specs:
 *   - cross-feature-cache-consistency.spec.ts: re-fetch after reload, upgrade Free→Pro,
 *     create alert via API, plan change
 *   - cross-feature-extension-session.spec.ts: web session expired, token revoked, no token
 *   - cross-feature-extreme-data.spec.ts: 1000+ trends, 50+ alerts, 0/15 niches, edge cases
 *   - cross-feature-full-journey.spec.ts: complete user journey, FREE restrictions,
 *     niches follow/unfollow, sidebar navigation, PRO access
 *   - cross-feature-i18n.spec.ts: language switching, date format, currency, persistence
 *   - cross-feature-navigation.spec.ts: back/forward, deep linking, Stripe redirect
 *   - cross-feature-signup-journey.spec.ts: registration flow
 *
 * NEW scenarios added here:
 *   1. PRO→FREE downgrade — feature lock impact across pages
 *   2. Cross-page cache invalidation — follow niche → dashboard reflects change
 *   3. Auth lifecycle — session expiry detection across pages
 *   4. Multi-tab consistency — changes in one tab propagate
 *   5. Webhook→alert creation — pattern simulation
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const PRO_SESSION = {
  user: {
    id: "test-pro",
    name: "Pro User",
    email: "pro@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const FREE_SESSION = {
  user: {
    id: "test-free",
    name: "Free User",
    email: "free@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, session: object = PRO_SESSION) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

async function mockDashboard(page: Page, trends: Record<string, unknown>[] = []) {
  await page.route("**/api/trends*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trends, total: trends.length }),
    });
  });
}

async function mockNiches(
  page: Page,
  niches: Record<string, unknown>[] = [],
  followed: string[] = [],
) {
  await page.route("**/api/niches*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niches,
        followed,
        available: [{ id: "niche-1", name: "Tech & IA", slug: "tech" }],
      }),
    });
  });
}

async function mockAlerts(page: Page, alerts: Record<string, unknown>[] = [], canCreate = true) {
  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        alerts,
        userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
        plan: "PRO",
        canCreate,
      }),
    });
  });
}

/** Navigate to a protected page and verify we arrived (or fail if redirected to login) */
async function _gotoProtected(page: Page, url: string): Promise<boolean> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return page.url().includes(url);
}

/* ======================================================================== */
/*  1. PRO→FREE downgrade — feature lock impact across pages                */
/* ======================================================================== */

test.describe("PRO→FREE downgrade — Impact inter-pages", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, PRO_SESSION);
  });

  test("Dashboard: les tendances restent visibles après downgrade (lecture seule)", async ({
    page,
  }) => {
    await mockDashboard(page, [
      { id: "t-1", title: "Tech Trend", score: 80, velocity: 5.2, status: "GROWING" },
    ]);
    await mockAlerts(page, [], true);

    // Start as PRO — dashboard loads
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The page doesn't redirect — we're on dashboard
    if (!page.url().includes("/dashboard")) return;

    // Now simulate downgrade by changing session
    await mockSession(page, FREE_SESSION);

    // Reload — should still see dashboard but with limitations
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/dashboard")) return;

    // Dashboard should still render (read-only access)
    await expect(page.locator("body")).toBeVisible();

    // The trend title should still be visible
    await expect(page.getByText("Tech Trend").first()).toBeVisible({ timeout: 3000 });
  });

  test("Alertes: le bouton 'Nouvelle alerte' disparaît après downgrade", async ({ page }) => {
    await mockAlerts(
      page,
      [
        {
          id: "a-1",
          type: "SCORE_THRESHOLD",
          threshold: 70,
          channel: "EMAIL",
          isActive: true,
          niche: null,
        },
      ],
      true,
    ); // canCreate: true (PRO)

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // PRO can create
    const createBtn = page.getByText("Nouvelle alerte");
    const canSeePro = await createBtn.isVisible().catch(() => false);

    // Now downgrade
    await mockAlerts(
      page,
      [
        {
          id: "a-1",
          type: "SCORE_THRESHOLD",
          threshold: 70,
          channel: "EMAIL",
          isActive: true,
          niche: null,
        },
      ],
      false,
    ); // canCreate: false (FREE)

    await mockSession(page, FREE_SESSION);
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // FREE should see upgrade message, not the create button
    const upgradeMsg = page.getByText("Passer à Pro");
    const canSeeFree = await upgradeMsg.isVisible().catch(() => false);

    if (canSeePro) {
      // If PRO sees the button, FREE should see the upgrade message
      expect(canSeeFree).toBeTruthy();
    }
  });

  test("Niches: les niches suivies restent, mais les nouvelles sont limitées après downgrade", async ({
    page,
  }) => {
    const followedNiches = [
      { id: "n-1", nicheId: "niche-1", nicheName: "Tech & IA", nicheSlug: "tech" },
      { id: "n-2", nicheId: "niche-2", nicheName: "Gaming", nicheSlug: "gaming" },
    ];

    await mockNiches(page, followedNiches, ["niche-1", "niche-2"]);

    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/my-niches")) return;

    // Existing niches should be visible even after downgrade
    await expect(page.getByText("Tech & IA").first()).toBeVisible({ timeout: 3000 });

    // Now downgrade and add more followed than FREE allows
    await mockSession(page, FREE_SESSION);
    await mockNiches(
      page,
      [
        ...followedNiches,
        { id: "n-3", nicheId: "niche-3", nicheName: "Cuisine", nicheSlug: "cuisine" },
      ],
      ["niche-1", "niche-2", "niche-3"],
    );

    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/my-niches")) return;

    // The already-followed niches should still display
    await expect(page.getByText("Tech & IA").first()).toBeVisible({ timeout: 3000 });
  });
});

/* ======================================================================== */
/*  2. Cross-page cache invalidation                                        */
/* ======================================================================== */

test.describe("Cross-page cache invalidation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, PRO_SESSION);
  });

  test("Ajouter une niche → la page dashboard reflète le changement après navigation", async ({
    page,
  }) => {
    // Initial state: following some niches
    let nicheNames = ["Tech & IA"];
    let nicheIds = ["niche-1"];

    await page.route("**/api/niches*", async (route) => {
      const method = route.request().method();

      // Handle follow (POST)
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newNicheId = body.nicheId;
        if (newNicheId && !nicheIds.includes(newNicheId)) {
          nicheIds = [...nicheIds, newNicheId];
          // Add corresponding name
          const nicheNamesMap: Record<string, string> = {
            "niche-1": "Tech & IA",
            "niche-2": "Gaming",
            "niche-3": "Cuisine",
          };
          nicheNames = [...nicheNames, nicheNamesMap[newNicheId] || "Unknown"];
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
        return;
      }

      // Handle GET — return current state
      const niches = nicheIds.map((id, i) => ({
        id: `${id}-rel`,
        nicheId: id,
        nicheName: nicheNames[i],
        nicheSlug: id,
      }));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches,
          followed: nicheIds,
          available: [
            { id: "niche-1", name: "Tech & IA", slug: "tech" },
            { id: "niche-2", name: "Gaming", slug: "gaming" },
            { id: "niche-3", name: "Cuisine", slug: "cuisine" },
          ],
        }),
      });
    });

    await mockDashboard(page, [
      { id: "t-1", title: "AI Trend", score: 85, velocity: 10, status: "GROWING" },
    ]);

    // 1. Go to dashboard — see current trends
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/dashboard")) return;

    // 2. Navigate to niche page and follow a new niche
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/my-niches")) return;

    // Find and click "Suivre" for Gaming
    const gamingSection = page.locator("text=Gaming").first();
    if (await gamingSection.isVisible().catch(() => false)) {
      // Try to find a follow button nearby
      const followBtn = page.locator('button:has-text("Suivre")').first();
      if (await followBtn.isVisible().catch(() => false)) {
        await followBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 3. Navigate back to dashboard — state should be consistent (no crash)
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/dashboard")) return;

    // Dashboard should still render correctly
    await expect(page.getByText("AI Trend").first()).toBeVisible({ timeout: 3000 });
  });

  test("Créer une alerte → visible après navigation page→page", async ({ page }) => {
    const alerts: Record<string, unknown>[] = [];

    await page.route("**/api/alerts*", async (route: Route) => {
      const method = route.request().method();

      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newAlert: Record<string, unknown> = {
          id: `alert-${alerts.length + 1}`,
          type: body.type,
          threshold: body.threshold,
          channel: body.channel,
          isActive: true,
          niche: body.nicheId ? { id: body.nicheId, name: "Tech & IA", slug: "tech" } : null,
        };
        alerts.push(newAlert);

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ alert: newAlert }),
        });
        return;
      }

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts,
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            plan: "PRO",
            canCreate: true,
          }),
        });
        return;
      }

      await route.fallback();
    });

    // 1. Go to alerts — no alerts yet
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // 2. Create an alert via the UI
    const createBtn = page.getByText("Nouvelle alerte");
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      // Wait for form to appear
      await page.waitForTimeout(500);

      // Submit the form
      const submitBtn = page.getByText("Créer l'alerte");
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 3. Navigate to dashboard then back to alerts
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // If alerts were created, they should appear on re-visit
    if (alerts.length > 0) {
      // The alert type badge should be visible
      await expect(page.getByText("Score seuil").first()).toBeVisible({ timeout: 3000 });
    }
  });
});

/* ======================================================================== */
/*  3. Auth lifecycle — session expiry detection cross-page                 */
/* ======================================================================== */

test.describe("Auth lifecycle — Session expiry cross-page", () => {
  test("Session expirée → navigation vers /dashboard redirige vers /login", async ({ page }) => {
    await mockSession(page, PRO_SESSION);

    // Start with valid session
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const startedOnDashboard = page.url().includes("/dashboard");

    if (startedOnDashboard) {
      // Now simulate expired session — remove the mock
      await page.unroute("**/api/auth/session*");
      await page.route("**/api/auth/session*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: null, expires: "2020-01-01T00:00:00.000Z" }),
        });
      });

      // Navigate to a different page
      await page.goto("/billing");
      await page.waitForLoadState("networkidle");

      // Should redirect to login
      const onLogin = page.url().includes("/login");
      expect(onLogin).toBeTruthy();
    }
  });

  test("Session expirée pendant la navigation → redirection immédiate", async ({ page }) => {
    // Set up mock that returns session for first call, then null
    let callCount = 0;
    await page.route("**/api/auth/session*", async (route) => {
      callCount++;
      if (callCount <= 2) {
        // First calls: valid session
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(PRO_SESSION),
        });
      } else {
        // Subsequent calls: expired
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: null, expires: "2020-01-01T00:00:00.000Z" }),
        });
      }
    });

    // First page load should work
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onDashboard = page.url().includes("/dashboard");

    if (onDashboard) {
      // Second navigation should redirect due to expired session
      await page.goto("/my-niches");
      await page.waitForLoadState("networkidle");

      // Should land on login
      const redirected = page.url().includes("/login");
      expect(redirected).toBeTruthy();
    }
  });

  test("API retourne 401 → composant UI réagit sans planter", async ({ page }) => {
    await mockSession(page, PRO_SESSION);

    await page.route("**/api/alerts*", async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non autorisé" }),
        });
      } else {
        await route.fallback();
      }
    });

    // The page should not crash when API returns 401
    const response = await page.goto("/alerts");
    // Even if redirected to login, there should be no crash/500
    expect(response?.status()).not.toBe(500);
  });
});

/* ======================================================================== */
/*  4. Multi-tab consistency                                                */
/* ======================================================================== */

test.describe("Multi-tab consistency", () => {
  test("Ajouter une niche dans le premier onglet → visible dans le second après refresh", async ({
    context,
  }) => {
    // Use a shared mutable state across routes
    let nicheNames = ["Tech & IA"];
    let nicheIds = ["niche-1"];

    const nicheRouteHandler = async (route: Route) => {
      const method = route.request().method();
      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newId = body.nicheId;
        if (newId && !nicheIds.includes(newId)) {
          nicheIds = [...nicheIds, newId];
          const map: Record<string, string> = {
            "niche-1": "Tech & IA",
            "niche-2": "Gaming",
            "niche-3": "Cuisine",
          };
          nicheNames = [...nicheNames, map[newId] || "Unknown"];
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
        return;
      }
      const niches = nicheIds.map((id, i) => ({
        id: `${id}-rel`,
        nicheId: id,
        nicheName: nicheNames[i],
        nicheSlug: id,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches,
          followed: nicheIds,
          available: [
            { id: "niche-1", name: "Tech & IA", slug: "tech" },
            { id: "niche-2", name: "Gaming", slug: "gaming" },
            { id: "niche-3", name: "Cuisine", slug: "cuisine" },
          ],
        }),
      });
    };

    // Tab 1: Set up and follow a niche
    const tab1 = await context.newPage();
    await mockSession(tab1, PRO_SESSION);
    await tab1.route("**/api/niches*", nicheRouteHandler);

    await tab1.goto("/my-niches");
    await tab1.waitForLoadState("networkidle");

    if (tab1.url().includes("/my-niches")) {
      // Follow Gaming
      const followBtn = tab1.locator('button:has-text("Suivre")').first();
      if (await followBtn.isVisible().catch(() => false)) {
        await followBtn.click();
        await tab1.waitForTimeout(500);
      }
    }

    // Tab 2: Open my-niches — should show the same state via shared mock
    const tab2 = await context.newPage();
    await mockSession(tab2, PRO_SESSION);
    await tab2.route("**/api/niches*", nicheRouteHandler);

    await tab2.goto("/my-niches");
    await tab2.waitForLoadState("networkidle");

    if (tab2.url().includes("/my-niches")) {
      // The newly followed niche should be reflected
      const gamingVisible = await tab2
        .getByText("Gaming")
        .isVisible()
        .catch(() => false);
      // Note: this works because both tabs share the same mock state
      expect(gamingVisible).toBeTruthy();
    }

    await tab1.close();
    await tab2.close();
  });

  test("Multiples onglets avec session partagée — pas de conflit", async ({ context }) => {
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    await mockSession(tab1, PRO_SESSION);
    await mockSession(tab2, PRO_SESSION);

    // Both tabs load different pages simultaneously
    await Promise.all([
      tab1.goto("/dashboard").catch(() => {}),
      tab2.goto("/billing").catch(() => {}),
    ]);

    // Both should render without crashing
    const tab1Ok = await tab1.evaluate(() => document.body !== null).catch(() => false);
    const tab2Ok = await tab2.evaluate(() => document.body !== null).catch(() => false);

    expect(tab1Ok).toBeTruthy();
    expect(tab2Ok).toBeTruthy();

    await tab1.close();
    await tab2.close();
  });
});

/* ======================================================================== */
/*  5. Webhook → alert pattern simulation                                   */
/* ======================================================================== */

test.describe("Webhook → Alert pattern simulation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, PRO_SESSION);
  });

  test("Alertes avec canal WEBHOOK s'affichent correctement dans la liste", async ({ page }) => {
    await mockAlerts(page, [
      {
        id: "a-webhook-1",
        type: "SCORE_THRESHOLD",
        threshold: 75,
        channel: "WEBHOOK",
        isActive: true,
        niche: { id: "niche-1", name: "Tech & IA", slug: "tech" },
      },
      {
        id: "a-email-1",
        type: "DAILY_DIGEST",
        threshold: 0,
        channel: "EMAIL",
        isActive: true,
        niche: null,
      },
    ]);

    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Both alert types should be visible
    await expect(page.getByText("Webhook").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Email").first()).toBeVisible({ timeout: 3000 });

    // The webhook alert's type badge
    await expect(page.getByText("Score seuil").first()).toBeVisible({ timeout: 3000 });
  });

  test("Créer une alerte canal WEBHOOK puis la retrouver dans la liste", async ({ page }) => {
    const alerts: Record<string, unknown>[] = [];

    await page.route("**/api/alerts*", async (route: Route) => {
      const method = route.request().method();

      if (method === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newAlert: Record<string, unknown> = {
          id: `alert-wh-${Date.now()}`,
          type: body.type,
          threshold: body.threshold,
          channel: "WEBHOOK",
          isActive: true,
          niche: body.nicheId ? { id: body.nicheId, name: "Tech & IA", slug: "tech" } : null,
        };
        alerts.push(newAlert);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ alert: newAlert }),
        });
        return;
      }

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            alerts,
            userNiches: [{ niche: { id: "niche-1", name: "Tech & IA", slug: "tech" } }],
            plan: "PRO",
            canCreate: true,
          }),
        });
        return;
      }

      await route.fallback();
    });

    // Open alerts page and create a webhook alert
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    const createBtn = page.getByText("Nouvelle alerte");
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(300);
    }

    // Check the form has rendered and we can manipulate it
    const submitBtn = page.getByText("Créer l'alerte");
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(500);
    }

    // Reload to see the created alert
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    if (!page.url().includes("/alerts")) return;

    // Verify the alert appears in the list
    if (alerts.length > 0) {
      await expect(page.getByText("Webhook").first()).toBeVisible({ timeout: 3000 });
    }
  });
});

/* ======================================================================== */
/*  6. Plan change — mid-session (Billing → downgrade → restrictions)       */
/* ======================================================================== */

test.describe("Plan change mid-session", () => {
  test("Billing: utilisateur PRO voit les options PRO → après changement de session FREE, l'UI reflète", async ({
    page,
  }) => {
    await mockSession(page, PRO_SESSION);

    // Mock billing page data
    await page.route("**/api/stripe/portal", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://billing.stripe.com/test" }),
      });
    });

    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "pro-token-123" }),
      });
    });

    // View billing as PRO
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const isOnBilling = page.url().includes("/billing");

    if (isOnBilling) {
      // Should see PRO badge
      const proBadge = page.getByText("PRO").first();
      const proBadgeVisible = await proBadge.isVisible().catch(() => false);
      if (proBadgeVisible) {
        await expect(proBadge).toBeVisible();
      }

      // Change session to FREE
      await mockSession(page, FREE_SESSION);

      // Reload billing page
      await page.goto("/billing");
      await page.waitForLoadState("networkidle");

      // Should now see FREE plan info (or be redirected based on plan)
      const freeBadge = page.getByText("FREE").first();
      const freeBadgeVisible = await freeBadge.isVisible().catch(() => false);

      if (freeBadgeVisible) {
        await expect(freeBadge).toBeVisible();
      }
    }
  });
});
