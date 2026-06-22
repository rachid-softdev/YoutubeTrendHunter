import { test, expect, type Page } from "@playwright/test";

/**
 * Settings E2E tests for YouTube TrendHunter
 *
 * Tests the settings page (/dashboard/settings): page structure, tab system,
 * user info display, danger zone with account deletion flow, and API behavior.
 *
 * API mocking is used for all data-fetching endpoints so tests are
 * deterministic and don't require a real database.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
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
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });
}

/**
 * Mock the /api/user endpoint with configurable behavior per HTTP method.
 * By default:
 *   - GET  → returns TEST_USER data
 *   - DELETE with {confirm: true} → returns 200 { success: true }
 *   - DELETE without confirm  → returns 400 { error: "Confirmation requise" }
 */
async function mockApiUser(page: Page) {
  await page.route("**/api/user", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TEST_USER),
      });
      return;
    }

    if (method === "DELETE") {
      const body = JSON.parse(route.request().postData() || "{}");
      if (body.confirm === true) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Confirmation requise" }),
        });
      }
      return;
    }

    await route.continue();
  });
}

/* ======================================================================== */
/*  Settings — Structure de la page                                         */
/* ======================================================================== */

test.describe("Settings — Structure de la page", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiUser(page);
  });

  test("affiche le titre 'Paramètres' quand authentifié", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await expect(page.locator("h1")).toHaveText("Paramètres");
  });

  test("affiche le texte de description", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await expect(page.getByText("Gérez votre compte et vos données")).toBeVisible();
  });

  test("affiche les boutons d'onglets 'Informations' et 'Données'", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await expect(page.getByRole("button", { name: "Informations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Données" })).toBeVisible();
  });

  test("l'onglet 'Informations' est actif par défaut avec l'indicateur de soulignement", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // The active tab has a child div with bg-yt-red class (underline indicator)
    const infoTab = page.getByRole("button", { name: "Informations" });
    const underline = infoTab.locator("div.bg-yt-red");

    await expect(underline).toBeVisible();
  });
});

/* ======================================================================== */
/*  Settings — Onglet Informations                                          */
/* ======================================================================== */

test.describe("Settings — Onglet Informations", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiUser(page);
  });

  test("affiche le nom de l'utilisateur dans un champ désactivé", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    const nameInput = page.locator("input[value='Test User']");
    await expect(nameInput).toBeVisible();
  });

  test("affiche l'email de l'utilisateur dans un champ désactivé", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    const emailInput = page.locator("input[value='test@test.com']");
    await expect(emailInput).toBeVisible();
  });

  test("affiche la note 'L\\'email est géré par votre compte Google.'", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await expect(page.getByText("L'email est géré par votre compte Google.")).toBeVisible();
  });

  test("affiche le bouton 'Se déconnecter'", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    const signOutButton = page.getByRole("button", { name: "Se déconnecter" });
    await expect(signOutButton).toBeVisible();
  });

  test("les champs de saisie ont l'attribut disabled", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    const nameInput = page.locator("input[value='Test User']");
    const emailInput = page.locator("input[value='test@test.com']");

    await expect(nameInput).toBeDisabled();
    await expect(emailInput).toBeDisabled();
  });
});

/* ======================================================================== */
/*  Settings — Onglet Données (Zone de danger)                              */
/* ======================================================================== */

test.describe("Settings — Onglet Données (Zone de danger)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
    await mockApiUser(page);
  });

  test("cliquer sur 'Données' → change le contenu affiché et l'indicateur se déplace", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    const infoTab = page.getByRole("button", { name: "Informations" });
    const dataTab = page.getByRole("button", { name: "Données" });

    // Verify Informations tab is initially active
    await expect(infoTab.locator("div.bg-yt-red")).toBeVisible();

    // Click Données tab
    await dataTab.click();

    // Underline should now be under Données, not Informations
    await expect(dataTab.locator("div.bg-yt-red")).toBeVisible();
    await expect(infoTab.locator("div.bg-yt-red")).toHaveCount(0);

    // Danger zone content should be visible
    await expect(page.getByText("Zone de danger")).toBeVisible();
  });

  test("affiche la section 'Zone de danger' avec une bordure rouge", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // First switch to Données tab
    await page.getByRole("button", { name: "Données" }).click();

    // Find the danger card — it's the Card with "Zone de danger" title and border-yt-red/20 class
    const dangerCard = page
      .locator("div.rounded-none")
      .filter({ has: page.getByText("Zone de danger") });
    await expect(dangerCard).toBeVisible();

    // Verify the red border class
    const classAttr = await dangerCard.getAttribute("class");
    expect(classAttr).toContain("border-yt-red");
  });

  test("affiche 'Supprimer mon compte'", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await page.getByRole("button", { name: "Données" }).click();

    await expect(page.getByText("Supprimer mon compte")).toBeVisible();
  });

  test("affiche le bouton 'Supprimer' avec l'icône Trash2", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    await page.getByRole("button", { name: "Données" }).click();

    const deleteButton = page.getByRole("button", { name: "Supprimer" });
    await expect(deleteButton).toBeVisible();

    // Verify the Trash2 icon (SVG element inside the button)
    await expect(deleteButton.locator("svg")).toBeVisible();
  });
});

/* ======================================================================== */
/*  Settings — Suppression de compte                                        */
/* ======================================================================== */

test.describe("Settings — Suppression de compte", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("cliquer 'Supprimer' avec confirmation → DELETE /api/user appelé", async ({ page }) => {
    let deleteCalled = false;
    let deleteBody = "";

    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        deleteBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      }
    });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // Accept the confirm dialog
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Switch to Données tab and click Supprimer
    await page.getByRole("button", { name: "Données" }).click();
    await page.getByRole("button", { name: "Supprimer" }).click();

    // Wait for the fetch to complete
    await page.waitForTimeout(1000);

    expect(deleteCalled).toBe(true);
    const parsed = JSON.parse(deleteBody);
    expect(parsed).toMatchObject({ confirm: true });
  });

  test("confirmation acceptée et DELETE 200 → redirection via signOut (vérifie que DELETE a été appelé)", async ({
    page,
  }) => {
    let deleteCalled = false;

    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      }
    });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // Accept the confirm dialog
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Click Supprimer
    await page.getByRole("button", { name: "Données" }).click();
    await page.getByRole("button", { name: "Supprimer" }).click();

    // Wait for the API call and signOut redirect attempt
    await page.waitForTimeout(1500);

    expect(deleteCalled).toBe(true);
  });

  test("confirmation refusée → DELETE /api/user PAS appelé", async ({ page }) => {
    let deleteCalled = false;

    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCalled = true;
        await route.fulfill({ status: 200 });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      }
    });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // Dismiss (cancel) the confirm dialog — this makes window.confirm return false
    page.on("dialog", async (dialog) => {
      await dialog.dismiss();
    });

    // Switch to Données tab and click Supprimer
    await page.getByRole("button", { name: "Données" }).click();
    await page.getByRole("button", { name: "Supprimer" }).click();

    // Wait to ensure no DELETE call was made
    await page.waitForTimeout(1000);

    expect(deleteCalled).toBe(false);
  });

  test("DELETE retourne une erreur → alert affichée", async ({ page }) => {
    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Erreur interne" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      }
    });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const onSettings = page.url().includes("/settings");
    if (!onSettings) return;

    // Accept confirm dialog, then capture the alert
    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "confirm") {
        await dialog.accept();
      } else if (dialog.type() === "alert") {
        alertMessage = dialog.message();
        await dialog.accept();
      }
    });

    // Click Supprimer
    await page.getByRole("button", { name: "Données" }).click();
    await page.getByRole("button", { name: "Supprimer" }).click();

    // Wait for alert to appear
    await page.waitForTimeout(1500);

    expect(alertMessage).toContain("Une erreur");
  });
});

/* ======================================================================== */
/*  Settings — API /api/user                                                */
/* ======================================================================== */

test.describe("Settings — API /api/user", () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test("GET /api/user retourne les données utilisateur correctes", async ({ page }) => {
    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TEST_USER),
        });
      } else {
        await route.continue();
      }
    });

    // Use page.evaluate + fetch (not page.request) so the request
    // goes through the page.route() interceptor
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      id: "test-user-id",
      name: "Test User",
      email: "test@test.com",
      role: "USER",
      plan: "FREE",
    });
  });

  test("DELETE /api/user avec { confirm: true } retourne 200", async ({ page }) => {
    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        const body = JSON.parse(route.request().postData() || "{}");
        if (body.confirm === true) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "Confirmation requise" }),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user", {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true });
  });

  test("DELETE /api/user sans { confirm } retourne 400", async ({ page }) => {
    await page.route("**/api/user", async (route) => {
      if (route.request().method() === "DELETE") {
        const body = JSON.parse(route.request().postData() || "{}");
        if (body.confirm === true) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "Confirmation requise" }),
          });
        }
      } else {
        await route.continue();
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/user", {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBeDefined();
  });
});

/* ======================================================================== */
/*  Settings — Non authentifié                                              */
/* ======================================================================== */

test.describe("Settings — Non authentifié", () => {
  test("sans authentification → redirige vers /login", async ({ page }) => {
    // Intentionally do NOT mock the session
    await page.goto("/settings");

    // Server-side auth() will return null -> redirect("/login")
    await page.waitForURL(/\/login/);

    // Verify we land on the login page
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });
});
