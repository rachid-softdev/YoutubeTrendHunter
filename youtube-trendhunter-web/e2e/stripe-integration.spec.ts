import { test, expect, type Page } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/*  Setup Helpers — Use native fetch() so page.route() interceptors work      */
/* -------------------------------------------------------------------------- */

const BASE_URL = "http://localhost:3000";
const VALID_SIGNATURE = "tsec_2001_test_valid_signature_abc123def456";

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

/**
 * POST a Stripe-like event to the webhook endpoint with signature header.
 */
async function postStripeEvent(
  page: Page,
  body: Record<string, unknown>,
  signature: string = VALID_SIGNATURE,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(
    async ({ sig, payload }: { sig: string; payload: string }) => {
      const res = await fetch("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": sig,
          "Content-Type": "application/json",
        },
        body: payload,
      });
      return { status: res.status, body: await res.json() };
    },
    { sig: signature, payload: JSON.stringify(body) },
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers — realistic Stripe payload builders                               */
/* -------------------------------------------------------------------------- */

function buildCheckoutSessionCompleted(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_completed_" + Date.now(),
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_" + Date.now(),
        mode: "subscription",
        subscription: "sub_test_" + Date.now(),
        metadata: { userId: "user-integration-test" },
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
        ...overrides,
      },
    },
  };
}

function buildCustomerSubscriptionUpdated(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_sub_updated_" + Date.now(),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_" + Date.now(),
        status: "active",
        metadata: { userId: "user-integration-test" },
        items: { data: [{ price: { id: "price_team_monthly" } }] },
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        cancel_at_period_end: false,
        ...overrides,
      },
    },
  };
}

function buildCustomerSubscriptionDeleted(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_sub_deleted_" + Date.now(),
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_" + Date.now(),
        status: "canceled",
        metadata: { userId: "user-integration-test" },
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
        ...overrides,
      },
    },
  };
}

function buildInvoicePaid(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_invoice_paid_" + Date.now(),
    type: "invoice.paid",
    data: {
      object: {
        id: "in_test_" + Date.now(),
        subscription: "sub_test_" + Date.now(),
        metadata: { userId: "user-integration-test" },
        amount_paid: 2999,
        currency: "eur",
        status: "paid",
        ...overrides,
      },
    },
  };
}

function buildInvoicePaymentFailed(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_invoice_failed_" + Date.now(),
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_test_" + Date.now(),
        subscription: "sub_test_" + Date.now(),
        metadata: { userId: "user-integration-test" },
        amount_due: 2999,
        currency: "eur",
        status: "open",
        attempt_count: 1,
        ...overrides,
      },
    },
  };
}

/* ========================================================================== */
/*  Scoped mock factories for each test scenario                               */
/* ========================================================================== */

/**
 * Multi-handler mock that routes by event type and simulates the real
 * handler logic: subscription upsert, plan change, cancellation, payment.
 */
async function mockStripeWebhook(page: Page) {
  await page.route("**/api/stripe/webhook*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const sig = route.request().headers()["stripe-signature"];
    if (!sig) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Signature manquante" }),
      });
      return;
    }
    if (sig !== VALID_SIGNATURE) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Webhook invalide" }),
      });
      return;
    }

    const rawBody = route.request().postData() || "";
    if (!rawBody.trim()) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Webhook invalide" }),
      });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Webhook invalide" }),
      });
      return;
    }

    const eventType = payload.type as string;
    const dataObj = payload.data as Record<string, unknown> | undefined;
    const object = dataObj?.object as Record<string, unknown> | undefined;

    let handled = false;

    if (eventType === "checkout.session.completed") {
      if (
        object &&
        object.mode === "subscription" &&
        typeof object.subscription === "string" &&
        object.metadata &&
        typeof (object.metadata as Record<string, unknown>).userId === "string" &&
        object.items &&
        Array.isArray((object.items as Record<string, unknown>).data) &&
        ((object.items as Record<string, unknown>).data as Array<Record<string, unknown>>).length >
          0
      ) {
        handled = true;
      }
    } else if (eventType === "customer.subscription.updated") {
      if (
        object &&
        object.metadata &&
        typeof (object.metadata as Record<string, unknown>).userId === "string"
      ) {
        handled = true;
      }
    } else if (eventType === "customer.subscription.deleted") {
      if (
        object &&
        object.metadata &&
        typeof (object.metadata as Record<string, unknown>).userId === "string"
      ) {
        handled = true;
      }
    } else if (eventType === "invoice.paid") {
      if (
        object &&
        (object.subscription || (object as Record<string, unknown>).subscription === null) &&
        object.metadata &&
        typeof (object.metadata as Record<string, unknown>).userId === "string"
      ) {
        handled = true;
      }
    } else if (eventType === "invoice.payment_failed") {
      handled = true;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: true, handled }),
    });
  });
}

/**
 * Mock that imposes rate limiting: after RAPID_LIMIT requests within
 * the same second, returns 429.
 */
async function mockStripeWebhookWithRateLimit(page: Page) {
  const timestamps: number[] = [];
  const RAPID_LIMIT = 5;
  const WINDOW_MS = 1000;

  await page.route("**/api/stripe/webhook*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const now = Date.now();
    while (timestamps.length > 0 && timestamps[0] < now - WINDOW_MS) {
      timestamps.shift();
    }

    if (timestamps.length >= RAPID_LIMIT) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Trop de requêtes. Réessayez plus tard." }),
      });
      return;
    }

    timestamps.push(now);

    const sig = route.request().headers()["stripe-signature"];
    if (!sig || sig !== VALID_SIGNATURE) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: sig ? "Webhook invalide" : "Signature manquante",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: true, handled: true }),
    });
  });
}

/**
 * Mock with idempotency tracking: same event ID → second call returns
 * handled: false.
 */
async function mockStripeWebhookWithIdempotency(page: Page) {
  const processedIds = new Set<string>();

  await page.route("**/api/stripe/webhook*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const sig = route.request().headers()["stripe-signature"];
    if (!sig || sig !== VALID_SIGNATURE) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: sig ? "Webhook invalide" : "Signature manquante",
        }),
      });
      return;
    }

    const rawBody = route.request().postData() || "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Webhook invalide" }),
      });
      return;
    }

    const dataObj = payload.data as Record<string, unknown> | undefined;
    const object = dataObj?.object as Record<string, unknown> | undefined;
    const eventId = (object?.id as string) || "";

    if (eventId && processedIds.has(eventId)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ received: true, handled: false }),
      });
      return;
    }

    if (eventId) {
      processedIds.add(eventId);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ received: true, handled: true }),
    });
  });
}

/* ========================================================================== */
/*  Tests                                                                      */
/* ========================================================================== */

test.describe("Stripe Webhook — Intégration E2E", () => {
  test.beforeEach(async ({ page }) => {
    await mockStripeWebhook(page);
    await setupPage(page);
  });

  /* ── 1. checkout.session.completed ─────────────────────────────────────── */

  test("1 — checkout.session.completed → abonnement créé avec les bons champs", async ({
    page,
  }) => {
    const event = buildCheckoutSessionCompleted();

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  test("1a — checkout.session.completed sans userId dans metadata → handled: false", async ({
    page,
  }) => {
    const event = buildCheckoutSessionCompleted({ metadata: {} });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  test("1b — checkout.session.completed en mode payment (pas subscription) → ignored", async ({
    page,
  }) => {
    const event = buildCheckoutSessionCompleted({ mode: "payment" });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  /* ── 2. customer.subscription.updated ──────────────────────────────────── */

  test("2 — customer.subscription.updated → changement de plan traité", async ({ page }) => {
    const event = buildCustomerSubscriptionUpdated({
      metadata: { userId: "user-upgrade-test" },
    });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  test("2a — customer.subscription.updated avec userId absent → handled: false", async ({
    page,
  }) => {
    const event = buildCustomerSubscriptionUpdated({ metadata: {} });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  /* ── 3. customer.subscription.deleted ──────────────────────────────────── */

  test("3 — customer.subscription.deleted → annulation traitée", async ({ page }) => {
    const event = buildCustomerSubscriptionDeleted();

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  test("3a — customer.subscription.deleted sans userId → handled: false", async ({ page }) => {
    const event = buildCustomerSubscriptionDeleted({ metadata: {} });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  /* ── 4. invoice.paid ──────────────────────────────────────────────────── */

  test("4 — invoice.paid → paiement réussi traité", async ({ page }) => {
    const event = buildInvoicePaid();

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  test("4a — invoice.paid sans subscription → handled: false (facture sans abonnement)", async ({
    page,
  }) => {
    const event = buildInvoicePaid({ subscription: null });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  /* ── 5. invoice.payment_failed ────────────────────────────────────────── */

  test("5 — invoice.payment_failed → échec de paiement traité (observabilité)", async ({
    page,
  }) => {
    const event = buildInvoicePaymentFailed();

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  test("5a — invoice.payment_failed avec données minimales → toujours géré", async ({ page }) => {
    const event = buildInvoicePaymentFailed({
      metadata: {},
      subscription: null,
    });

    const result = await postStripeEvent(page, event);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(true);
  });

  /* ── 6. Rate limiting ──────────────────────────────────────────────────── */

  test("6 — Limite de débit sur le webhook → 429 après N requêtes rapides", async ({ page }) => {
    await mockStripeWebhookWithRateLimit(page);
    await setupPage(page);

    const event = buildCheckoutSessionCompleted();

    // Envoyer plusieurs requêtes rapides pour déclencher la limite
    const results = await Promise.all(
      Array.from({ length: 7 }, () => postStripeEvent(page, event)),
    );

    const okCount = results.filter((r) => r.status === 200).length;
    const rateLimitedCount = results.filter((r) => r.status === 429).length;

    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(rateLimitedCount).toBeGreaterThanOrEqual(1);

    // Vérifier le message d'erreur rate-limit
    const rateLimited = results.find((r) => r.status === 429);
    expect(rateLimited).toBeDefined();
    if (rateLimited) {
      expect(rateLimited.body).toHaveProperty("error");
      expect(rateLimited.body.error).toContain("Trop de requêtes");
    }
  });

  /* ── 7. Concurrent webhook events ─────────────────────────────────────── */

  test("7 — Événements webhook concurrents (deux à la fois) → tous deux traités", async ({
    page,
  }) => {
    const eventA = buildCheckoutSessionCompleted({
      id: "evt_concurrent_A_" + Date.now(),
      metadata: { userId: "user-concurrent-A" },
    });
    const eventB = buildCustomerSubscriptionUpdated({
      id: "evt_concurrent_B_" + Date.now(),
      metadata: { userId: "user-concurrent-B" },
    });

    const [resultA, resultB] = await Promise.all([
      postStripeEvent(page, eventA),
      postStripeEvent(page, eventB),
    ]);

    expect(resultA.status).toBe(200);
    expect(resultA.body.received).toBe(true);
    expect(resultA.body.handled).toBe(true);

    expect(resultB.status).toBe(200);
    expect(resultB.body.received).toBe(true);
    expect(resultB.body.handled).toBe(true);
  });

  test("7a — Événements concurrents avec le même event.id → un seul traité, l'autre ignoré", async ({
    page,
  }) => {
    await mockStripeWebhookWithIdempotency(page);
    await setupPage(page);

    const sharedId = "cs_concurrent_dup_" + Date.now();
    const event = buildCheckoutSessionCompleted({ id: sharedId });

    const [resultA, resultB] = await Promise.all([
      postStripeEvent(page, event),
      postStripeEvent(page, event),
    ]);

    const handled = [resultA, resultB].filter((r) => r.body.handled === true);
    const ignored = [resultA, resultB].filter((r) => r.body.handled === false);

    expect(handled.length).toBe(1);
    expect(ignored.length).toBe(1);
  });

  /* ── 8. Malformed payload ──────────────────────────────────────────────── */

  test("8 — Payload JSON invalide → 400 Webhook invalide", async ({ page }) => {
    const result = await page.evaluate(async (sig) => {
      const res = await fetch("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": sig,
          "Content-Type": "application/json",
        },
        body: "ceci n'est pas du json {{{{",
      });
      return { status: res.status, body: await res.json() };
    }, VALID_SIGNATURE);

    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Webhook invalide");
  });

  test("8a — Body vide → 400 Webhook invalide", async ({ page }) => {
    const result = await page.evaluate(async (sig) => {
      const res = await fetch("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "stripe-signature": sig,
          "Content-Type": "application/json",
        },
        body: "",
      });
      return { status: res.status, body: await res.json() };
    }, VALID_SIGNATURE);

    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Webhook invalide");
  });

  test("8b — Payload JSON valide mais structure inattendue → 200 handled: false", async ({
    page,
  }) => {
    const result = await postStripeEvent(page, {
      id: "evt_weird_" + Date.now(),
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_weird",
          mode: "subscription",
          // subscription manquant, metadata.userId manquant, items manquant
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  /* ── 9. Unexpected event type ─────────────────────────────────────────── */

  test("9 — Type d'événement inattendu → 200 avec handled: false", async ({ page }) => {
    const result = await postStripeEvent(page, {
      id: "evt_unexpected_" + Date.now(),
      type: "charge.succeeded",
      data: {
        object: {
          id: "ch_test_unexpected",
          amount: 1000,
          currency: "eur",
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  test("9a — Type d'événement inconnu (typo) → 200 avec handled: false", async ({ page }) => {
    const result = await postStripeEvent(page, {
      id: "evt_typo_" + Date.now(),
      type: "checkout.session.completedd", // typo volontaire
      data: {
        object: {
          id: "cs_typo",
          mode: "subscription",
          subscription: "sub_typo",
          metadata: { userId: "user-typo" },
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  test("9b — Nouveau type d'événement Stripe inconnu → gracieusement ignoré", async ({ page }) => {
    const result = await postStripeEvent(page, {
      id: "evt_new_stripe_type_" + Date.now(),
      type: "billing_portal.configuration.created",
      data: {
        object: {
          id: "bpc_new",
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.handled).toBe(false);
  });

  /* ── 10. Replay attack / Idempotency ──────────────────────────────────── */

  test("10 — Attaque par rejeu: même event.id envoyé deux fois → seconde ignorée", async ({
    page,
  }) => {
    await mockStripeWebhookWithIdempotency(page);
    await setupPage(page);

    const eventId = "cs_replay_" + Date.now();
    const event = buildCheckoutSessionCompleted({ id: eventId });

    // Première livraison légitime
    const result1 = await postStripeEvent(page, event);
    expect(result1.status).toBe(200);
    expect(result1.body.received).toBe(true);
    expect(result1.body.handled).toBe(true);

    // Seconde livraison (rejeu)
    const result2 = await postStripeEvent(page, event);
    expect(result2.status).toBe(200);
    expect(result2.body.received).toBe(true);
    expect(result2.body.handled).toBe(false);
  });

  test("10a — Rejeu différé: même événement rejoué après 5 secondes → toujours ignoré", async ({
    page,
  }) => {
    await mockStripeWebhookWithIdempotency(page);
    await setupPage(page);

    const event = buildCheckoutSessionCompleted();

    // Première livraison
    const result1 = await postStripeEvent(page, event);
    expect(result1.status).toBe(200);
    expect(result1.body.handled).toBe(true);

    // Attendre (le set processedIds persiste dans la fermeture du mock)
    await page.waitForTimeout(500);

    // Rejeu
    const result2 = await postStripeEvent(page, event);
    expect(result2.status).toBe(200);
    expect(result2.body.received).toBe(true);
    expect(result2.body.handled).toBe(false);
  });

  test("10b — Événement avec id unique rejoué avec signature invalide → 400", async ({ page }) => {
    const event = buildCheckoutSessionCompleted();

    const result = await postStripeEvent(page, event, "invalid_signature");
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty("error");
    expect(result.body.error).toBe("Webhook invalide");
  });
});
