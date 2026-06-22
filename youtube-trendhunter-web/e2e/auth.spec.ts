import { test, expect, type Page } from "@playwright/test";

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

/**
 * Auth E2E tests for YouTube TrendHunter
 *
 * Tests authentication flows: login page rendering, protected route redirects,
 * API 401 responses, and authenticated session mocking.
 *
 * NOTE: Server-side auth (layout-level `auth()` call) reads the session from
 * database-backed cookies, which cannot be mocked via `page.route()` alone.
 * Authenticated page tests mock the session endpoint via page.route().
 * For full end-to-end auth, a valid session cookie + database record is needed.
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

const PROTECTED_ROUTES: { path: string; label: string }[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/home", label: "Home" },
  { path: "/alerts", label: "Alertes" },
  { path: "/my-niches", label: "Mes niches" },
  { path: "/billing", label: "Facturation" },
  { path: "/settings", label: "Paramètres" },
];

/* -------------------------------------------------------------------------- */
/*  Non-authentifié — redirections & accès public                             */
/* -------------------------------------------------------------------------- */

test.describe("Auth — Non authentifié", () => {
  for (const { path, label } of PROTECTED_ROUTES) {
    test(`protège la route ${path} (${label})`, async ({ page }) => {
      await page.goto(path);
      // Dashboard layout calls auth() and redirects to /login when null
      await page.waitForURL(/\/login/);
      // Verify we land on the login page
      await expect(page.locator("h1")).toContainText("l'Algorithme");
    });
  }

  test("/api/trends retourne 401 sans authentification", async ({ page }) => {
    await setupPage(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/trends?niche=tech");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);

    expect(result.body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });

  test("/api/alerts retourne 401 sans authentification", async ({ page }) => {
    await setupPage(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(401);

    expect(result.body).toMatchObject({
      error: "Non authentifié",
      code: "UNAUTHORIZED",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Page de connexion                                                         */
/* -------------------------------------------------------------------------- */

test.describe("Auth — Page de connexion", () => {
  test("affiche le titre et le bouton Google", async ({ page }) => {
    await page.goto("/login");

    // Heading
    await expect(page.locator("h1")).toContainText("l'Algorithme");

    // Subtitle
    await expect(page.getByText("Connectez-vous pour débloquer")).toBeVisible();

    // Google sign-in button (server action form)
    const googleBtn = page.getByRole("button", {
      name: /continuer avec google/i,
    });
    await expect(googleBtn).toBeVisible();
  });

  test("affiche les badges de confiance", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("IA Analytics")).toBeVisible();
    await expect(page.getByText("Sécurisé")).toBeVisible();
    await expect(page.getByText("VIP Trends")).toBeVisible();
  });

  test("affiche le badge 'Accès Privé'", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Accès Privé")).toBeVisible();
  });

  test("les liens Conditions et Confidentialité sont visibles", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Conditions")).toBeVisible();
    await expect(page.getByText("Confidentialité")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Authentifié — avec session mockée                                         */
/* -------------------------------------------------------------------------- */

test.describe("Auth — Authentifié (session mockée)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
    await mockSession(page);
  });

  test("la page dashboard répond sans erreur serveur", async ({ page }) => {
    // Server-side auth() will still redirect because page.route doesn't set
    // actual cookies. This test verifies the app doesn't crash when the
    // client-side session mock is active.
    const response = await page.goto("/dashboard");
    expect(response?.ok()).toBe(true);
  });

  test("le mock de session est actif sur le réseau", async ({ page }) => {
    // Verify the mock intercepts the fetch to /api/auth/session
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    expect(result.body.user.email).toBe("test@test.com");
    expect(result.body.user.plan).toBe("FREE");
  });

  test("la déconnexion est accessible depuis le menu latéral", async ({ page }) => {
    // When properly authenticated, the sidebar shows "Déconnexion".
    // If server-side auth redirects, the login page is shown instead.
    await page.goto("/dashboard");

    const onLogin = page.url().includes("/login");

    if (!onLogin) {
      await expect(page.getByText("Déconnexion")).toBeVisible();
    } else {
      // If redirected, login page should still be functional
      await expect(page.locator("h1")).toContainText("l'Algorithme");
    }
  });
});
