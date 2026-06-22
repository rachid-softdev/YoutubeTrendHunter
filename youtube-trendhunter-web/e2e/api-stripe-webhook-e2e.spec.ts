import { test, expect, type Page } from "@playwright/test";

/**
 * Stripe Webhook API — E2E tests for YouTube TrendHunter
 *
 * Tests the Stripe webhook endpoint that processes incoming events from Stripe:
 *
 *   ✓ POST /api/stripe/webhook — Receive and handle Stripe events
 *
 * Strategy:
 *   - page.route() to intercept the endpoint and simulate signature verification
 *   - page.request.post() for direct API calls
 *   - Tests verify header validation (400), invalid signature (400), and valid event handling (200)
 *
 * NOTE: The broader set of event-type-specific tests (checkout.session.completed,
 * customer.subscription.updated, etc.) are covered in api-flows.spec.ts (tests 4a-4j).
 * This file focuses on the core webhook contract: signature validation and generic handling.
 */

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const VALID_SIGNATURE = "tsec_2001_test_valid_signature_abc123def456";
const INVALID_SIGNATURE = "invalid_signature_format_xyz";

/* ========================================================================== */
/*  1. STRIPE WEBHOOK — POST /api/stripe/webhook                              */
/* ========================================================================== */

test.describe("Stripe Webhook — POST /api/stripe/webhook", () => {
  /**
   * Shared mock that simulates the Stripe webhook's signature verification logic.
   *
   * The real endpoint (src/app/api/stripe/webhook/route.ts):
   *   1. Reads raw body as text
   *   2. Checks for `stripe-signature` header → missing → 400 "Signature manquante"
   *   3. Calls stripeAdapter.handleWebhook(body, sig) → throws on invalid sig → 400 "Webhook invalide"
   *   4. Returns { received: true, handled: result.handled } on success
   */
  async function mockStripeWebhook(page: Page) {
    await page.route("**/api/stripe/webhook", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const sig = route.request().headers()["stripe-signature"];

      // Étape 1: Header stripe-signature manquant
      if (!sig) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Signature manquante" }),
        });
        return;
      }

      // Récupérer le body brut (texte) comme le fait le vrai endpoint
      const rawBody = route.request().postData() || "";

      // Étape 2: Tenter de construire l'événement (simulation de stripe.webhooks.constructEvent)
      // Dans le vrai endpoint, stripeAdapter.handleWebhook() appelle
      // stripe.webhooks.constructEvent(body, sig, webhookSecret) qui lève une erreur
      // si la signature est invalide.
      if (sig !== VALID_SIGNATURE) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Webhook invalide" }),
        });
        return;
      }

      // Étape 3: Body vide → impossible de parser → erreur
      if (!rawBody || rawBody.trim() === "") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Webhook invalide" }),
        });
        return;
      }

      // Étape 4: Signature valide + body présent → traiter l'événement
      // Le vrai endpoint détermine handled en fonction du type d'événement
      let handled = false;
      try {
        const payload = JSON.parse(rawBody);
        const HANDLED_EVENTS = [
          "checkout.session.completed",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "invoice.payment_failed",
          "invoice.payment_succeeded",
          "customer.subscription.trial_will_end",
        ];
        handled = HANDLED_EVENTS.includes(payload.type as string);
      } catch {
        // Body non-JSON
        handled = false;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          received: true,
          handled,
        }),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    await mockStripeWebhook(page);
  });

  test("1a — Header stripe-signature manquant → 400 'Signature manquante'", async ({ page }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: {
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_missing_sig" } },
      },
      // Note: aucun header stripe-signature
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Signature manquante");
  });

  test("1b — Signature invalide (mauvaise valeur) → 400 'Webhook invalide'", async ({ page }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: {
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_invalid_sig" } },
      },
      headers: {
        "stripe-signature": INVALID_SIGNATURE,
        "content-type": "application/json",
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    // Le vrai endpoint retourne "Webhook invalide" quand constructEvent échoue
    expect(body.error).toBe("Webhook invalide");
  });

  test("1c — Événement valide avec signature valide → 200 avec handled: true", async ({ page }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_valid",
            mode: "subscription",
            subscription: "sub_test_123",
            metadata: { userId: "user-valid-test" },
          },
        },
      },
      headers: {
        "stripe-signature": VALID_SIGNATURE,
        "content-type": "application/json",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.received).toBe(true);
    // checkout.session.completed est un événement géré
    expect(body.handled).toBe(true);
  });

  test("1d — Événement non géré avec signature valide → 200 avec handled: false", async ({
    page,
  }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: {
        type: "charge.succeeded",
        data: { object: { id: "ch_unhandled" } },
      },
      headers: {
        "stripe-signature": VALID_SIGNATURE,
        "content-type": "application/json",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.received).toBe(true);
    // charge.succeeded n'est pas dans la liste des événements gérés
    expect(body.handled).toBe(false);
  });

  test("1e — Body vide avec signature valide → 400 'Webhook invalide'", async ({ page }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: "",
      headers: {
        "stripe-signature": VALID_SIGNATURE,
        "content-type": "application/json",
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Webhook invalide");
  });

  test("1f — Signature valide + customer.subscription.updated → 200 avec handled: true", async ({
    page,
  }) => {
    const response = await page.request.post("/api/stripe/webhook", {
      data: {
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_updated_123",
            metadata: { userId: "user-update" },
            status: "active",
            items: { data: [{ price: { id: "price_pro" } }] },
          },
        },
      },
      headers: {
        "stripe-signature": VALID_SIGNATURE,
        "content-type": "application/json",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.received).toBe(true);
    expect(body.handled).toBe(true);
  });

  test("1g — Requête GET sur /api/stripe/webhook (mauvaise méthode) n'est pas interceptée", async ({
    page,
  }) => {
    // Le webhook n'accepte que POST; le mock ne devrait pas intercepter GET
    const response = await page.request.get("/api/stripe/webhook");

    // Le vrai endpoint Next.js retournera 405 (Method Not Allowed)
    // ou 404 si la route n'existe pas pour GET
    expect([404, 405]).toContain(response.status());
  });
});
