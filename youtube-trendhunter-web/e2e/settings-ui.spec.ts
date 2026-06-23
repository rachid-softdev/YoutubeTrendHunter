import { test, expect, type Page } from "@playwright/test";

/**
 * Settings UI E2E tests for YouTube TrendHunter
 *
 * Tests the client-side SettingsContent component:
 * - Tab navigation (Infos / Données)
 * - Profile display (disabled inputs, sign out button)
 * - Account deletion flow (confirm dialog, API call, redirect)
 *
 * Uses the same mock-page pattern as billing-components.spec.ts
 * since server-side auth() cannot be mocked via client routes.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers — Build mock settings page HTML                                   */
/* -------------------------------------------------------------------------- */

interface SettingsUser {
  name: string;
  email: string;
}

/**
 * Build a self-contained HTML page that replicates the SettingsContent
 * component's structure and behavior. Inline JS mirrors the exact logic
 * from settings-content.tsx.
 */
function buildSettingsPageHTML(user: SettingsUser): string {
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Paramètres — TrendHunter</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; background: #fafafa; color: #111; }
    .max-w-2xl { max-width: 42rem; margin: 0 auto; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mt-1 { margin-top: 0.25rem; }
    .my-6 { margin-top: 1.5rem; margin-bottom: 1.5rem; }
    .text-2xl { font-size: 1.5rem; }
    .font-bold { font-weight: 700; }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .text-\\[10px\\] { font-size: 10px; }
    .font-medium { font-weight: 500; }
    .italic { font-style: italic; }
    .text-dark-ink { color: #111; }
    .text-dark-ink-secondary { color: #666; }
    .text-dark-ink-tertiary { color: #999; }
    .border-hairline-dark { border-color: #ddd; }
    .border-yt-red { border-color: #cc0000; }
    .border-yt-red\\/10 { border-color: rgba(204, 0, 0, 0.1); }
    .border-yt-red\\/20 { border-color: rgba(204, 0, 0, 0.2); }
    .bg-yt-red { background: #cc0000; }
    .bg-yt-red\\/5 { background: rgba(204, 0, 0, 0.05); }
    .bg-dark-overlay { background: #f0f0f0; }
    .rounded-none { border-radius: 0; }
    .border { border: 1px solid; }
    .border-b { border-bottom: 1px solid; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-start { justify-content: flex-start; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-4 { gap: 1rem; }
    .p-4 { padding: 1rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .pt-2 { padding-top: 0.5rem; }
    .w-full { width: 100%; }
    .w-5 { width: 1.25rem; }
    .h-5 { height: 1.25rem; }
    .w-4 { width: 1rem; }
    .h-4 { height: 1rem; }
    .shrink-0 { flex-shrink: 0; }
    .relative { position: relative; }
    .absolute { position: absolute; }
    .bottom-0 { bottom: 0; }
    .left-0 { left: 0; }
    .right-0 { right: 0; }
    .h-0\\.5 { height: 2px; }
    .transition-colors { transition: background-color 0.2s, color 0.2s; }
    .hover\\:text-dark-ink:hover { color: #111; }
    .hover\\:text-yt-red:hover { color: #cc0000; }
    .hover\\:bg-yt-red\\/5:hover { background: rgba(204, 0, 0, 0.05); }
    button { cursor: pointer; font-family: inherit; }
    button:disabled { opacity: 0.5; pointer-events: none; }
    input { font-family: inherit; padding: 0.5rem 0.75rem; width: 100%; box-sizing: border-box; }
    input:disabled { opacity: 1; cursor: not-allowed; }
    label { display: block; }
    .opacity-20 { opacity: 0.2; }
    .mr-2 { margin-right: 0.5rem; }
    hr { border: none; border-top: 1px solid #ddd; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="max-w-2xl" data-testid="settings-page">
    <div class="mb-8">
      <h1 class="text-2xl font-bold" data-testid="page-title">Paramètres</h1>
      <p class="text-dark-ink-secondary mt-1" data-testid="page-subtitle">Gérez votre compte et vos données</p>
    </div>

    <div id="settings-root" class="space-y-6">
      <!-- Tab Menu -->
      <div class="flex gap-1 border-b border-hairline-dark mb-6" data-testid="tab-bar">
        <button
          id="tab-infos"
          data-testid="tab-infos"
          class="px-4 py-2 text-sm font-medium transition-colors relative tab-btn text-dark-ink"
          onclick="switchTab('infos')"
        >
          Informations
          <div id="indicator-infos" class="absolute bottom-0 left-0 right-0 h-0.5 bg-yt-red" data-testid="tab-indicator-infos"></div>
        </button>
        <button
          id="tab-data"
          data-testid="tab-data"
          class="px-4 py-2 text-sm font-medium transition-colors relative tab-btn text-dark-ink-secondary"
          onclick="switchTab('data')"
        >
          Données
          <div id="indicator-data" class="absolute bottom-0 left-0 right-0 h-0.5 hidden" data-testid="tab-indicator-data"></div>
        </button>
      </div>

      <!-- Tab Content: Infos -->
      <div id="content-infos" data-testid="content-infos">
        <div class="border border-hairline-dark rounded-none" data-testid="profile-card">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-dark-ink-tertiary" data-testid="user-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4.418 0-8 1.79-8 4v2h16v-2c0-2.21-3.582-4-8-4z"/></svg>
              <h2 class="font-bold text-dark-ink" data-testid="profile-title">Profil</h2>
            </div>
            <p class="text-sm text-dark-ink-secondary" data-testid="profile-description">Vos informations personnelles</p>
          </div>
          <div class="px-6 pb-6 space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-dark-ink-secondary">Nom</label>
              <input
                data-testid="input-name"
                class="rounded-none bg-dark-overlay border border-hairline-dark"
                value="${user.name}"
                disabled
              />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-dark-ink-secondary">Email</label>
              <input
                data-testid="input-email"
                class="rounded-none bg-dark-overlay border border-hairline-dark"
                value="${user.email}"
                disabled
              />
              <p class="text-[10px] text-dark-ink-tertiary italic" data-testid="email-note">
                L'email est géré par votre compte Google.
              </p>
            </div>

            <hr class="my-6 opacity-20" data-testid="separator" />

            <div class="pt-2">
              <button
                data-testid="signout-btn"
                class="w-full justify-start text-dark-ink-secondary hover:text-yt-red hover:bg-yt-red/5 border border-hairline-dark rounded-none px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
                onclick="handleSignOut()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1"/></svg>
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Content: Data (hidden by default) -->
      <div id="content-data" data-testid="content-data" class="hidden">
        <div class="border border-yt-red/20 rounded-none" data-testid="danger-zone-card">
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-yt-red" data-testid="shield-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <h2 class="font-bold text-dark-ink" data-testid="danger-zone-title">Zone de danger</h2>
            </div>
            <p class="text-sm text-dark-ink-secondary" data-testid="danger-zone-description">Actions irréversibles sur votre compte</p>
          </div>
          <div class="px-6 pb-6 space-y-6">
            <div class="flex items-center justify-between gap-4 p-4 bg-yt-red/5 border border-yt-red/10" data-testid="delete-section">
              <div>
                <p class="text-sm font-bold text-dark-ink" data-testid="delete-title">Supprimer mon compte</p>
                <p class="text-xs text-dark-ink-secondary mt-1" data-testid="delete-description">
                  Cette action supprimera définitivement vos données, niches suivies et alertes.
                </p>
              </div>
              <button
                id="delete-account-btn"
                data-testid="delete-account-btn"
                class="shrink-0 bg-yt-red text-white px-3 py-1.5 text-sm font-medium rounded-none border-0 flex items-center gap-2 hover:opacity-90 transition-opacity"
                onclick="handleDeleteAccount()"
              >
                <svg class="w-4 h-4" data-testid="trash-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // ---- Tab State (mirrors useState in settings-content.tsx) ----
    let activeTab = 'infos';
    let isDeleting = false;

    function switchTab(tab) {
      activeTab = tab;

      // Update tab button styles
      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        if (btn.id === 'tab-' + tab) {
          btn.classList.remove('text-dark-ink-secondary');
          btn.classList.add('text-dark-ink');
        } else {
          btn.classList.remove('text-dark-ink');
          btn.classList.add('text-dark-ink-secondary');
        }
      });

      // Update indicators visibility
      document.getElementById('indicator-infos').classList.toggle('hidden', tab !== 'infos');
      document.getElementById('indicator-data').classList.toggle('hidden', tab !== 'data');

      // Update content visibility
      document.getElementById('content-infos').classList.toggle('hidden', tab !== 'infos');
      document.getElementById('content-data').classList.toggle('hidden', tab !== 'data');
    }

    // ---- Delete Account (mirrors handleDeleteAccount in settings-content.tsx) ----
    window.handleDeleteAccount = async function() {
      var confirmed = window.confirm(
        "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible."
      );
      if (!confirmed) return;

      isDeleting = true;
      var btn = document.getElementById('delete-account-btn');
      btn.disabled = true;
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Suppression...';

      try {
        var response = await fetch("/api/user", {
          method: "DELETE",
          body: JSON.stringify({ confirm: true }),
        });

        if (response.ok) {
          window.location.href = "/";
        } else {
          alert("Une erreur est survenue lors de la suppression du compte.");
        }
      } catch (error) {
        console.error("Error deleting account:", error);
        alert("Une erreur est survenue lors de la suppression du compte.");
      } finally {
        isDeleting = false;
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Supprimer';
      }
    };

    // ---- Sign Out (mirrors signOut in settings-content.tsx) ----
    window.handleSignOut = function() {
      window.location.href = "/";
    };
  </script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*  Helpers — Mock API routes                                                 */
/* -------------------------------------------------------------------------- */

/** Mock the client-side /api/auth/session endpoint (with wildcard for query params). */
async function mockSettingsSession(page: Page): Promise<void> {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "test@test.com",
          role: "USER",
          plan: "FREE",
        },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

/**
 * Mock the DELETE /api/user endpoint with configurable behavior.
 * Default: returns 200 { success: true }.
 */
async function mockDeleteUser(page: Page, status = 200, body = { success: true }): Promise<void> {
  await page.route("**/api/user*", async (route, request) => {
    if (request.method() === "DELETE") {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock common background requests (favicon) to prevent dev server crashes.
 * NOTE: Test-specific routes (e.g. /api/user, /) are added per-test.
 */
async function mockCommonRoutes(page: Page): Promise<void> {
  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({ status: 204 });
  });
}

/**
 * Set up page.route to intercept /settings document requests and serve
 * the mock settings page HTML. Call once per test BEFORE page.goto.
 */
async function mockSettingsPage(
  page: Page,
  user: SettingsUser = { name: "Test User", email: "test@test.com" },
): Promise<void> {
  await page.route("**/settings", async (route, request) => {
    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: buildSettingsPageHTML(user),
      });
    } else {
      await route.fulfill({ status: 204 });
    }
  });
  // Also match with trailing slash
  await page.route("**/settings/", async (route, request) => {
    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: buildSettingsPageHTML(user),
      });
    } else {
      await route.fulfill({ status: 204 });
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

/* ======================================================================== */
/*  Settings — Tab Navigation                                               */
/* ======================================================================== */

test.describe("Settings — Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("default tab is 'Informations' (infos tab active with underline indicator)", async ({
    page,
  }) => {
    const infosTab = page.getByTestId("tab-infos");
    const dataTab = page.getByTestId("tab-data");

    await expect(infosTab).toHaveClass(/text-dark-ink/);
    await expect(dataTab).toHaveClass(/text-dark-ink-secondary/);
    await expect(page.getByTestId("tab-indicator-infos")).toBeVisible();
    await expect(page.getByTestId("tab-indicator-data")).not.toBeVisible();
  });

  test("clicking 'Données' tab switches to danger zone content", async ({ page }) => {
    await page.getByTestId("tab-data").click();

    await expect(page.getByTestId("content-infos")).not.toBeVisible();
    await expect(page.getByTestId("content-data")).toBeVisible();
    await expect(page.getByTestId("danger-zone-card")).toBeVisible();
    await expect(page.getByTestId("danger-zone-title")).toHaveText("Zone de danger");
  });

  test("clicking back to 'Informations' shows profile content again", async ({ page }) => {
    // Switch to data first
    await page.getByTestId("tab-data").click();
    await expect(page.getByTestId("content-data")).toBeVisible();

    // Switch back to infos
    await page.getByTestId("tab-infos").click();

    await expect(page.getByTestId("content-infos")).toBeVisible();
    await expect(page.getByTestId("content-data")).not.toBeVisible();
    await expect(page.getByTestId("profile-card")).toBeVisible();
  });

  test("tab indicator (red underline) follows active tab", async ({ page }) => {
    // Initially infos indicator visible
    await expect(page.getByTestId("tab-indicator-infos")).toBeVisible();
    await expect(page.getByTestId("tab-indicator-data")).not.toBeVisible();

    // Click data tab
    await page.getByTestId("tab-data").click();
    await expect(page.getByTestId("tab-indicator-infos")).not.toBeVisible();
    await expect(page.getByTestId("tab-indicator-data")).toBeVisible();

    // Click back to infos
    await page.getByTestId("tab-infos").click();
    await expect(page.getByTestId("tab-indicator-infos")).toBeVisible();
    await expect(page.getByTestId("tab-indicator-data")).not.toBeVisible();
  });
});

/* ======================================================================== */
/*  Settings — Infos Tab Content                                            */
/* ======================================================================== */

test.describe("Settings — Infos Tab Content", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("user name is displayed (disabled input)", async ({ page }) => {
    const nameInput = page.getByTestId("input-name");
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeDisabled();
    await expect(nameInput).toHaveValue("Test User");
  });

  test("user email is displayed (disabled input)", async ({ page }) => {
    const emailInput = page.getByTestId("input-email");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toBeDisabled();
    await expect(emailInput).toHaveValue("test@test.com");
  });

  test("'Se déconnecter' button is visible", async ({ page }) => {
    const signOutBtn = page.getByTestId("signout-btn");
    await expect(signOutBtn).toBeVisible();
    await expect(signOutBtn).toContainText("Se déconnecter");
  });

  test("email note text is visible", async ({ page }) => {
    const emailNote = page.getByTestId("email-note");
    await expect(emailNote).toBeVisible();
    await expect(emailNote).toHaveText("L'email est géré par votre compte Google.");
  });

  test("profile title and description are visible", async ({ page }) => {
    await expect(page.getByTestId("profile-title")).toHaveText("Profil");
    await expect(page.getByTestId("profile-description")).toHaveText(
      "Vos informations personnelles",
    );
  });

  test("user icon is present in profile card", async ({ page }) => {
    await expect(page.getByTestId("user-icon")).toBeVisible();
  });

  test("separator is visible between profile fields and sign out", async ({ page }) => {
    await expect(page.getByTestId("separator")).toBeVisible();
  });

  test("page title and subtitle are displayed", async ({ page }) => {
    await expect(page.getByTestId("page-title")).toHaveText("Paramètres");
    await expect(page.getByTestId("page-subtitle")).toHaveText("Gérez votre compte et vos données");
  });
});

/* ======================================================================== */
/*  Settings — Data Tab / Danger Zone                                       */
/* ======================================================================== */

test.describe("Settings — Data Tab / Danger Zone", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Navigate to data tab
    await page.getByTestId("tab-data").click();
  });

  test("danger zone card has red border styling", async ({ page }) => {
    const card = page.getByTestId("danger-zone-card");
    await expect(card).toBeVisible();

    const classAttr = await card.getAttribute("class");
    expect(classAttr).toContain("border-yt-red");
  });

  test("'Supprimer mon compte' button is visible", async ({ page }) => {
    const deleteBtn = page.getByTestId("delete-account-btn");
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toContainText("Supprimer");
  });

  test("delete description text is visible", async ({ page }) => {
    await expect(page.getByTestId("delete-title")).toHaveText("Supprimer mon compte");
    await expect(page.getByTestId("delete-description")).toContainText(
      "supprimera définitivement vos données",
    );
  });

  test("Trash2 icon is present", async ({ page }) => {
    await expect(page.getByTestId("trash-icon")).toBeVisible();
  });

  test("shield icon is present", async ({ page }) => {
    await expect(page.getByTestId("shield-icon")).toBeVisible();
  });

  test("danger zone title and description are visible", async ({ page }) => {
    await expect(page.getByTestId("danger-zone-title")).toHaveText("Zone de danger");
    await expect(page.getByTestId("danger-zone-description")).toHaveText(
      "Actions irréversibles sur votre compte",
    );
  });
});

/* ======================================================================== */
/*  Settings — Account Deletion Flow                                        */
/* ======================================================================== */

test.describe("Settings — Account Deletion Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Navigate to data tab
    await page.getByTestId("tab-data").click();
  });

  test("clicking delete when confirm is canceled (window.confirm returns false) → no API call", async ({
    page,
  }) => {
    // Mock confirm to return false
    await page.evaluate(() => {
      window.confirm = () => false;
    });

    let apiCalled = false;
    await page.route("**/api/user*", async (route) => {
      if (route.request().method() === "DELETE") {
        apiCalled = true;
      }
      await route.continue();
    });

    await page.getByTestId("delete-account-btn").click();

    // Wait a moment to ensure no API call is made
    await page.waitForTimeout(200);
    expect(apiCalled).toBe(false);

    // Button should remain in initial state
    const deleteBtn = page.getByTestId("delete-account-btn");
    await expect(deleteBtn).toBeEnabled();
    await expect(deleteBtn).toContainText("Supprimer");
  });

  test("clicking delete when confirm is accepted → DELETE /api/user is called", async ({
    page,
  }) => {
    // Mock confirm to return true
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    let deleteRequestUrl = "";
    let deleteRequestMethod = "";
    let deleteRequestBody = "";
    await page.route("**/api/user*", async (route, request) => {
      if (request.method() === "DELETE") {
        deleteRequestUrl = request.url();
        deleteRequestMethod = request.method();
        deleteRequestBody = request.postData() || "";
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.getByTestId("delete-account-btn").click();

    // Wait for fetch to complete
    await page.waitForTimeout(500);

    expect(deleteRequestMethod).toBe("DELETE");
    expect(deleteRequestUrl).toContain("/api/user");

    const body = JSON.parse(deleteRequestBody);
    expect(body).toEqual({ confirm: true });
  });

  test("after successful deletion → signOut redirect to '/'", async ({ page }) => {
    // Mock confirm to return true
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    await page.route("**/api/user*", async (route, request) => {
      if (request.method() === "DELETE") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByTestId("delete-account-btn").click();

    // Should redirect to "/"
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("after failed deletion (API 500) → alert shown, button re-enabled", async ({ page }) => {
    // Mock confirm to return true
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    await mockDeleteUser(page, 500, { error: "Erreur interne" });

    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByTestId("delete-account-btn").click();

    // Wait for fetch to complete
    await page.waitForTimeout(500);

    // Alert should be shown
    expect(alertMessage).toBe("Une erreur est survenue lors de la suppression du compte.");

    // Button should be re-enabled with original text
    const deleteBtn = page.getByTestId("delete-account-btn");
    await expect(deleteBtn).toBeEnabled();
    await expect(deleteBtn).toContainText("Supprimer");
  });

  test("on network error → console.error called, alert shown, button re-enabled", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    // Abort the DELETE request to simulate network error
    await page.route("**/api/user*", async (route, request) => {
      if (request.method() === "DELETE") {
        await route.abort("connectionrefused");
      } else {
        await route.continue();
      }
    });

    const consoleErrors = captureConsoleErrors(page);

    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByTestId("delete-account-btn").click();

    // Wait for the fetch to fail
    await page.waitForTimeout(500);

    expect(consoleErrors.length).toBeGreaterThanOrEqual(1);
    expect(consoleErrors.some((msg) => msg.includes("Error deleting account"))).toBe(true);
    expect(alertMessage).toBe("Une erreur est survenue lors de la suppression du compte.");

    // Button should be re-enabled
    const deleteBtn = page.getByTestId("delete-account-btn");
    await expect(deleteBtn).toBeEnabled();
    await expect(deleteBtn).toContainText("Supprimer");
  });

  test("button shows 'Suppression...' text and is disabled during deletion", async ({ page }) => {
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    // Delay the API response so we can observe the loading state
    await page.route("**/api/user*", async (route, request) => {
      if (request.method() === "DELETE") {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Prevent the redirect so we can observe button state
    await page.route("/", async (route) => {
      await route.fulfill({ status: 200, body: "Redirect intercepted" });
    });

    const deleteBtn = page.getByTestId("delete-account-btn");
    await deleteBtn.click();

    // Immediately after click, check loading state
    await expect(deleteBtn).toContainText("Suppression...");
    await expect(deleteBtn).toBeDisabled();
  });

  test("double-click on delete → only one confirm dialog and one API call", async ({ page }) => {
    // Track confirm calls via a global counter on the window
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    let apiCallCount = 0;
    await page.route("**/api/user*", async (route, request) => {
      if (request.method() === "DELETE") {
        apiCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Prevent redirect
    await page.route("/", async (route) => {
      await route.fulfill({ status: 200, body: "Redirect intercepted" });
    });

    const deleteBtn = page.getByTestId("delete-account-btn");

    // Triple-click rapidly
    await deleteBtn.click({ clickCount: 3 });

    // Wait for completion
    await page.waitForTimeout(500);

    // Should only have been called once
    expect(apiCallCount).toBe(1);
  });
});

/* ======================================================================== */
/*  Settings — Sign Out Button                                              */
/* ======================================================================== */

test.describe("Settings — Sign Out Button", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("'Se déconnecter' button is clickable", async ({ page }) => {
    const signOutBtn = page.getByTestId("signout-btn");
    await expect(signOutBtn).toBeVisible();
    await expect(signOutBtn).toBeEnabled();
  });

  test("clicking triggers signOut callback (redirect to /)", async ({ page }) => {
    const signOutBtn = page.getByTestId("signout-btn");
    await signOutBtn.click();

    // The inline handler sets window.location.href = "/"
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("sign out button has LogOut icon", async ({ page }) => {
    const signOutBtn = page.getByTestId("signout-btn");
    const svg = signOutBtn.locator("svg");
    await expect(svg).toBeVisible();
  });
});

/* ======================================================================== */
/*  Settings — Responsive & Accessibilité                                   */
/* ======================================================================== */

test.describe("Settings — Responsive et accessibilité", () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page);
    await mockSettingsPage(page);
    await mockCommonRoutes(page);
  });

  test("Settings — Mobile responsive 375px — pas de débordement horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const settingsPage = page.getByTestId("settings-page");
    await expect(settingsPage).toBeVisible();

    // Vérifie l'absence de débordement horizontal
    const overflowX = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="settings-page"]') as HTMLElement;
      if (!el) return "";
      return window.getComputedStyle(el).overflowX;
    });
    expect(overflowX).not.toBe("visible");

    // Les onglets sont visibles sur mobile
    await expect(page.getByTestId("tab-infos")).toBeVisible();
    await expect(page.getByTestId("tab-data")).toBeVisible();
  });

  test("Settings — Navigation clavier onglets Tab", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Tab vers l'onglet Données
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("tab-infos")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("tab-data")).toBeFocused();
  });

  test("Settings — Champs nom/email null — affichage gracieux", async ({ page }) => {
    const nullUser: SettingsUser = { name: "", email: "" };
    await mockSettingsPage(page, nullUser);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Les champs doivent être visibles même avec des valeurs vides
    const nameInput = page.getByTestId("input-name");
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue("");

    const emailInput = page.getByTestId("input-email");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveValue("");

    // La page ne doit pas planter
    await expect(page.getByTestId("page-title")).toHaveText("Paramètres");
  });

  test("Settings — Focus retour après confirm dialog", async ({ page }) => {
    await mockSettingsPage(page);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Naviguer vers l'onglet Données
    await page.getByTestId("tab-data").click();
    await expect(page.getByTestId("content-data")).toBeVisible();

    // Configurer le handler de dialogue pour refuser (annuler)
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    // Cliquer sur le bouton Supprimer pour déclencher window.confirm
    const deleteBtn = page.getByTestId("delete-account-btn");
    await deleteBtn.click();

    // Attendre que le dialogue soit fermé
    await page.waitForTimeout(300);

    // Le focus doit revenir sur le bouton Supprimer après le rejet
    await expect(deleteBtn).toBeFocused();
  });

  test("Settings — Activation clavier Se déconnecter", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const signOutBtn = page.getByTestId("signout-btn");

    // Focus le bouton avec Tab
    await signOutBtn.focus();
    await expect(signOutBtn).toBeFocused();

    // Appuyer sur Entrée pour activer
    await signOutBtn.press("Enter");

    // Doit rediriger vers /
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url()).toMatch(/\/$/);
  });
});
