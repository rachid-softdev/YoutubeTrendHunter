import { test, expect, type Page } from "@playwright/test";

/**
 * Billing Hardened E2E tests for YouTube TrendHunter
 *
 * Covers 8 advanced billing areas NOT tested in checkout.spec.ts or
 * billing-extended.spec.ts:
 *   1. Invoice History (list, statuses, PDF download, pagination, filters)
 *   2. Payment Method Management (add, remove, set default, validation, card display)
 *   3. Coupons & Discounts (apply, error states, plan-specific, free trial)
 *   4. Subscription Changes — Mid-cycle (upgrade, downgrade, proration, cancel, reactivate)
 *   5. Multiple Subscriptions & Team (invite, roles, seats, usage metrics)
 *   6. Tax / VAT Handling (validation, exemption, country-based rates, reverse charge)
 *   7. Receipts & Accounting (email, fields, re-issuance)
 *   8. Plan Change Restrictions (usage limits, cooldown, grandfathering)
 *
 * All tests mock server responses via page.route(). No real Stripe calls.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const PRO_PRICE_ID = "price_test_pro_monthly";
const TEAM_PRICE_ID = "price_test_team_monthly";

/* -------------------------------------------------------------------------- */
/*  Mock Sessions                                                             */
/* -------------------------------------------------------------------------- */

const MOCK_SESSION_FREE = {
  user: {
    id: "user-hardened-free",
    name: "Test Hardened Free",
    email: "hardened-free@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_PRO = {
  user: {
    id: "user-hardened-pro",
    name: "Test Hardened Pro",
    email: "hardened-pro@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_SESSION_TEAM = {
  user: {
    id: "user-hardened-team",
    name: "Test Hardened Team",
    email: "hardened-team@test.com",
    role: "USER" as const,
    plan: "TEAM" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, session: object = MOCK_SESSION_FREE) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

async function expectPageNotCrashing(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
}

/* ========================================================================== */
/*  1. INVOICE HISTORY                                                        */
/* ========================================================================== */

test.describe("Facturation — Historique des factures", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
  });

  const MOCK_INVOICES = [
    {
      id: "inv_001",
      number: "INV-2026-0001",
      date: "2026-06-01T00:00:00Z",
      amount: 1500,
      currency: "eur",
      status: "paid",
      pdfUrl: "/api/billing/invoices/inv_001/pdf",
    },
    {
      id: "inv_002",
      number: "INV-2026-0002",
      date: "2026-05-01T00:00:00Z",
      amount: 1500,
      currency: "eur",
      status: "paid",
      pdfUrl: "/api/billing/invoices/inv_002/pdf",
    },
    {
      id: "inv_003",
      number: "INV-2026-0003",
      date: "2026-04-15T00:00:00Z",
      amount: 1500,
      currency: "eur",
      status: "pending",
      pdfUrl: "/api/billing/invoices/inv_003/pdf",
    },
    {
      id: "inv_004",
      number: "INV-2026-0004",
      date: "2026-04-01T00:00:00Z",
      amount: 1500,
      currency: "eur",
      status: "failed",
      pdfUrl: "/api/billing/invoices/inv_004/pdf",
    },
    {
      id: "inv_005",
      number: "INV-2026-0005",
      date: "2026-03-01T00:00:00Z",
      amount: 1500,
      currency: "eur",
      status: "refunded",
      pdfUrl: "/api/billing/invoices/inv_005/pdf",
    },
  ];

  test("la page de factures liste toutes les factures avec numéro, date, montant, statut", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      const url = new URL(route.request().url());
      const pageParam = url.searchParams.get("page") || "1";
      const statusFilter = url.searchParams.get("status") || "";
      const fromFilter = url.searchParams.get("from") || "";
      const toFilter = url.searchParams.get("to") || "";

      let filtered = [...MOCK_INVOICES];
      if (statusFilter) {
        filtered = filtered.filter((inv) => inv.status === statusFilter);
      }
      if (fromFilter) {
        filtered = filtered.filter((inv) => new Date(inv.date) >= new Date(fromFilter));
      }
      if (toFilter) {
        filtered = filtered.filter((inv) => new Date(inv.date) <= new Date(toFilter));
      }

      const pageSize = 3;
      const start = (parseInt(pageParam) - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: paged,
          total: filtered.length,
          page: parseInt(pageParam),
          pageSize,
          totalPages: Math.ceil(filtered.length / pageSize),
        }),
      });
    });

    await page.goto("/billing/invoices");

    // Verify each invoice row shows required fields
    const rows = page.locator("[data-testid='invoice-row']");
    await expect(rows).toHaveCount(3);

    // First invoice: INV-2026-0001
    const firstRow = rows.nth(0);
    await expect(firstRow).toContainText("INV-2026-0001");
    await expect(firstRow).toContainText("15,00");
    await expect(firstRow).toContainText("Payée");

    // Third invoice: INV-2026-0003 (status: pending)
    const thirdRow = rows.nth(2);
    await expect(thirdRow).toContainText("INV-2026-0003");
    await expect(thirdRow).toContainText("En attente");
  });

  test("affiche le statut 'Payée' pour les factures payées", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [MOCK_INVOICES[0]],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");
    await expect(page.locator("[data-testid='invoice-row']").first()).toContainText("Payée");
  });

  test("affiche le statut 'En attente' pour les factures en attente", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [MOCK_INVOICES[2]],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");
    await expect(page.locator("[data-testid='invoice-row']").first()).toContainText("En attente");
  });

  test("affiche le statut 'Échouée' pour les factures en échec", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [MOCK_INVOICES[3]],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");
    await expect(page.locator("[data-testid='invoice-row']").first()).toContainText("Échouée");
  });

  test("affiche le statut 'Remboursée' pour les factures remboursées", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [MOCK_INVOICES[4]],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");
    await expect(page.locator("[data-testid='invoice-row']").first()).toContainText("Remboursée");
  });

  test("télécharge une facture en PDF", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [MOCK_INVOICES[0]],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.route("**/api/billing/invoices/inv_001/pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: Buffer.from("%PDF-1.4 Fake PDF content"),
      });
    });

    await page.goto("/billing/invoices");

    // Click download button on the first invoice
    const downloadBtn = page.locator("[data-testid='invoice-download-btn']").first();
    await expect(downloadBtn).toBeVisible();

    // Verify the PDF URL is correctly set on the download link
    const downloadLink = page.locator("[data-testid='invoice-pdf-link']").first();
    await expect(downloadLink).toHaveAttribute("href", /\/api\/billing\/invoices\/inv_001\/pdf/);
  });

  test("affiche un état vide quand aucune facture n'est disponible", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [],
          total: 0,
          page: 1,
          pageSize: 10,
          totalPages: 0,
        }),
      });
    });

    await page.goto("/billing/invoices");

    // Empty state message
    await expect(page.getByText("Aucune facture").first()).toBeVisible();
    await expect(page.getByText(/pas encore de facture/i).first()).toBeVisible();
  });

  test("affiche la pagination quand il y a beaucoup de factures", async ({ page }) => {
    const manyInvoices = Array.from({ length: 12 }, (_, i) => ({
      id: `inv_${i + 100}`,
      number: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      date: new Date(2026, 4, 1 - i).toISOString(),
      amount: 1500,
      currency: "eur",
      status: "paid",
      pdfUrl: `/api/billing/invoices/inv_${i + 100}/pdf`,
    }));

    await page.route("**/api/billing/invoices", async (route) => {
      const url = new URL(route.request().url());
      const pageParam = parseInt(url.searchParams.get("page") || "1");
      const pageSize = 5;
      const start = (pageParam - 1) * pageSize;
      const paged = manyInvoices.slice(start, start + pageSize);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: paged,
          total: manyInvoices.length,
          page: pageParam,
          pageSize,
          totalPages: Math.ceil(manyInvoices.length / pageSize),
        }),
      });
    });

    await page.goto("/billing/invoices");

    // Pagination controls should be visible
    await expect(page.getByText("Page 1 sur 3").first()).toBeVisible();

    // Navigate to page 2
    await page.locator("[data-testid='pagination-next']").click();
    await expect(page.getByText("Page 2 sur 3").first()).toBeVisible();
  });

  test("filtre les factures par plage de dates", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      const url = new URL(route.request().url());
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";

      let filtered = [...MOCK_INVOICES];
      if (from) {
        filtered = filtered.filter((inv) => new Date(inv.date) >= new Date(from));
      }
      if (to) {
        filtered = filtered.filter((inv) => new Date(inv.date) <= new Date(to));
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: filtered,
          total: filtered.length,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");

    // Set date range filter
    await page.locator("[data-testid='date-filter-from']").fill("2026-05-01");
    await page.locator("[data-testid='date-filter-to']").fill("2026-06-30");
    await page.locator("[data-testid='filter-apply-btn']").click();

    // Should show May and June invoices
    const rows = page.locator("[data-testid='invoice-row']");
    await expect(rows).toHaveCount(2);
  });

  test("filtre les factures par statut", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      const url = new URL(route.request().url());
      const status = url.searchParams.get("status") || "";

      let filtered = [...MOCK_INVOICES];
      if (status) {
        filtered = filtered.filter((inv) => inv.status === status);
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: filtered,
          total: filtered.length,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");

    // Select "failed" filter
    await page.locator("[data-testid='status-filter-select']").selectOption("failed");
    await page.locator("[data-testid='filter-apply-btn']").click();

    // Should only show failed invoice
    const rows = page.locator("[data-testid='invoice-row']");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("INV-2026-0004");
    await expect(rows.first()).toContainText("Échouée");
  });
});

/* ========================================================================== */
/*  2. PAYMENT METHOD MANAGEMENT                                              */
/* ========================================================================== */

test.describe("Facturation — Moyens de paiement", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
  });

  const MOCK_CARDS = [
    {
      id: "pm_visa_001",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2028,
      isDefault: true,
      billingAddress: {
        line1: "123 Rue de Paris",
        city: "Paris",
        postalCode: "75001",
        country: "FR",
      },
    },
    {
      id: "pm_mc_002",
      brand: "mastercard",
      last4: "5555",
      expMonth: 8,
      expYear: 2027,
      isDefault: false,
      billingAddress: {
        line1: "456 Avenue des Champs",
        city: "Lyon",
        postalCode: "69001",
        country: "FR",
      },
    },
  ];

  const MOCK_AMEX_CARD = {
    id: "pm_amex_003",
    brand: "amex",
    last4: "1000",
    expMonth: 3,
    expYear: 2029,
    isDefault: false,
    billingAddress: null,
  };

  test("affiche la liste des cartes enregistrées", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
      });
    });

    await page.goto("/billing/payment-methods");

    const cards = page.locator("[data-testid='payment-method-card']");
    await expect(cards).toHaveCount(2);

    // First card shows Visa
    await expect(cards.nth(0)).toContainText("Visa");
    await expect(cards.nth(0)).toContainText("4242");

    // Second card shows Mastercard
    await expect(cards.nth(1)).toContainText("Mastercard");
    await expect(cards.nth(1)).toContainText("5555");
  });

  test("affiche l'icône de la marque de carte (Visa, Mastercard, Amex)", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          paymentMethods: [...MOCK_CARDS, MOCK_AMEX_CARD],
        }),
      });
    });

    await page.goto("/billing/payment-methods");

    // Brand icons should be visible
    await expect(page.locator("[data-testid='card-brand-icon-visa']").first()).toBeVisible();
    await expect(page.locator("[data-testid='card-brand-icon-mastercard']").first()).toBeVisible();
    await expect(page.locator("[data-testid='card-brand-icon-amex']").first()).toBeVisible();
  });

  test("affiche les 4 derniers chiffres de chaque carte", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
      });
    });

    await page.goto("/billing/payment-methods");

    const cards = page.locator("[data-testid='payment-method-card']");
    await expect(cards.nth(0)).toContainText("4242");
    await expect(cards.nth(1)).toContainText("5555");
  });

  test("affiche la date d'expiration de chaque carte", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
      });
    });

    await page.goto("/billing/payment-methods");

    const cards = page.locator("[data-testid='payment-method-card']");
    await expect(cards.nth(0)).toContainText("12/2028");
    await expect(cards.nth(1)).toContainText("08/2027");
  });

  test("ajoute un nouveau moyen de paiement par carte", async ({ page }) => {
    let addCardCalled = false;
    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "POST") {
        addCardCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("number");
        expect(body).toHaveProperty("expMonth");
        expect(body).toHaveProperty("expYear");
        expect(body).toHaveProperty("cvc");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "pm_new_004",
            brand: "visa",
            last4: "1111",
            expMonth: 6,
            expYear: 2030,
            isDefault: false,
          }),
        });
      } else {
        // GET — return existing cards
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    // Click add payment method button
    await page.locator("[data-testid='add-payment-method-btn']").click();

    // Fill in card details in the modal/form
    await page.locator("[data-testid='card-number-input']").fill("4242424242424242");
    await page.locator("[data-testid='card-expiry-input']").fill("06/30");
    await page.locator("[data-testid='card-cvc-input']").fill("123");
    await page.locator("[data-testid='card-submit-btn']").click();

    expect(addCardCalled).toBe(true);

    // New card should appear in the list
    await expect(page.getByText("1111").first()).toBeVisible();
  });

  test("valide que le numéro de carte est invalide (Luhn check)", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Numéro de carte invalide",
            code: "CARD_VALIDATION_ERROR",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    await page.locator("[data-testid='add-payment-method-btn']").click();
    await page.locator("[data-testid='card-number-input']").fill("1234567890123456"); // Invalid Luhn
    await page.locator("[data-testid='card-expiry-input']").fill("12/28");
    await page.locator("[data-testid='card-cvc-input']").fill("123");
    await page.locator("[data-testid='card-submit-btn']").click();

    // Error message should be displayed
    await expect(page.getByText("Numéro de carte invalide").first()).toBeVisible();
  });

  test("valide que la carte n'est pas expirée", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const expYear = body.expYear;
        const expMonth = body.expMonth;
        const now = new Date();
        const expiry = new Date(expYear, expMonth, 1);
        if (expiry <= now) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Carte expirée",
              code: "CARD_EXPIRED",
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "pm_valid" }),
          });
        }
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    await page.locator("[data-testid='add-payment-method-btn']").click();
    await page.locator("[data-testid='card-number-input']").fill("4242424242424242");
    await page.locator("[data-testid='card-expiry-input']").fill("01/20"); // Expired date
    await page.locator("[data-testid='card-cvc-input']").fill("123");
    await page.locator("[data-testid='card-submit-btn']").click();

    await expect(page.getByText("Carte expirée").first()).toBeVisible();
  });

  test("valide que le CVV est correct (3 ou 4 chiffres)", async ({ page }) => {
    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const cvc = body.cvc;
        if (!/^\d{3,4}$/.test(cvc)) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              error: "CVV invalide",
              code: "CVV_VALIDATION_ERROR",
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: "pm_valid" }),
          });
        }
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    await page.locator("[data-testid='add-payment-method-btn']").click();
    await page.locator("[data-testid='card-number-input']").fill("4242424242424242");
    await page.locator("[data-testid='card-expiry-input']").fill("12/30");
    await page.locator("[data-testid='card-cvc-input']").fill("ab"); // Invalid CVV
    await page.locator("[data-testid='card-submit-btn']").click();

    await expect(page.getByText("CVV invalide").first()).toBeVisible();
  });

  test("définit un moyen de paiement par défaut", async ({ page }) => {
    let setDefaultCalled = false;
    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "PATCH") {
        setDefaultCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("default");
        expect(body.default).toBe(true);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    // Click "set as default" on the second card (Mastercard)
    await page.locator("[data-testid='set-default-btn']").last().click();

    expect(setDefaultCalled).toBe(true);
    // Mastercard should now show as default
    await expect(page.getByText("Défaut").first()).toBeVisible();
  });

  test("supprime un moyen de paiement", async ({ page }) => {
    let deleteCalled = false;
    await page.route("**/api/billing/payment-methods/**", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    });

    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: MOCK_CARDS }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    // Click delete on second card
    await page.locator("[data-testid='delete-payment-method-btn']").last().click();
    // Confirm deletion in dialog
    await page.locator("[data-testid='confirm-delete-btn']").click();

    expect(deleteCalled).toBe(true);
  });

  test("ne peut pas supprimer le dernier moyen de paiement", async ({ page }) => {
    const singleCard = [MOCK_CARDS[0]];

    await page.route("**/api/billing/payment-methods/**", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Impossible de supprimer le dernier moyen de paiement",
            code: "LAST_PAYMENT_METHOD",
          }),
        });
      }
    });

    await page.route("**/api/billing/payment-methods", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paymentMethods: singleCard }),
        });
      }
    });

    await page.goto("/billing/payment-methods");

    // Try to delete the only card
    await page.locator("[data-testid='delete-payment-method-btn']").first().click();
    await page.locator("[data-testid='confirm-delete-btn']").click();

    // Error message should be displayed
    await expect(
      page.getByText("Impossible de supprimer le dernier moyen de paiement").first(),
    ).toBeVisible();
  });

  test("met à jour l'adresse de facturation", async ({ page }) => {
    let updateAddressCalled = false;
    await page.route("**/api/billing/address", async (route) => {
      if (route.request().method() === "PUT") {
        updateAddressCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("line1");
        expect(body).toHaveProperty("city");
        expect(body).toHaveProperty("postalCode");
        expect(body).toHaveProperty("country");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    });

    await page.goto("/billing/address");

    // Update billing address form
    await page.locator("[data-testid='address-line1-input']").fill("789 Boulevard Haussmann");
    await page.locator("[data-testid='address-city-input']").fill("Paris");
    await page.locator("[data-testid='address-postal-code-input']").fill("75008");
    await page.locator("[data-testid='address-country-select']").selectOption("FR");
    await page.locator("[data-testid='address-submit-btn']").click();

    expect(updateAddressCalled).toBe(true);
    await expect(page.getByText("Adresse mise à jour").first()).toBeVisible();
  });
});

/* ========================================================================== */
/*  3. COUPONS & DISCOUNTS                                                    */
/* ========================================================================== */

test.describe("Facturation — Coupons et réductions", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_FREE);
  });

  test("applique un code promo valide lors du checkout", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const code = body.code;

      if (code === "WELCOME20") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            code: "WELCOME20",
            discountPercent: 20,
            discountAmount: 300, // 20% of 1500
            appliesTo: ["price_test_pro_monthly"],
            expiresAt: "2027-01-01T00:00:00Z",
            message: "Réduction de 20% appliquée",
          }),
        });
      }
    });

    await page.goto("/billing/coupon");

    // Enter coupon code
    await page.locator("[data-testid='coupon-code-input']").fill("WELCOME20");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    // Discount should be displayed
    await expect(page.getByText("20%").first()).toBeVisible();
    await expect(page.getByText("Réduction de 20% appliquée").first()).toBeVisible();
  });

  test("un coupon valide affiche le montant de la réduction", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          code: "SAVE10",
          discountPercent: 10,
          discountAmount: 150,
          appliesTo: ["price_test_pro_monthly", "price_test_team_monthly"],
          message: "Réduction de 10% appliquée",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("SAVE10");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    // Discount amount should be visible
    await expect(page.getByText("1,50").first()).toBeVisible(); // 10% of 15€
  });

  test("un coupon expiré affiche un message d'erreur", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          valid: false,
          error: "Ce coupon a expiré",
          code: "COUPON_EXPIRED",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("EXPIRED20");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    await expect(page.getByText("Ce coupon a expiré").first()).toBeVisible();
  });

  test("un code promo invalide affiche un message d'erreur", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          valid: false,
          error: "Code promo invalide",
          code: "INVALID_COUPON",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("FAKECODE123");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    await expect(page.getByText("Code promo invalide").first()).toBeVisible();
  });

  test("un coupon déjà utilisé affiche un message d'erreur", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          valid: false,
          error: "Ce coupon a déjà été utilisé",
          code: "COUPON_ALREADY_USED",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("USED20");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    await expect(page.getByText("Ce coupon a déjà été utilisé").first()).toBeVisible();
  });

  test("un coupon spécifique à un plan ne fonctionne pas pour un autre plan", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const priceId = body.priceId || PRO_PRICE_ID;

      if (priceId === TEAM_PRICE_ID) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            valid: false,
            error: "Ce coupon ne s'applique pas au plan sélectionné",
            code: "COUPON_PLAN_MISMATCH",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            discountPercent: 20,
            message: "Réduction appliquée",
          }),
        });
      }
    });

    await page.goto("/billing/coupon");

    // Try applying the coupon for the Team plan (which it doesn't support)
    await page.locator("[data-testid='plan-selector']").selectOption("team");
    await page.locator("[data-testid='coupon-code-input']").fill("PROONLY");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    await expect(page.getByText("Ce coupon ne s'applique pas au plan sélectionné").first()).toBeVisible();
  });

  test("un essai gratuit avec coupon est correctement affiché", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          code: "TRIAL7",
          discountPercent: 100,
          trialDays: 7,
          message: "Essai gratuit de 7 jours avec réduction de 100%",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("TRIAL7");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    await expect(page.getByText("Essai gratuit de 7 jours").first()).toBeVisible();
    await expect(page.getByText("100%").first()).toBeVisible();
  });

  test("affiche le pourcentage de réduction du coupon", async ({ page }) => {
    await page.route("**/api/billing/validate-coupon", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          code: "HALFOFF",
          discountPercent: 50,
          discountAmount: 750,
          message: "Réduction de 50% appliquée",
        }),
      });
    });

    await page.goto("/billing/coupon");

    await page.locator("[data-testid='coupon-code-input']").fill("HALFOFF");
    await page.locator("[data-testid='apply-coupon-btn']").click();

    // Discount percentage display
    await expect(page.getByText("50%").first()).toBeVisible();
    await expect(page.getByText("7,50").first()).toBeVisible(); // 50% of 15€
  });
});

/* ========================================================================== */
/*  4. SUBSCRIPTION CHANGES — MID-CYCLE                                       */
/* ========================================================================== */

test.describe("Abonnement — Changements en cours de cycle", () => {
  test.describe("Upgrade", () => {
    test("passage de Free à Pro en cours de cycle avec prorata", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_FREE);

      await page.route("**/api/stripe/checkout", async (route) => {
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("priceId");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: "https://checkout.stripe.com/c/pay/cs_upgrade_free_pro",
            prorated: true,
            proratedAmount: 750, // 7.50€ prorated
            immediateCharge: true,
          }),
        });
      });

      await page.goto("/billing/upgrade");

      // Select Pro plan
      await page.locator("[data-testid='upgrade-plan-select']").selectOption("pro");
      await page.locator("[data-testid='continue-upgrade-btn']").click();

      // Prorated amount should be displayed in the confirmation
      await expect(page.getByText("7,50").first()).toBeVisible();
      await expect(page.getByText("proratisé").first()).toBeVisible();
    });

    test("passage de Pro à Team en cours de cycle avec prorata", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.route("**/api/stripe/checkout", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: "https://checkout.stripe.com/c/pay/cs_upgrade_pro_team",
            prorated: true,
            proratedAmount: 1200, // 12.00€ prorated
            immediateCharge: true,
          }),
        });
      });

      await page.goto("/billing/upgrade");

      await page.locator("[data-testid='upgrade-plan-select']").selectOption("team");
      await page.locator("[data-testid='continue-upgrade-btn']").click();

      await expect(page.getByText("12,00").first()).toBeVisible();
      await expect(page.getByText("proratisé").first()).toBeVisible();
    });

    test("affiche le calcul du montant proratisé", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_FREE);

      await page.route("**/api/billing/proration", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            currentPlan: "FREE",
            targetPlan: "PRO",
            daysRemaining: 15,
            totalDays: 30,
            proratedAmount: 750,
            fullAmount: 1500,
            creditsUsed: 0,
            message: "Montant proratisé pour 15 jours restants : 7,50 €",
          }),
        });
      });

      await page.goto("/billing/upgrade");

      await page.locator("[data-testid='upgrade-plan-select']").selectOption("pro");

      // Proration details should be visible
      await expect(page.getByText("15 jours restants").first()).toBeVisible();
      await expect(page.getByText("7,50").first()).toBeVisible();
      await expect(page.getByText("15,00").first()).toBeVisible(); // Full amount
    });

    test("affiche les crédits proratisés pour le temps non utilisé", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.route("**/api/billing/proration", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            currentPlan: "PRO",
            targetPlan: "TEAM",
            daysRemaining: 20,
            totalDays: 30,
            proratedAmount: 2600,
            fullAmount: 3900,
            currentPlanCredits: 1000, // 10€ credit for unused PRO time
            creditsUsed: true,
            message:
              "Crédit de 10,00 € pour le temps non utilisé appliqué. Montant restant : 16,00 €",
          }),
        });
      });

      await page.goto("/billing/upgrade");

      await page.locator("[data-testid='upgrade-plan-select']").selectOption("team");

      // Credits should be displayed
      await expect(page.getByText("10,00").first()).toBeVisible();
      await expect(page.getByText("crédit").first()).toBeVisible();
    });
  });

  test.describe("Downgrade", () => {
    test("passage de Pro à Free programmé à la fin de la période de facturation", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.route("**/api/billing/subscription/downgrade", async (route) => {
        if (route.request().method() === "POST") {
          const body = JSON.parse(route.request().postData() || "{}");
          expect(body.targetPlan).toBe("FREE");
          expect(body.immediate).toBe(false);

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              currentPlan: "PRO",
              targetPlan: "FREE",
              effectiveDate: "2026-07-01T00:00:00Z",
              changeScheduled: true,
              message:
                "Downgrade vers Free programmé au 1 juillet 2026. Vous conservez Pro jusqu'à cette date.",
            }),
          });
        }
      });

      await page.goto("/billing/downgrade");

      await page.locator("[data-testid='downgrade-plan-select']").selectOption("free");
      await page.locator("[data-testid='confirm-downgrade-btn']").click();

      // Downgrade scheduled message
      await expect(page.getByText(/programmé/i).first()).toBeVisible();
      await expect(page.getByText("1 juillet 2026").first()).toBeVisible();
    });

    test("annule l'abonnement (fin de période de facturation)", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.route("**/api/billing/subscription/cancel", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              effectiveDate: "2026-07-01T00:00:00Z",
              cancelAtPeriodEnd: true,
              message:
                "Abonnement annulé. Vous conservez l'accès Pro jusqu'au 1 juillet 2026.",
            }),
          });
        }
      });

      await page.goto("/billing/cancel");

      // Click cancel subscription button
      await page.locator("[data-testid='cancel-subscription-btn']").click();

      // Confirmation dialog
      await page.locator("[data-testid='confirm-cancel-btn']").click();

      // Cancellation confirmation
      await expect(page.getByText(/annulé/i).first()).toBeVisible();
      await expect(page.getByText("1 juillet 2026").first()).toBeVisible();
    });

    test("réactive un abonnement annulé avant la fin de la période", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      // First cancel
      await page.route("**/api/billing/subscription/cancel", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              cancelAtPeriodEnd: true,
              effectiveDate: "2026-07-01T00:00:00Z",
              message: "Abonnement annulé.",
            }),
          });
        }
      });

      // Then reactivate
      await page.route("**/api/billing/subscription/reactivate", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              reactivated: true,
              message: "Abonnement réactivé. La résiliation a été annulée.",
            }),
          });
        }
      });

      await page.goto("/billing/cancel");
      await page.locator("[data-testid='cancel-subscription-btn']").click();
      await page.locator("[data-testid='confirm-cancel-btn']").click();

      // Now reactivate
      await page.locator("[data-testid='reactivate-subscription-btn']").click();
      await page.locator("[data-testid='confirm-reactivate-btn']").click();

      await expect(page.getByText(/réactivé/i).first()).toBeVisible();
    });

    test("affiche une boîte de dialogue de confirmation avant le changement", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.goto("/billing/downgrade");

      let dialogShown = false;
      page.on("dialog", async (dialog) => {
        dialogShown = true;
        expect(dialog.message()).toContain("Êtes-vous sûr");
        await dialog.accept();
      });

      // Mock the downgrade endpoint to prevent actual API call
      await page.route("**/api/billing/subscription/downgrade", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, changeScheduled: true }),
        });
      });

      await page.locator("[data-testid='downgrade-plan-select']").selectOption("free");
      await page.locator("[data-testid='confirm-downgrade-btn']").click();

      expect(dialogShown).toBe(true);
    });

    test("affiche un indicateur de changement en attente (downgrade programmé)", async ({ page }) => {
      await mockSession(page, MOCK_SESSION_PRO);

      await page.route("**/api/billing/subscription/pending-change", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            hasPendingChange: true,
            type: "downgrade",
            targetPlan: "FREE",
            effectiveDate: "2026-07-01T00:00:00Z",
            message: "Downgrade vers Free programmé au 1 juillet 2026",
          }),
        });
      });

      await page.goto("/billing");

      // Pending change indicator should be visible
      await expect(page.getByText(/changement en attente/i).first()).toBeVisible();
      await expect(page.getByText("Free").first()).toBeVisible();
      await expect(page.getByText("1 juillet 2026").first()).toBeVisible();
    });
  });
});

/* ========================================================================== */
/*  5. MULTIPLE SUBSCRIPTIONS & TEAM                                          */
/* ========================================================================== */

test.describe("Abonnement — Équipe et utilisateurs", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_TEAM);
  });

  const MOCK_TEAM_MEMBERS = [
    {
      id: "member_001",
      email: "alice@team.com",
      name: "Alice Dupont",
      role: "admin",
      status: "active",
      joinedAt: "2026-01-15T00:00:00Z",
    },
    {
      id: "member_002",
      email: "bob@team.com",
      name: "Bob Martin",
      role: "member",
      status: "active",
      joinedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "member_003",
      email: "invited@team.com",
      name: null,
      role: "member",
      status: "invited",
      joinedAt: null,
    },
  ];

  test("affiche la liste des membres de l'équipe", async ({ page }) => {
    await page.route("**/api/team/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members: MOCK_TEAM_MEMBERS }),
      });
    });

    await page.goto("/team");

    const memberRows = page.locator("[data-testid='team-member-row']");
    await expect(memberRows).toHaveCount(3);

    await expect(memberRows.nth(0)).toContainText("alice@team.com");
    await expect(memberRows.nth(0)).toContainText("Admin");
    await expect(memberRows.nth(1)).toContainText("Bob Martin");
    await expect(memberRows.nth(2)).toContainText("Invité");
  });

  test("invite un membre de l'équipe par email", async ({ page }) => {
    let inviteCalled = false;
    await page.route("**/api/team/invite", async (route) => {
      if (route.request().method() === "POST") {
        inviteCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("email");
        expect(body).toHaveProperty("role");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            email: body.email,
            role: body.role,
            message: `Invitation envoyée à ${body.email}`,
          }),
        });
      }
    });

    await page.goto("/team");

    // Click invite button
    await page.locator("[data-testid='invite-member-btn']").click();

    // Fill invite form
    await page.locator("[data-testid='invite-email-input']").fill("newmember@team.com");
    await page.locator("[data-testid='invite-role-select']").selectOption("member");
    await page.locator("[data-testid='send-invite-btn']").click();

    expect(inviteCalled).toBe(true);
    await expect(page.getByText("Invitation envoyée").first()).toBeVisible();
  });

  test("gère les rôles et permissions des membres", async ({ page }) => {
    let changeRoleCalled = false;
    await page.route("**/api/team/members/**", async (route) => {
      if (route.request().method() === "PATCH") {
        changeRoleCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("role");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, role: body.role }),
        });
      }
    });

    await page.route("**/api/team/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members: MOCK_TEAM_MEMBERS }),
      });
    });

    await page.goto("/team");

    // Change Bob's role from member to admin
    await page.locator("[data-testid='change-role-btn']").nth(1).click();
    await page.locator("[data-testid='role-selector']").selectOption("admin");
    await page.locator("[data-testid='save-role-btn']").click();

    expect(changeRoleCalled).toBe(true);
  });

  test("supprime un membre de l'équipe", async ({ page }) => {
    let deleteCalled = false;
    await page.route("**/api/team/members/**", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    });

    await page.route("**/api/team/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members: MOCK_TEAM_MEMBERS }),
      });
    });

    await page.goto("/team");

    // Remove Bob
    await page.locator("[data-testid='remove-member-btn']").nth(1).click();
    await page.locator("[data-testid='confirm-remove-btn']").click();

    expect(deleteCalled).toBe(true);
  });

  test("l'admin de facturation ne peut pas être supprimé", async ({ page }) => {
    await page.route("**/api/team/members", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ members: MOCK_TEAM_MEMBERS }),
      });
    });

    await page.goto("/team");

    // The admin (Alice) should not have a remove button, or it should be disabled
    const removeBtnForAdmin = page.locator("[data-testid='remove-member-btn']").first();
    await expect(removeBtnForAdmin).toBeDisabled();
  });

  test("modifie le nombre de sièges de l'équipe", async ({ page }) => {
    let updateSeatsCalled = false;
    await page.route("**/api/billing/team/seats", async (route) => {
      if (route.request().method() === "PUT") {
        updateSeatsCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("seats");
        expect(body.seats).toBe(10);

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            seats: 10,
            proratedAmount: 5850, // 5 additional seats × 39€ prorated
            message: "Capacité de l'équipe mise à jour à 10 sièges",
          }),
        });
      }
    });

    await page.route("**/api/billing/team/current-seats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ seats: 5, usedSeats: 2, availableSeats: 3 }),
      });
    });

    await page.goto("/team/settings");

    // Change seat count
    await page.locator("[data-testid='seat-count-input']").fill("10");
    await page.locator("[data-testid='update-seats-btn']").click();

    expect(updateSeatsCalled).toBe(true);
    await expect(page.getByText("10 sièges").first()).toBeVisible();
  });

  test("affiche les métriques d'utilisation de l'équipe", async ({ page }) => {
    await page.route("**/api/team/usage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalMembers: 3,
          activeMembers: 2,
          pendingInvites: 1,
          totalSeats: 5,
          usedSeats: 3,
          availableSeats: 2,
          apiCallsThisMonth: 1250,
          apiCallLimit: 10000,
          storageUsedMb: 45,
          storageLimitMb: 500,
        }),
      });
    });

    await page.goto("/team/usage");

    // Usage metrics should be visible
    await expect(page.getByText("3 / 5").first()).toBeVisible();
    await expect(page.getByText("1 250").first()).toBeVisible();
    await expect(page.getByText("10 000").first()).toBeVisible();
    await expect(page.getByText("45 Mo").first()).toBeVisible();
  });

  test("un membre invité accepte l'invitation", async ({ page }) => {
    // Mock the invitation acceptance endpoint
    await page.route("**/api/team/invite/accept", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body).toHaveProperty("token");

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Vous avez rejoint l'équipe !",
          }),
        });
      }
    });

    // Simulate visiting the invitation link
    await page.goto("/team/invite?token=invite_token_abc123");

    await page.locator("[data-testid='accept-invite-btn']").click();

    await expect(page.getByText("Vous avez rejoint l'équipe !").first()).toBeVisible();
  });
});

/* ========================================================================== */
/*  6. TAX / VAT HANDLING                                                     */
/* ========================================================================== */

test.describe("Facturation — TVA et taxes", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
  });

  test("valide un numéro de TVA intracommunautaire (format européen)", async ({ page }) => {
    await page.route("**/api/billing/validate-vat", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const vatNumber = body.vatNumber;

      // Valid French VAT: FR + 2 digits + 9 alphanumeric
      if (/^FR\d{11}$/.test(vatNumber)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            countryCode: "FR",
            vatNumber,
            companyName: "Example SARL",
            address: "123 Rue de Paris, 75001 Paris",
            exemption: true,
          }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            valid: false,
            error: "Numéro de TVA invalide",
            code: "VAT_INVALID",
          }),
        });
      }
    });

    await page.goto("/billing/tax");

    // Enter valid VAT number
    await page.locator("[data-testid='vat-number-input']").fill("FR12345678901");
    await page.locator("[data-testid='validate-vat-btn']").click();

    await expect(page.getByText("TVA valide").first()).toBeVisible();
  });

  test("rejette un numéro de TVA invalide", async ({ page }) => {
    await page.route("**/api/billing/validate-vat", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          valid: false,
          error: "Numéro de TVA invalide",
          code: "VAT_INVALID",
        }),
      });
    });

    await page.goto("/billing/tax");

    await page.locator("[data-testid='vat-number-input']").fill("INVALID123");
    await page.locator("[data-testid='validate-vat-btn']").click();

    await expect(page.getByText("Numéro de TVA invalide").first()).toBeVisible();
  });

  test("applique la TVA sur la facture", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [
            {
              id: "inv_tax_001",
              number: "INV-2026-0100",
              date: "2026-06-01T00:00:00Z",
              amount: 1500,
              taxAmount: 300, // 20% VAT
              totalAmount: 1800,
              taxRate: "20%",
              currency: "eur",
              status: "paid",
              pdfUrl: "/api/billing/invoices/inv_tax_001/pdf",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");

    const row = page.locator("[data-testid='invoice-row']").first();
    await expect(row).toContainText("TVA");
    await expect(row).toContainText("3,00"); // 3€ tax
    await expect(row).toContainText("18,00"); // 18€ total incl. tax
  });

  test("exonère de TVA pour un numéro de TVA valide", async ({ page }) => {
    await page.route("**/api/billing/validate-vat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          valid: true,
          countryCode: "FR",
          vatNumber: "FR12345678901",
          companyName: "Example SARL",
          exemption: true,
          exemptionType: "B2B_EU",
          message: "Exonération de TVA appliquée (autoliquidation)",
        }),
      });
    });

    await page.goto("/billing/tax");

    await page.locator("[data-testid='vat-number-input']").fill("FR12345678901");
    await page.locator("[data-testid='validate-vat-btn']").click();

    // Exemption should be confirmed
    await expect(page.getByText("Exonération de TVA").first()).toBeVisible();
    await expect(page.getByText("autoliquidation").first()).toBeVisible();
  });

  test("le taux de taxe dépend du pays de l'adresse de facturation", async ({ page }) => {
    await page.route("**/api/billing/tax-rates", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rates: [
            { country: "FR", countryName: "France", rate: 20, vatLabel: "TVA 20%" },
            { country: "DE", countryName: "Allemagne", rate: 19, vatLabel: "MwSt 19%" },
            { country: "GB", countryName: "Royaume-Uni", rate: 20, vatLabel: "VAT 20%" },
            { country: "CH", countryName: "Suisse", rate: 8.1, vatLabel: "MWST 8.1%" },
            { country: "US", countryName: "États-Unis", rate: 0, vatLabel: "No VAT" },
          ],
        }),
      });
    });

    await page.goto("/billing/tax");

    // Select Germany
    await page.locator("[data-testid='billing-country-select']").selectOption("DE");

    // Should show German tax rate
    await expect(page.getByText("19%").first()).toBeVisible();
    await expect(page.getByText("Allemagne").first()).toBeVisible();
  });

  test("affiche le taux de taxe sur la facture", async ({ page }) => {
    await page.route("**/api/billing/invoices", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          invoices: [
            {
              id: "inv_tax_002",
              number: "INV-2026-0101",
              date: "2026-06-15T00:00:00Z",
              amount: 1500,
              taxAmount: 285, // 19% German VAT
              totalAmount: 1785,
              taxRate: "19% (MwSt)",
              taxCountry: "DE",
              currency: "eur",
              status: "paid",
              pdfUrl: "/api/billing/invoices/inv_tax_002/pdf",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
        }),
      });
    });

    await page.goto("/billing/invoices");

    const row = page.locator("[data-testid='invoice-row']").first();
    await expect(row).toContainText("19%");
    await expect(row).toContainText("MwSt");
  });

  test("applique le reverse charge pour les transactions B2B intra-UE", async ({ page }) => {
    await page.route("**/api/billing/validate-vat", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const vatNumber = body.vatNumber;

      // German VAT number, French company = reverse charge
      if (vatNumber.startsWith("DE")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            valid: true,
            countryCode: "DE",
            vatNumber,
            companyName: "German GmbH",
            exemption: true,
            exemptionType: "B2B_EU_REVERSE_CHARGE",
            message:
              "Reverse charge — TVA due par l'acquéreur (autoliquidation intra-communautaire)",
          }),
        });
      }
    });

    await page.goto("/billing/tax");

    // Enter German VAT number (cross-border)
    await page.locator("[data-testid='vat-number-input']").fill("DE123456789");
    await page.locator("[data-testid='validate-vat-btn']").click();

    await expect(page.getByText("Reverse charge").first()).toBeVisible();
    await expect(page.getByText("autoliquidation").first()).toBeVisible();
  });

  test("le pays de l'adresse de facturation modifie le taux de taxe appliqué", async ({ page }) => {
    await page.route("**/api/billing/tax-rates", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rates: [
            { country: "FR", countryName: "France", rate: 20, vatLabel: "TVA 20%" },
            { country: "CH", countryName: "Suisse", rate: 8.1, vatLabel: "MWST 8.1%" },
          ],
        }),
      });
    });

    await page.route("**/api/billing/address", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            country: "FR",
            line1: "123 Rue de Paris",
            city: "Paris",
          }),
        });
      }
    });

    await page.goto("/billing/address");

    // Show current tax rate for France
    await expect(page.getByText("20%").first()).toBeVisible();

    // Change address to Switzerland
    await page.locator("[data-testid='address-country-select']").selectOption("CH");
    await page.locator("[data-testid='address-submit-btn']").click();

    // Should now show Swiss tax rate
    await page.goto("/billing/tax");
    await expect(page.getByText("8.1%").first()).toBeVisible();
  });
});

/* ========================================================================== */
/*  7. RECEIPTS & ACCOUNTING                                                  */
/* ========================================================================== */

test.describe("Facturation — Reçus et comptabilité", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);
  });

  test("envoie un reçu par email après un paiement réussi", async ({ page }) => {
    let receiptSent = false;
    await page.route("**/api/billing/receipts/send", async (route) => {
      if (route.request().method() === "POST") {
        receiptSent = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Reçu envoyé par email",
            email: "hardened-pro@test.com",
            receiptId: "rcpt_20260601_001",
          }),
        });
      }
    });

    await page.goto("/billing/receipts");

    await page.locator("[data-testid='send-receipt-btn']").first().click();

    expect(receiptSent).toBe(true);
    await expect(page.getByText("Reçu envoyé par email").first()).toBeVisible();
  });

  test("le reçu contient tous les champs requis (date, montant, plan, taxe, total)", async ({ page }) => {
    await page.route("**/api/billing/receipts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          receipts: [
            {
              id: "rcpt_001",
              number: "RCPT-2026-0001",
              date: "2026-06-01T00:00:00Z",
              plan: "PRO",
              periodStart: "2026-06-01T00:00:00Z",
              periodEnd: "2026-07-01T00:00:00Z",
              subtotal: 1500,
              taxAmount: 300,
              taxRate: "20%",
              total: 1800,
              currency: "eur",
              status: "paid",
              paymentMethod: "Visa •••• 4242",
            },
          ],
        }),
      });
    });

    await page.goto("/billing/receipts");

    const receipt = page.locator("[data-testid='receipt-card']").first();

    // All required fields should be present
    await expect(receipt).toContainText("RCPT-2026-0001");
    await expect(receipt).toContainText("1 juin 2026");
    await expect(receipt).toContainText("PRO");
    await expect(receipt).toContainText("15,00"); // subtotal
    await expect(receipt).toContainText("3,00"); // tax
    await expect(receipt).toContainText("18,00"); // total
    await expect(receipt).toContainText("Visa");
  });

  test("le format du numéro de reçu est correct", async ({ page }) => {
    await page.route("**/api/billing/receipts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          receipts: [
            {
              id: "rcpt_002",
              number: "RCPT-2026-0002",
              date: "2026-06-01T00:00:00Z",
              plan: "PRO",
              subtotal: 1500,
              taxAmount: 300,
              total: 1800,
              currency: "eur",
              status: "paid",
            },
          ],
        }),
      });
    });

    await page.goto("/billing/receipts");

    // Verify receipt number format: RCPT-YYYY-NNNN
    const receiptNumber = page.locator("[data-testid='receipt-number']").first();
    await expect(receiptNumber).toContainText("RCPT-2026-0002");
    await expect(receiptNumber).toContainText(/RCPT-\d{4}-\d{4}/);
  });

  test("affiche un reçu pour chaque période d'abonnement", async ({ page }) => {
    const receipts = [
      {
        id: "rcpt_period_1",
        number: "RCPT-2026-0001",
        date: "2026-06-01T00:00:00Z",
        plan: "PRO",
        periodStart: "2026-06-01T00:00:00Z",
        periodEnd: "2026-07-01T00:00:00Z",
        subtotal: 1500,
        taxAmount: 300,
        total: 1800,
        currency: "eur",
        status: "paid",
      },
      {
        id: "rcpt_period_2",
        number: "RCPT-2026-0002",
        date: "2026-07-01T00:00:00Z",
        plan: "PRO",
        periodStart: "2026-07-01T00:00:00Z",
        periodEnd: "2026-08-01T00:00:00Z",
        subtotal: 1500,
        taxAmount: 300,
        total: 1800,
        currency: "eur",
        status: "paid",
      },
    ];

    await page.route("**/api/billing/receipts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ receipts }),
      });
    });

    await page.goto("/billing/receipts");

    const receiptCards = page.locator("[data-testid='receipt-card']");
    await expect(receiptCards).toHaveCount(2);
    await expect(receiptCards.nth(0)).toContainText("1 juin 2026");
    await expect(receiptCards.nth(1)).toContainText("1 juillet 2026");
  });

  test("demande un duplicata de reçu", async ({ page }) => {
    let duplicateRequested = false;
    await page.route("**/api/billing/receipts/**/request-duplicate", async (route) => {
      if (route.request().method() === "POST") {
        duplicateRequested = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Duplicata envoyé par email",
          }),
        });
      }
    });

    await page.route("**/api/billing/receipts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          receipts: [
            {
              id: "rcpt_003",
              number: "RCPT-2026-0003",
              date: "2026-06-01T00:00:00Z",
              plan: "PRO",
              subtotal: 1500,
              taxAmount: 300,
              total: 1800,
              currency: "eur",
              status: "paid",
            },
          ],
        }),
      });
    });

    await page.goto("/billing/receipts");

    // Request duplicate
    await page.locator("[data-testid='request-duplicate-btn']").first().click();

    expect(duplicateRequested).toBe(true);
    await expect(page.getByText("Duplicata envoyé").first()).toBeVisible();
  });

  test("réémet un reçu après un nouveau paiement (payment retry)", async ({ page }) => {
    let reissuedCalled = false;
    await page.route("**/api/billing/receipts/**/reissue", async (route) => {
      if (route.request().method() === "POST") {
        reissuedCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Reçu réémis après paiement réussi",
            newReceiptNumber: "RCPT-2026-0004",
          }),
        });
      }
    });

    await page.route("**/api/billing/receipts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          receipts: [
            {
              id: "rcpt_failed_001",
              number: "RCPT-2026-0003",
              date: "2026-06-01T00:00:00Z",
              plan: "PRO",
              subtotal: 1500,
              taxAmount: 300,
              total: 1800,
              currency: "eur",
              status: "pending",
              paymentRetry: true,
            },
          ],
        }),
      });
    });

    await page.goto("/billing/receipts");

    // Click re-issue for the pending receipt with payment retry
    await page.locator("[data-testid='reissue-receipt-btn']").first().click();

    expect(reissuedCalled).toBe(true);
    await expect(page.getByText("Reçu réémis").first()).toBeVisible();
  });
});

/* ========================================================================== */
/*  8. PLAN CHANGE RESTRICTIONS                                               */
/* ========================================================================== */

test.describe("Facturation — Restrictions de changement de plan", () => {
  test("ne peut pas downgrader si l'utilisation dépasse les limites du plan cible", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await page.route("**/api/billing/check-downgrade", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          allowed: false,
          reason: "USAGE_EXCEEDS_LIMITS",
          currentUsage: { niches: 5, trendsPerNiche: 50 },
          targetLimits: { niches: 1, trendsPerNiche: 5 },
          message:
            "Impossible de downgrader vers Free. Vous utilisez 5 niches (limite Free: 1) et 50 tendances par niche (limite Free: 5).",
        }),
      });
    });

    await page.goto("/billing/downgrade");

    await page.locator("[data-testid='downgrade-plan-select']").selectOption("free");
    await page.locator("[data-testid='confirm-downgrade-btn']").click();

    // Error about usage exceeding limits
    await expect(
      page.getByText("Impossible de downgrader").first(),
    ).toBeVisible();
    await expect(page.getByText("5 niches").first()).toBeVisible();
    await expect(page.getByText("50 tendances").first()).toBeVisible();
  });

  test("affiche un avertissement si l'utilisation dépasse les limites du plan cible", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_TEAM);

    await page.route("**/api/billing/check-downgrade", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allowed: true,
          warning: true,
          currentUsage: { niches: 3, teamMembers: 2 },
          targetLimits: { niches: -1, teamMembers: 1 }, // Pro has 1 team member
          message:
            "Attention : votre équipe compte 2 membres, mais le plan Pro inclut 1 utilisateur. Les membres excédentaires seront désactivés.",
        }),
      });
    });

    await page.goto("/billing/downgrade");

    await page.locator("[data-testid='downgrade-plan-select']").selectOption("pro");
    await page.locator("[data-testid='confirm-downgrade-btn']").click();

    // Warning message should be shown
    await expect(page.getByText(/attention/i).first()).toBeVisible();
    await expect(page.getByText("2 membres").first()).toBeVisible();
  });

  test("plan forcé pour accommoder l'utilisation", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_FREE);

    // Simulate a scenario where free user tries to exceed limits and is forced to upgrade
    await page.route("**/api/billing/check-usage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          canProceed: false,
          forcedPlan: "PRO",
          reason: "NICHE_LIMIT_EXCEEDED",
          message:
            "Vous avez atteint la limite de 1 niche. Passez à Pro pour suivre des niches supplémentaires.",
        }),
      });
    });

    await page.goto("/billing");

    // Try to add a second niche while on Free plan
    await page.locator("[data-testid='add-niche-btn']").click();

    // Should see upgrade prompt
    await expect(page.getByText(/passez à Pro/i).first()).toBeVisible();
  });

  test("applique un délai de refroidissement entre les changements de plan", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await page.route("**/api/billing/plan-change-cooldown", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          inCooldown: true,
          daysRemaining: 25,
          cooldownPeriod: 30,
          lastChangeDate: "2026-05-26T00:00:00Z",
          nextChangeDate: "2026-06-25T00:00:00Z",
          message:
            "Période de refroidissement de 30 jours. Prochain changement possible le 25 juin 2026.",
        }),
      });
    });

    await page.goto("/billing/upgrade");

    // Should show cooldown warning
    await expect(page.getByText(/refroidissement/i).first()).toBeVisible();
    await expect(page.getByText("25 juin 2026").first()).toBeVisible();
  });

  test("gère la tarification héritée (grandfathered)", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await page.route("**/api/billing/grandfathered-plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          isGrandfathered: true,
          originalPlan: "PRO",
          grandfatheredPrice: 999, // 9.99€ (old price)
          currentPrice: 1500, // 15.00€ (new price)
          savingsPercent: 33,
          message:
            "Vous bénéficiez de la tarification héritée : 9,99 €/mois au lieu de 15,00 € (économie de 33%).",
        }),
      });
    });

    await page.goto("/billing");

    // Grandfathered pricing badge should be visible
    await expect(page.getByText(/tarification héritée/i).first()).toBeVisible();
    await expect(page.getByText("9,99").first()).toBeVisible();
    await expect(page.getByText("33%").first()).toBeVisible();
  });

  test("une période promotionnelle se termine et revient à la tarification standard", async ({ page }) => {
    await mockSession(page, MOCK_SESSION_PRO);

    await page.route("**/api/billing/promotional-period", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hasPromotion: false,
          promotionEnded: true,
          previousPrice: 500, // 5.00€ promotional
          currentPrice: 1500, // 15.00€ standard
          promotionEndDate: "2026-05-01T00:00:00Z",
          message:
            "Votre période promotionnelle s'est terminée le 1 mai 2026. Vous êtes maintenant à la tarification standard de 15,00 €/mois.",
        }),
      });
    });

    await page.goto("/billing");

    // Should show that promo has ended
    await expect(page.getByText(/promotionnelle s'est terminée/i).first()).toBeVisible();
    await expect(page.getByText("15,00").first()).toBeVisible();
  });
});
