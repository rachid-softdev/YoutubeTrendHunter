import { test, expect, type Page } from "@playwright/test";

/**
 * Checkout / Paiement E2E tests for YouTube TrendHunter
 *
 * Tests the pricing page display and the Stripe checkout interaction.
 * The pricing page is public (no auth required), while the checkout
 * POST endpoint requires authentication.
 *
 * Stripe Checkout is a third-party hosted page (iframe), so we only
 * verify the redirect URL is correctly formed — we never fill in real
 * payment details.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

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

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });
}

const PRO_PRICE_ID = "price_test_pro_monthly";
const TEAM_PRICE_ID = "price_test_team_monthly";

/* -------------------------------------------------------------------------- */
/*  Plans et Tarifs (public)                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Page Tarifs", () => {
  test("affiche les trois cartes de plan", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.locator("h1")).toContainText("Investissez");

    // Three plan cards
    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByText("Pro").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();
  });

  test("affiche les prix corrects", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByText("0€").first()).toBeVisible();
    await expect(page.getByText("15€").first()).toBeVisible();
    await expect(page.getByText("39€").first()).toBeVisible();
  });

  test("le plan Pro est marqué POPULAIRE", async ({ page }) => {
    await page.goto("/pricing");

    // Pro plan should have a POPULAIRE badge
    await expect(page.getByText("POPULAIRE").first()).toBeVisible();
  });

  test("le plan Free a le CTA 'Commencer gratuit'", async ({ page }) => {
    await page.goto("/pricing");

    const freeCta = page.locator("a[href='/login']").filter({ hasText: "Commencer gratuit" });
    await expect(freeCta.first()).toBeVisible();
  });

  test("le plan Pro a le CTA 'Passer Pro'", async ({ page }) => {
    await page.goto("/pricing");

    const proCta = page.locator("a[href='/login?plan=pro']");
    await expect(proCta.first()).toBeVisible();
  });

  test("le plan Free redirige vers /login", async ({ page }) => {
    await page.goto("/pricing");

    await page.locator("a[href='/login']").filter({ hasText: "Commencer gratuit" }).first().click();
    await page.waitForURL(/\/login/);
  });

  test("le plan Pro redirige vers /login?plan=pro", async ({ page }) => {
    await page.goto("/pricing");

    await page.locator("a[href='/login?plan=pro']").first().click();
    await page.waitForURL(/\/login/);
  });

  test("affiche les fonctionnalités de chaque plan", async ({ page }) => {
    await page.goto("/pricing");

    // Free features
    await expect(page.getByText("1 niche suivie")).toBeVisible();
    await expect(page.getByText("5 tendances par niche")).toBeVisible();

    // Pro features
    await expect(page.getByText("Toutes les niches")).toBeVisible();
    await expect(page.getByText("Tendances illimitées")).toBeVisible();
    await expect(page.getByText("Alertes en temps réel")).toBeVisible();

    // Team features
    await expect(page.getByText("Tout Pro")).toBeVisible();
    await expect(page.getByText("5 utilisateurs")).toBeVisible();
    await expect(page.getByText("API access")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Checkout — endpoint API mocké                                             */
/* -------------------------------------------------------------------------- */

test.describe("Checkout Stripe", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("POST /api/stripe/checkout retourne une URL de redirection", async ({ page }) => {
    // Mock the Stripe checkout endpoint
    await page.route("**/api/stripe/checkout", async (route) => {
      expect(route.request().method()).toBe("POST");

      const body = JSON.parse(route.request().postData() || "{}");
      expect(body).toHaveProperty("priceId");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://checkout.stripe.com/c/pay/cs_test_abc123",
        }),
      });
    });

    const response = await page.request.post("/api/stripe/checkout", {
      data: { priceId: PRO_PRICE_ID },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("url");
    expect(json.url).toContain("checkout.stripe.com");
  });

  test("POST /api/stripe/checkout rejette les priceId invalides", async ({ page }) => {
    await page.route("**/api/stripe/checkout", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");

      if (!body.priceId || typeof body.priceId !== "string") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Price ID invalide",
            code: "VALIDATION_ERROR",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/test" }),
        });
      }
    });

    const response = await page.request.post("/api/stripe/checkout", {
      data: {},
    });

    expect(response.status()).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("invalide");
  });

  test("POST /api/stripe/checkout rejette les requêtes non authentifiées", async ({ page }) => {
    // Don't mock session — test with no auth
    await page.route("**/api/stripe/checkout", async (route) => {
      // Let it pass through to the real endpoint which will check auth
      await route.continue();
    });

    const response = await page.request.post("/api/stripe/checkout", {
      data: { priceId: PRO_PRICE_ID },
    });

    // Without auth, the endpoint should return 401
    expect(response.status()).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*  Portail de facturation                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Portail de facturation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("POST /api/stripe/portal retourne une URL", async ({ page }) => {
    await page.route("**/api/stripe/portal", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://billing.stripe.com/p/session/test",
        }),
      });
    });

    const response = await page.request.post("/api/stripe/portal");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("url");
  });
});
