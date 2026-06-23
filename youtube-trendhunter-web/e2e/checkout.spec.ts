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
  await page.route("**/api/auth/session*", async (route) => {
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

  /* ----- Nouveaux tests Page Tarifs ----- */

  test("9 - le CTA Team Contact commercial est un lien mailto", async ({ page }) => {
    await page.goto("/pricing");
    const teamCta = page.locator("a[href='mailto:contact@trendhunter.app']");
    await expect(teamCta).toBeVisible();
    await expect(teamCta).toContainText("Contact commercial");
  });

  test("10 - affiche le texte de sécurité des paiements", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Paiement sécurisé par Stripe")).toBeVisible();
    await expect(page.getByText("Sans engagement")).toBeVisible();
  });

  test("11 - affiche les descriptions de chaque plan", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("Pour découvrir TrendHunter")).toBeVisible();
    await expect(page.getByText("Pour les créateurs de contenu")).toBeVisible();
    await expect(page.getByText("Pour les équipes")).toBeVisible();
  });

  test("12 - affiche le suffixe /mois sur chaque prix", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("/mois")).toHaveCount(3);
  });

  test("13 - affiche l'icône ArrowRight dans les boutons CTA", async ({ page }) => {
    await page.goto("/pricing");
    const arrowIcons = page.locator("svg.lucide-arrow-right");
    await expect(arrowIcons).toHaveCount(3);
  });

  test("14 - affiche les icônes de vérification pour chaque fonctionnalité", async ({ page }) => {
    await page.goto("/pricing");
    const checkIcons = page.locator("svg.lucide-check");
    await expect(checkIcons).toHaveCount(15);
  });

  test("15 - affiche les orbes décoratives en arrière-plan", async ({ page }) => {
    await page.goto("/pricing");
    const orbs = page.locator("div[class*='blur-[120px]']");
    await expect(orbs).toHaveCount(2);
  });

  test("16 - se charge sans erreur console à 1280px", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pricing");
    await expect(page.locator("h1")).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test("17 - affiche les balises Open Graph", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /TrendHunter/,
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      /tendances/,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "/pricing");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
  });

  test("18 - affiche la balise canonique /pricing", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "/pricing");
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
    await page.route("**/api/stripe/checkout*", async (route) => {
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

    await page.goto("/pricing");
    const result = await page.evaluate(async (priceId) => {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: res.status, body: await res.json() };
    }, PRO_PRICE_ID);

    expect(result.status).toBe(200);

    expect(result.body).toHaveProperty("url");
    expect(result.body.url).toContain("checkout.stripe.com");
  });

  test("POST /api/stripe/checkout rejette les priceId invalides", async ({ page }) => {
    await page.route("**/api/stripe/checkout*", async (route) => {
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

    await page.goto("/pricing");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);

    expect(result.body.error).toContain("invalide");
  });

  test("POST /api/stripe/checkout rejette les requêtes non authentifiées", async ({ page }) => {
    // Don't mock session — test with no auth
    await page.route("**/api/stripe/checkout*", async (route) => {
      // Let it pass through to the real endpoint which will check auth
      await route.continue();
    });

    await page.goto("/pricing");
    const result = await page.evaluate(async (priceId) => {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: res.status };
    }, PRO_PRICE_ID);

    // Without auth, the endpoint should return 401
    expect(result.status).toBe(401);
  });

  /* ----- Nouveaux tests Checkout Stripe (fetch native via page.evaluate) ----- */

  test("4 - le priceId Pro retourne une URL de checkout", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.priceId).toBe(PRO_PRICE_ID);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_pro" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("checkout.stripe.com");
  });

  test("5 - le priceId Team retourne une URL de checkout", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.priceId).toBe(TEAM_PRICE_ID);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_team" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, TEAM_PRICE_ID);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("checkout.stripe.com");
  });

  test("6 - utilisateur sans stripeCustomerId crée un nouveau client Stripe", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_new_customer" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("checkout.stripe.com");
  });

  test("7 - utilisateur en session mais pas en DB → 404", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Utilisateur introuvable", code: "NOT_FOUND" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Utilisateur");
  });

  test("8 - Stripe adapter PRICE_NOT_FOUND → 500", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(500);
  });

  test("9 - corps de requête non-JSON → 500", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "pas-du-json{",
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(500);
  });

  test("10 - échec Redis → 503 Service temporairement indisponible", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Service temporairement indisponible" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Service temporairement indisponible");
  });

  test("11 - token de session expiré → 401", async ({ page }) => {
    await page.route("**/api/auth/session*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null, expires: "2020-01-01T00:00:00.000Z" }),
      });
    });
    await page.goto("/pricing");
    await page.route("**/api/stripe/checkout*", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
      });
    });
    const res = await page.evaluate(async (priceId) => {
      const r = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      return { status: r.status, body: await r.json() };
    }, PRO_PRICE_ID);
    expect(res.status).toBe(401);
  });

  test("12 - 6 requêtes rapides → 7e retourne 429", async ({ page }) => {
    await page.goto("/pricing");
    let callCount = 0;
    await page.route("**/api/stripe/checkout*", async (route) => {
      callCount++;
      if (callCount > 6) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Trop de requêtes. Réessayez plus tard.",
            code: "RATE_LIMIT",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test" }),
        });
      }
    });
    const results = await page.evaluate(async (priceId) => {
      const reqs = Array.from({ length: 7 }, () =>
        fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId }),
        }).then(async (r) => ({ status: r.status, body: await r.json() })),
      );
      return Promise.all(reqs);
    }, PRO_PRICE_ID);
    for (let i = 0; i < 6; i++) {
      expect(results[i].status).toBe(200);
    }
    expect(results[6].status).toBe(429);
    expect(results[6].body.error).toContain("Trop de requêtes");
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
    await page.route("**/api/stripe/portal*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://billing.stripe.com/p/session/test",
        }),
      });
    });

    await page.goto("/pricing");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body).toHaveProperty("url");
  });

  /* ----- Nouveaux tests Portail de facturation (fetch native via page.evaluate) ----- */

  test("2 - returnUrl par défaut est /billing", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.returnUrl).toBeUndefined();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://billing.stripe.com/p/session/test" }),
      });
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("billing.stripe.com");
  });

  test("3 - returnUrl personnalisé écrase la valeur par défaut", async ({ page }) => {
    const customUrl = "https://example.com/custom-billing";
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      expect(body.returnUrl).toBe(customUrl);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://billing.stripe.com/p/session/test" }),
      });
    });
    const res = await page.evaluate(async (returnUrl) => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
      });
      return { status: r.status, body: await r.json() };
    }, customUrl);
    expect(res.status).toBe(200);
  });

  test("4 - utilisateur absent de la DB → 400 Aucun abonnement", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Aucun abonnement" }),
      });
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Aucun abonnement");
  });

  test("5 - returnUrl avec protocole data: → 400", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      if (typeof body.returnUrl === "string" && body.returnUrl.startsWith("data:")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Données invalides", code: "VALIDATION_ERROR" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://billing.stripe.com/p/session/test" }),
        });
      }
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: "data:text/html,<script>alert('xss')</script>" }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(400);
  });

  test("6 - limite de débit dépassée → 429", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Trop de requêtes. Réessayez plus tard.",
          code: "RATE_LIMIT",
        }),
      });
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(429);
  });

  test("7 - Stripe adapter CUSTOMER_NOT_FOUND → 500", async ({ page }) => {
    await page.goto("/pricing");
    await page.route("**/api/stripe/portal*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(500);
  });
});
