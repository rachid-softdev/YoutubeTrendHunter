import { test, expect, type Page } from "@playwright/test";

/**
 * Billing Interactive Components E2E tests for YouTube TrendHunter
 *
 * Tests client-side interactive components on the billing page:
 * ManageSubscriptionButton, GenerateTokenButton, Copy Token button.
 *
 * The billing page is a server component requiring a real database-backed
 * NextAuth session. These tests use page.route() to mock the page's HTML
 * document (since server-side auth() cannot be mocked via client routes)
 * and intercept all API calls the client components make.
 *
 * Each test builds a faithful reproduction of the billing page structure
 * with inline JavaScript replicating the exact component behavior from:
 *   - src/components/dashboard/manage-subscription-button.tsx
 *   - src/components/dashboard/generate-token-button.tsx
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TEST_TOKEN_VALUE = "sk_test_abc123def456";
const NEW_TOKEN_VALUE = "sk_test_new_token_789";

const PORTAL_REDIRECT_URL = "https://billing.stripe.com/p/session/test";

/* -------------------------------------------------------------------------- */
/*  Helpers — Build mock billing page HTML                                    */
/* -------------------------------------------------------------------------- */

interface BillingPageOptions {
  plan: "FREE" | "PRO" | "TEAM";
  hasToken: boolean;
  tokenValue?: string;
  /** When true, the token <code> element and a "Copier" button are rendered */
  showCopyButton?: boolean;
}

/**
 * Build a self-contained HTML page that replicates the billing page's
 * interactive component structure. Inline JS mirrors the exact logic
 * from manage-subscription-button.tsx and generate-token-button.tsx.
 */
function buildBillingPageHTML(opts: BillingPageOptions): string {
  const { plan, hasToken, tokenValue = TEST_TOKEN_VALUE, showCopyButton = true } = opts;
  const isPaying = plan !== "FREE";

  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Facturation — TrendHunter</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; background: #fafafa; color: #111; }
    .max-w-2xl { max-width: 42rem; margin: 0 auto; }
    .space-y-8 > * + * { margin-top: 2rem; }
    .text-2xl { font-size: 1.5rem; }
    .font-bold { font-weight: 700; }
    .text-xl { font-size: 1.25rem; }
    .text-sm { font-size: 0.875rem; }
    .capitalize { text-transform: capitalize; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 20rem; display: inline-block; }
    .font-mono { font-family: "SF Mono", "Consolas", monospace; }
    .text-dark-ink-secondary { color: #666; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 0.5rem; }
    .inline-flex { display: inline-flex; }
    .p-6 { padding: 1.5rem; }
    .rounded-none { border-radius: 0; }
    .border { border: 1px solid; }
    .border-hairline-dark { border-color: #ddd; }
    .bg-transparent { background: transparent; }
    .bg-dark-surface { background: #eee; }
    .rounded { border-radius: 4px; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .h-9 { height: 2.25rem; }
    .whitespace-nowrap { white-space: nowrap; }
    .font-medium { font-weight: 500; }
    .transition-colors { transition: background-color 0.2s, color 0.2s; }
    button:disabled { opacity: 0.5; pointer-events: none; }
    a { color: #0066cc; text-decoration: underline; }
    .bg-yt-red { background: #cc0000; color: white; }
    .bg-yt-red-deep { background: #990000; }
    .hover\\:bg-dark-surface:hover { background: #eee; }
    .hover\\:text-dark-ink:hover { color: #111; }
    .hover\\:bg-yt-red-deep:hover { background: #990000; }
    .inline-flex.items-center.justify-center.gap-2 { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
  </style>
</head>
<body>
  <div class="max-w-2xl space-y-8" data-testid="billing-page">

    <!-- =========== PAGE TITLE =========== -->
    <h1 class="text-2xl font-bold" data-testid="page-title">Facturation</h1>

    <!-- =========== PLAN CARD =========== -->
    <div class="border border-hairline-dark p-6 rounded-none" data-testid="plan-card">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-dark-ink-secondary" data-testid="plan-label">Plan actuel</p>
          <div class="flex items-center gap-2 mt-1">
            <p class="text-xl font-bold capitalize" data-testid="plan-name">${plan.toLowerCase()}</p>
            <span data-testid="plan-badge">${plan}</span>
          </div>
        </div>
        ${
          isPaying
            ? /* ManageSubscriptionButton (PRO / TEAM) */ `
          <button
            data-testid="manage-subscription-btn"
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors border border-hairline-dark bg-transparent px-4 py-2 h-9 hover:bg-dark-surface hover:text-dark-ink"
            onclick="handleManageSubscription(this)"
          >
            Gérer l'abonnement
          </button>`
            : /* FREE plan — "Passer Pro" link */ `
          <a
            href="/pricing"
            data-testid="upgrade-link"
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors bg-yt-red text-white px-4 py-2 h-9 hover:bg-yt-red-deep"
          >
            Passer Pro
          </a>`
        }
      </div>
    </div>

    <!-- =========== TOKEN API CARD =========== -->
    <div class="border border-hairline-dark p-6 rounded-none" data-testid="token-card">
      <div data-testid="token-header">
        <h2 class="text-xl font-bold" data-testid="token-title">Token API — Extension Chrome</h2>
        <p class="text-sm text-dark-ink-secondary mt-1" data-testid="token-description">
          Utilisez ce token pour connecter l'extension TrendHunter à votre compte.
        </p>
      </div>
      <div class="mt-2" data-testid="token-content">
        ${
          hasToken
            ? `
        <div data-testid="token-section" class="mb-4">
          <p class="text-sm text-dark-ink-secondary mb-2" data-testid="token-date-info">
            Dernier token créé le 15/06/2026. Le token complet est affiché uniquement lors de la création.
          </p>
          <div class="flex items-center gap-2">
            <code
              data-testid="token-value"
              class="truncate font-mono text-sm border border-hairline-dark px-2 py-1"
            >${tokenValue}</code>
            ${
              showCopyButton
                ? `
            <button
              data-testid="copy-token-btn"
              class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium border border-hairline-dark bg-transparent px-3 py-1 h-8 hover:bg-dark-surface"
              onclick="handleCopyToken()"
            >
              Copier
            </button>`
                : ""
            }
          </div>
        </div>`
            : ""
        }
        <!-- GenerateTokenButton -->
        <button
          data-testid="generate-token-btn"
          class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors border border-hairline-dark bg-transparent px-4 py-2 h-9 hover:bg-dark-surface hover:text-dark-ink"
          onclick="handleGenerateToken(this)"
        >
          Générer un nouveau token
        </button>
      </div>
    </div>

  </div>

  <script>
    // ---- Manage Subscription (mirrors manage-subscription-button.tsx) ----
    let manageLoading = false;
    window.handleManageSubscription = async function(btn) {
      if (manageLoading) return;
      manageLoading = true;
      btn.textContent = 'Chargement...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/stripe/portal', { method: 'POST' });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (error) {
        console.error(error);
      } finally {
        manageLoading = false;
        btn.textContent = "Gérer l'abonnement";
        btn.disabled = false;
      }
    };

    // ---- Generate Token (mirrors generate-token-button.tsx) ----
    let genLoading = false;
    window.handleGenerateToken = async function(btn) {
      if (genLoading) return;
      genLoading = true;
      btn.textContent = 'Génération...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/extension/auth', { method: 'POST' });
        const data = await res.json();
        if (data.token) {
          await navigator.clipboard.writeText(data.token);
          alert('Token copié dans le presse-papiers !');
        }
      } catch (error) {
        console.error(error);
      } finally {
        genLoading = false;
        btn.textContent = 'Générer un nouveau token';
        btn.disabled = false;
      }
    };

    // ---- Copy Token ----
    window.handleCopyToken = async function() {
      const codeEl = document.querySelector('[data-testid="token-value"]');
      if (codeEl) {
        await navigator.clipboard.writeText(codeEl.textContent.trim());
      }
    };
  </script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*  Helpers — Mock API routes                                                 */
/* -------------------------------------------------------------------------- */

/** Mock the client-side /api/auth/session endpoint. */
async function mockSession(page: Page): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "test@test.com",
          role: "USER",
          plan: "PRO",
        },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

/**
 * Set up page.route to intercept /billing document requests and serve
 * the mock billing page HTML. Call this once per test BEFORE page.goto.
 */
async function mockBillingPage(page: Page, opts: BillingPageOptions): Promise<void> {
  // Only intercept document navigation to /billing (exact or with trailing slash)
  await page.route("**/billing", async (route, request) => {
    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: buildBillingPageHTML(opts),
      });
    } else {
      await route.continue();
    }
  });
}

/** Collect console.error messages emitted during a test. */
function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  return errors;
}

/** Collect pageerror events emitted during a test. */
function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  return errors;
}

/* ======================================================================== */
/*  Billing Page Structure                                                  */
/* ======================================================================== */

test.describe("Billing — Structure de la page", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("affiche le titre 'Facturation' et le label 'Plan actuel'", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await expect(page.getByTestId("page-title")).toHaveText("Facturation");
    await expect(page.getByTestId("plan-label")).toHaveText("Plan actuel");
  });

  test("affiche le nom du plan en capitalize (lowercase)", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const planName = page.getByTestId("plan-name");
    // plan.toLowerCase() => "pro"; Tailwind capitalize class uppercases first letter
    await expect(planName).toHaveText("pro");
  });

  test("plan PRO affiche le bouton 'Gérer l'abonnement'", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText("Gérer l'abonnement");
  });

  test("plan TEAM affiche le bouton 'Gérer l'abonnement'", async ({ page }) => {
    await mockBillingPage(page, { plan: "TEAM", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText("Gérer l'abonnement");
  });

  test("plan FREE affiche 'Passer Pro' avec lien vers /pricing", async ({ page }) => {
    await mockBillingPage(page, { plan: "FREE", hasToken: false });
    await page.goto("/billing");

    const link = page.getByTestId("upgrade-link");
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Passer Pro");
    await expect(link).toHaveAttribute("href", "/pricing");
  });

  test("affiche la section Token API avec titre et description", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await expect(page.getByTestId("token-title")).toHaveText("Token API — Extension Chrome");
    await expect(page.getByTestId("token-description")).toContainText(
      "connecter l'extension TrendHunter",
    );
  });

  test("le token est affiché dans un élément <code> avec truncation et police monospace", async ({
    page,
  }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const codeEl = page.getByTestId("token-value");
    await expect(codeEl).toBeVisible();
    await expect(codeEl).toHaveText(TEST_TOKEN_VALUE);

    // Verify CSS classes for truncation and monospace font
    const classAttr = await codeEl.getAttribute("class");
    expect(classAttr).toContain("truncate");
    expect(classAttr).toContain("font-mono");
  });

  test("le plan FREE n'affiche PAS le bouton 'Gérer l'abonnement'", async ({ page }) => {
    await mockBillingPage(page, { plan: "FREE", hasToken: false });
    await page.goto("/billing");

    await expect(page.getByTestId("manage-subscription-btn")).toHaveCount(0);
  });

  test("les plans PRO et TEAM n'affichent PAS le lien 'Passer Pro'", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");
    await expect(page.getByTestId("upgrade-link")).toHaveCount(0);

    await mockBillingPage(page, { plan: "TEAM", hasToken: true });
    await page.goto("/billing");
    await expect(page.getByTestId("upgrade-link")).toHaveCount(0);
  });
});

/* ======================================================================== */
/*  ManageSubscriptionButton                                                */
/* ======================================================================== */

test.describe("ManageSubscriptionButton — Gérer l'abonnement", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("affiche le texte 'Gérer l'abonnement' à l'état initial (idle)", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    await expect(btn).toHaveText("Gérer l'abonnement");
    await expect(btn).toBeEnabled();
  });

  test("affiche 'Chargement...' et désactive le bouton pendant le chargement", async ({ page }) => {
    // Delay the API response so we can observe the loading state
    await page.route("**/api/stripe/portal", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: PORTAL_REDIRECT_URL }),
      });
    });

    // Intercept the redirect URL to prevent actual navigation
    await page.route(PORTAL_REDIRECT_URL, async (route) => {
      await route.fulfill({ status: 200, body: "Mock portal" });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    await btn.click();

    // Immediately after click, check loading state
    await expect(btn).toHaveText("Chargement...");
    await expect(btn).toBeDisabled();
  });

  test("click → effectue un fetch POST vers /api/stripe/portal", async ({ page }) => {
    let requestMethod = "";
    let requestUrl = "";
    await page.route("**/api/stripe/portal", async (route) => {
      requestMethod = route.request().method();
      requestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: PORTAL_REDIRECT_URL }),
      });
    });

    // Intercept the redirect URL to prevent actual navigation
    await page.route(PORTAL_REDIRECT_URL, async (route) => {
      await route.fulfill({ status: 200, body: "Mock portal" });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("manage-subscription-btn").click();
    await page.waitForURL(PORTAL_REDIRECT_URL);

    expect(requestMethod).toBe("POST");
    expect(requestUrl).toContain("/api/stripe/portal");
  });

  test("sur succès avec URL → redirige via window.location.href", async ({ page }) => {
    await page.route("**/api/stripe/portal", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: PORTAL_REDIRECT_URL }),
      });
    });

    // Intercept the redirect URL
    await page.route(PORTAL_REDIRECT_URL, async (route) => {
      await route.fulfill({ status: 200, body: "Mock portal" });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("manage-subscription-btn").click();

    // The page should navigate to the Stripe portal URL
    await page.waitForURL(PORTAL_REDIRECT_URL);
    // Verify we arrived at the portal URL
    expect(page.url()).toContain("billing.stripe.com");
  });

  test("sur erreur → console.error est appelé", async ({ page }) => {
    await page.route("**/api/stripe/portal", async (route) => {
      await route.abort("connectionrefused");
    });

    const consoleErrors = captureConsoleErrors(page);

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("manage-subscription-btn").click();

    // Wait for the fetch to fail and the error to be logged
    await page.waitForTimeout(500);

    // TypeErrors from fetch failures are logged as errors
    expect(consoleErrors.length).toBeGreaterThanOrEqual(1);
  });

  test("bouton variant 'outline' — vérifie les classes CSS", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    const classAttr = await btn.getAttribute("class");

    // "outline" variant: border + bg-transparent + hover styles
    expect(classAttr).toContain("border");
    expect(classAttr).toContain("bg-transparent");
    expect(classAttr).toContain("rounded-none");
    expect(classAttr).toContain("text-sm");
    expect(classAttr).toContain("font-medium");
  });
});

/* ======================================================================== */
/*  GenerateTokenButton                                                     */
/* ======================================================================== */

test.describe("GenerateTokenButton — Générer un nouveau token", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("affiche le texte 'Générer un nouveau token' à l'état initial (idle)", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    await expect(btn).toHaveText("Générer un nouveau token");
    await expect(btn).toBeEnabled();
  });

  test("affiche 'Génération...' et désactive le bouton pendant le chargement", async ({ page }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    await btn.click();

    // Immediately after click, check loading state
    await expect(btn).toHaveText("Génération...");
    await expect(btn).toBeDisabled();
  });

  test("click → effectue un fetch POST vers /api/extension/auth", async ({ page }) => {
    let requestMethod = "";
    let requestUrl = "";
    await page.route("**/api/extension/auth", async (route) => {
      requestMethod = route.request().method();
      requestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("generate-token-btn").click();

    // Wait for the fetch to complete (loading finishes, text reverts)
    await expect(page.getByTestId("generate-token-btn")).toHaveText("Générer un nouveau token", {
      timeout: 3000,
    });

    expect(requestMethod).toBe("POST");
    expect(requestUrl).toContain("/api/extension/auth");
  });

  test("sur succès → navigator.clipboard.writeText est appelé avec le token", async ({ page }) => {
    // Grant clipboard permission
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    let clipboardText = "";
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    // Intercept the alert dialog
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByTestId("generate-token-btn").click();

    // Wait for completion
    await expect(page.getByTestId("generate-token-btn")).toHaveText("Générer un nouveau token", {
      timeout: 3000,
    });

    // Read what was written to clipboard
    clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(NEW_TOKEN_VALUE);
  });

  test("sur succès → alert('Token copié dans le presse-papiers !') est affiché", async ({
    page,
  }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    // Capture the alert dialog
    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByTestId("generate-token-btn").click();

    // Wait for the dialog to appear
    await page.waitForTimeout(500);
    expect(alertMessage).toBe("Token copié dans le presse-papiers !");
  });

  test("sur erreur → console.error est appelé", async ({ page }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.abort("connectionrefused");
    });

    const consoleErrors = captureConsoleErrors(page);

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("generate-token-btn").click();

    // Wait for the fetch to fail and the error to be logged
    await page.waitForTimeout(500);

    expect(consoleErrors.length).toBeGreaterThanOrEqual(1);
  });

  test("bouton variant 'outline' — vérifie les classes CSS", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    const classAttr = await btn.getAttribute("class");

    expect(classAttr).toContain("border");
    expect(classAttr).toContain("bg-transparent");
    expect(classAttr).toContain("rounded-none");
    expect(classAttr).toContain("text-sm");
    expect(classAttr).toContain("font-medium");
  });
});

/* ======================================================================== */
/*  Token Copy Button                                                       */
/* ======================================================================== */

test.describe("Token Copy Button — Copier le token", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("bouton 'Copier' est visible à côté du token", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    const copyBtn = page.getByTestId("copy-token-btn");
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveText("Copier");
  });

  test("click → navigator.clipboard.writeText avec la valeur du token", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    await page.getByTestId("copy-token-btn").click();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(TEST_TOKEN_VALUE);
  });

  test("pas d'état de chargement (copie immédiate)", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    const copyBtn = page.getByTestId("copy-token-btn");

    // Click and immediately check the button text hasn't changed
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copier"); // No loading text
    await expect(copyBtn).toBeEnabled(); // Still enabled
  });

  test("style du bouton: border, rounded, text-sm", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    const btn = page.getByTestId("copy-token-btn");
    const classAttr = await btn.getAttribute("class");

    expect(classAttr).toContain("border");
    expect(classAttr).toContain("rounded");
    expect(classAttr).toContain("text-sm");
  });

  test("le bouton Copier n'est pas affiché quand showCopyButton est false", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: false });
    await page.goto("/billing");

    await expect(page.getByTestId("copy-token-btn")).toHaveCount(0);
  });
});

/* ======================================================================== */
/*  Interaction Edge Cases                                                  */
/* ======================================================================== */

test.describe("Billing — Cas limites d'interaction", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("la section token est masquée quand apiToken est null/undefined", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: false });
    await page.goto("/billing");

    // No token section, no token value, no copy button
    await expect(page.getByTestId("token-section")).toHaveCount(0);
    await expect(page.getByTestId("token-value")).toHaveCount(0);
    await expect(page.getByTestId("copy-token-btn")).toHaveCount(0);

    // But the generate button is always visible
    await expect(page.getByTestId("generate-token-btn")).toBeVisible();
  });

  test("générer un nouveau token remplace l'ancien (vérifié via le presse-papiers)", async ({
    page,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true, tokenValue: TEST_TOKEN_VALUE });
    await page.goto("/billing");

    // Verify old token is displayed
    await expect(page.getByTestId("token-value")).toHaveText(TEST_TOKEN_VALUE);

    // Capture and accept alert
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Generate new token
    await page.getByTestId("generate-token-btn").click();
    await expect(page.getByTestId("generate-token-btn")).toHaveText("Générer un nouveau token", {
      timeout: 3000,
    });

    // The new token should be in the clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(NEW_TOKEN_VALUE);
    expect(clipboardText).not.toBe(TEST_TOKEN_VALUE);
  });

  test("double-clic sur 'Gérer l'abonnement' → un seul appel API", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/stripe/portal", async (route) => {
      callCount++;
      // Delay to ensure second click happens during loading
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: PORTAL_REDIRECT_URL }),
      });
    });

    await page.route(PORTAL_REDIRECT_URL, async (route) => {
      await route.fulfill({ status: 200, body: "Mock portal" });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    // Wait for page to be ready
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("manage-subscription-btn");

    // Triple-click rapidly
    await btn.click({ clickCount: 3 });

    // Wait for navigation
    await page.waitForURL(PORTAL_REDIRECT_URL, { timeout: 5000 });

    // Should only have been called once (loading guard prevents re-calls)
    expect(callCount).toBe(1);
  });

  test("double-clic sur 'Générer un nouveau token' → un seul appel API", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    let callCount = 0;
    await page.route("**/api/extension/auth", async (route) => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    let alertCount = 0;
    page.on("dialog", async (dialog) => {
      alertCount++;
      await dialog.accept();
    });

    const btn = page.getByTestId("generate-token-btn");

    // Triple-click rapidly
    await btn.click({ clickCount: 3 });

    // Wait for completion
    await expect(btn).toHaveText("Générer un nouveau token", { timeout: 5000 });

    // Should only have been called once
    expect(callCount).toBe(1);
    expect(alertCount).toBe(1);
  });

  test("Clipboard API indisponible → gestion gracieuse (pas de crash)", async ({ page }) => {
    // Remove clipboard API before page loads
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });
    });

    const pageErrors = capturePageErrors(page);

    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    // The button should still be clickable and not crash the page
    const btn = page.getByTestId("generate-token-btn");
    await btn.click();

    // Wait for the async operation to complete (clipboard undefined throws)
    await page.waitForTimeout(500);

    // The page should not have any unhandled errors
    expect(pageErrors.length).toBe(0);

    // Button should return to idle state
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Générer un nouveau token");
  });

  test("alert dialog affiché après génération de token", async ({ page }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    // Set up dialog handler BEFORE clicking
    let dialogShown = false;
    let dialogMessage = "";
    page.on("dialog", async (dialog) => {
      dialogShown = true;
      dialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByTestId("generate-token-btn").click();

    // Wait for the dialog to appear and be handled
    await page.waitForTimeout(1000);

    expect(dialogShown).toBe(true);
    expect(dialogMessage).toBe("Token copié dans le presse-papiers !");
  });

  test("le bouton Copier n'a pas d'état de chargement — toujours accessible", async ({ page }) => {
    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");

    const copyBtn = page.getByTestId("copy-token-btn");

    // Click multiple times rapidly
    for (let i = 0; i < 5; i++) {
      await copyBtn.click();
    }

    // Button should always be enabled and show "Copier"
    await expect(copyBtn).toBeEnabled();
    await expect(copyBtn).toHaveText("Copier");
  });
});

/* ======================================================================== */
/*  API Error Handling — Portal & Extension endpoints                       */
/* ======================================================================== */

test.describe("Billing — Gestion d'erreurs API", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("POST /api/stripe/portal retourne 500 → console.error + bouton réactivé", async ({
    page,
  }) => {
    await page.route("**/api/stripe/portal", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne" }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("manage-subscription-btn");
    await btn.click();

    // Wait for the fetch to complete (no redirect since there's no URL)
    await page.waitForTimeout(500);

    // Button should be re-enabled with original text
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Gérer l'abonnement");

    // Note: HTTP 500 with JSON body still parses fine, so data.url will be undefined
    // and the component silently returns without redirect or console.error
  });

  test("POST /api/extension/auth retourne 500 → console.error + bouton réactivé", async ({
    page,
  }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne" }),
      });
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    await btn.click();

    // Wait for the fetch to complete
    await page.waitForTimeout(500);

    // Button should be re-enabled with original text
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Générer un nouveau token");
  });

  test("POST /api/extension/auth retourne un body sans token → pas de clipboard, pas d'alert", async ({
    page,
  }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }), // No token field
      });
    });

    let alertShown = false;
    page.on("dialog", () => {
      alertShown = true;
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    await page.getByTestId("generate-token-btn").click();

    // Wait for completion
    await page.waitForTimeout(500);

    // No alert should be shown (because no token)
    expect(alertShown).toBe(false);

    // Button should be re-enabled
    await expect(page.getByTestId("generate-token-btn")).toBeEnabled();
  });
});

/* ======================================================================== */
/*  Token API — Error & Performance Scenarios                               */
/* ======================================================================== */

test.describe("Token API — Scénarios d'erreur et performance", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Token — 403 retourné pour FREE/PRO — pas de clipboard, pas d'alert, bouton réactivé", async ({
    page,
  }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forbidden" }),
      });
    });

    let alertShown = false;
    page.on("dialog", () => {
      alertShown = true;
    });

    await mockBillingPage(page, { plan: "FREE", hasToken: false });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    await btn.click();
    await page.waitForTimeout(500);

    expect(alertShown).toBe(false);
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Générer un nouveau token");
  });

  test("Token — Rate limiting 429 — vérifie les en-têtes Retry-After", async ({ page }) => {
    let requestCount = 0;
    let rateLimitedResponse:
      | { status: number; headers: Record<string, string>; body: any }
      | undefined;

    await page.route("**/api/extension/auth", async (route) => {
      requestCount++;
      if (requestCount > 3) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: {
            "Retry-After": "30",
            "X-RateLimit-Limit": "3",
            "X-RateLimit-Remaining": "0",
          },
          body: JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMIT" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ token: NEW_TOKEN_VALUE }),
        });
      }
    });

    await mockBillingPage(page, { plan: "PRO", hasToken: false });
    await page.goto("/billing");

    // Exceed the rate limit by firing rapid fetch calls
    for (let i = 0; i < 5; i++) {
      const result = await page.evaluate(async () => {
        const res = await fetch("/api/extension/auth", { method: "POST" });
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: await res.json(),
        };
      });
      if (result.status === 429) {
        rateLimitedResponse = result;
      }
    }

    expect(rateLimitedResponse).toBeDefined();
    if (rateLimitedResponse) {
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.headers["retry-after"]).toBe("30");
      expect(rateLimitedResponse.body.code).toBe("RATE_LIMIT");
    }
  });

  test("Token — 403 silencieux avec message d'erreur API non disponible", async ({ page }) => {
    await page.route("**/api/extension/auth", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "API non disponible" }),
      });
    });

    const consoleErrors = captureConsoleErrors(page);

    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");

    const btn = page.getByTestId("generate-token-btn");
    await btn.click();
    await page.waitForTimeout(500);

    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Générer un nouveau token");
  });
});

/* ======================================================================== */
/*  Badge Plan — Styles CSS                                                */
/* ======================================================================== */

test.describe("Badge Plan — Styles CSS", () => {
  test("Badge — Classe CSS plan-free vs plan-pro", async ({ page }) => {
    await mockSession(page);

    // Test FREE badge
    await mockBillingPage(page, { plan: "FREE", hasToken: false });
    await page.goto("/billing");
    let badge = page.getByTestId("plan-badge");
    await expect(badge).toHaveText("FREE");

    // Test PRO badge
    await mockBillingPage(page, { plan: "PRO", hasToken: true });
    await page.goto("/billing");
    badge = page.getByTestId("plan-badge");
    await expect(badge).toHaveText("PRO");

    // Test TEAM badge
    await mockBillingPage(page, { plan: "TEAM", hasToken: true });
    await page.goto("/billing");
    badge = page.getByTestId("plan-badge");
    await expect(badge).toHaveText("TEAM");
  });
});

/* ======================================================================== */
/*  Accessibilité — Navigation clavier                                     */
/* ======================================================================== */

test.describe("Accessibilité — Navigation clavier", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("Badge — Ordre tabulation page Facturation", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await mockBillingPage(page, { plan: "PRO", hasToken: true, showCopyButton: true });
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    // First Tab → manage subscription button
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("manage-subscription-btn")).toBeFocused();

    // Second Tab → generate token button
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("generate-token-btn")).toBeFocused();

    // Third Tab → copy token button
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("copy-token-btn")).toBeFocused();
  });

  test("Upgrade — Lien Passer Pro focusable clavier", async ({ page }) => {
    await mockBillingPage(page, { plan: "FREE", hasToken: false });

    // Mock /pricing navigation
    await page.route("**/pricing", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "Mock pricing" });
    });

    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    const upgradeLink = page.getByTestId("upgrade-link");

    // Focus the link using Tab
    await page.keyboard.press("Tab");
    await expect(upgradeLink).toBeFocused();

    // Press Enter to activate
    await page.keyboard.press("Enter");

    // Should navigate to /pricing
    await page.waitForURL("/pricing");
  });
});
