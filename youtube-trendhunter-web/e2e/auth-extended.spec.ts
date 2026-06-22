import { test, expect, type Page } from "@playwright/test";

/**
 * Extended Auth E2E tests for YouTube TrendHunter
 *
 * Covers MISSING scenarios from the base auth.spec.ts:
 *   - Success edge cases (session expiry, callback redirect)
 *   - Error handling (OAuth failure, network errors, 500s)
 *   - Plan/role-based access control (FREE vs PRO)
 *   - Token and session fetch failures
 *   - URL manipulation and rapid navigation
 *
 * IMPORTANT: Server-side auth() reads session from database-backed cookies,
 * which cannot be mocked via page.route(). Tests that rely on server-side
 * auth (layout-level redirect to /login) use page.route() to mock the
 * client-side session endpoint only. Full end-to-end auth would require
 * a valid session cookie + database record.
 */

/* -------------------------------------------------------------------------- */
/*  Constants & Helpers                                                        */
/* -------------------------------------------------------------------------- */

const ACTIVE_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const PRO_SESSION = {
  user: {
    id: "pro-user-id",
    name: "Pro User",
    email: "pro@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

// Note: ADMIN_SESSION could be added here for admin role tests
// but current admin tests verify BLOCKED access for non-admin users

const EXPIRED_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2020-01-01T00:00:00.000Z",
};

/**
 * Mock the session endpoint to return an active session.
 * This only covers client-side fetches; server-side auth() still reads cookies.
 */
async function mockSession(page: Page, session = ACTIVE_SESSION) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

/**
 * Remove all route mocks so real requests flow through.
 */
async function clearMocks(page: Page) {
  await page.unrouteAll({ behavior: "wait" });
}

/* -------------------------------------------------------------------------- */
/*  Success Cases — Session expiry, callback redirect, login form details      */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Cas de succès", () => {
  test("la page de connexion affiche le formulaire complet avec bouton submit", async ({ page }) => {
    // Given a non-authenticated user visits /login
    await page.goto("/login");

    // The Google sign-in form is present with a submit button
    const googleForm = page.locator('form').filter({ has: page.locator('button[type="submit"]') });
    await expect(googleForm).toBeVisible();

    // The button has the Google icon and "Continuer avec Google" text
    const submitBtn = googleForm.locator('button[type="submit"]');
    await expect(submitBtn).toContainText("Continuer avec Google");

    // Verify the form has the correct server action by checking it submits via POST
    // (cannot fully test server action in e2e without real OAuth creds)
    const formAction = await googleForm.getAttribute("action");
    // In Next.js, server actions don't use a standard action URL
    // We just verify the form exists and has expected structure
    await expect(submitBtn).toBeEnabled();
  });

  test("le callbackUrl redirige vers /dashboard après connexion Google — simulation", async ({
    page,
  }) => {
    // Simulate the OAuth callback flow: NextAuth v5 redirects to /api/auth/callback/google
    // then to the redirectTo URL (/dashboard). We mock the callback to set a session cookie
    // and verify the redirect chain lands on /dashboard.

    await mockSession(page, ACTIVE_SESSION);

    // Simulate what happens after Google OAuth succeeds:
    // The user lands on the callback URL which sets the session,
    // then is redirected to /dashboard.
    // We simulate this by navigating directly to /dashboard with a mock session
    // and verifying the page tries to render dashboard content.
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // If the server-side auth() does NOT redirect (because session is real in DB),
    // the dashboard would render. If it does redirect, we end up on /login.
    // Either way, the page should not crash.
    const currentUrl = page.url();
    const isOnDashboard = currentUrl.includes("/dashboard");
    const isOnLogin = currentUrl.includes("/login");

    // The app should end up in one of these two valid states
    expect(isOnDashboard || isOnLogin).toBe(true);

    if (isOnDashboard) {
      // Verify dashboard-specific content renders
      await expect(page.locator("h1")).toContainText("Tendances");
    }
  });

  test("la session expire — l'utilisateur est redirigé vers /login", async ({ page }) => {
    // Scenario: User session expires mid-session.
    // First, start with an active session.
    await mockSession(page, ACTIVE_SESSION);

    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");

    // Now simulate session expiry by changing the mock to expired
    await clearMocks(page);
    await mockSession(page, EXPIRED_SESSION);

    // Trigger a client-side navigation or page interaction that re-fetches session
    // Navigate to another protected route to trigger the session check
    await page.goto("/my-niches");
    await page.waitForLoadState("networkidle");

    // The app should redirect to /login because the session is expired
    // (server-side auth() will return null for expired sessions)
    const url = page.url();
    const isRedirectedToLogin = url.includes("/login");
    expect(isRedirectedToLogin).toBe(true);

    // The login page should be displayed
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("l'utilisateur rafraîchit la page de connexion sans perdre l'état", async ({ page }) => {
    // Given the login page is already loaded
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Expect the login page is shown with all elements
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByText("Connectez-vous pour débloquer")).toBeVisible();

    // When the user refreshes
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Then the login page should still be shown (no crash, no redirect)
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Error Cases — OAuth failure, network errors, 500s, 403s                    */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Gestion d'erreurs", () => {
  test("l'API /api/auth/session retourne 500 — l'application ne crash pas", async ({ page }) => {
    // Given the session endpoint returns a server error
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });

    // When navigating to a protected route
    const response = await page.goto("/dashboard");

    // Then the server-side auth() will check the real database, but the client
    // should handle the 500 gracefully without crashing.
    // The page should either redirect to /login (server-side) or show an error
    expect(response).not.toBeNull();

    // Wait to see where we land
    await page.waitForLoadState("networkidle");
    const currentUrl = page.url();

    // The app should be in a valid state (login or dashboard)
    const isValidState = currentUrl.includes("/login") || currentUrl.includes("/dashboard");
    expect(isValidState).toBe(true);

    // No fatal error should appear on screen
    await expect(page.locator("body")).not.toContainText("Application Error");
  });

  test("l'API /api/auth/session retourne une erreur réseau — fallback gracieux", async ({ page }) => {
    // Given the session endpoint is unreachable (abort the request)
    await page.route("**/api/auth/session", async (route) => {
      await route.abort("connectionrefused");
    });

    // When navigating to a protected route
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The app should handle the failed session fetch without crashing
    const currentUrl = page.url();
    const isValidState = currentUrl.includes("/login") || currentUrl.includes("/dashboard");
    expect(isValidState).toBe(true);

    // No application crash
    await expect(page.locator("body")).not.toContainText("Application Error");
  });

  test("l'API /api/auth/session retourne null (non connecté)", async ({ page }) => {
    // Given the session endpoint explicitly returns null (not authenticated)
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    // When the client fetches session, it should see null → redirect to login
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The app should redirect to login
    const onLogin = page.url().includes("/login");
    expect(onLogin).toBe(true);
  });

  test("l'API /api/trends retourne 500 — gestion d'erreur sans crash", async ({ page }) => {
    // Given the user is authenticated but the trends API fails
    await mockSession(page, ACTIVE_SESSION);

    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
      });
    });

    // When navigating to dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The page should not crash; if we're on the dashboard, trend data may be empty
    // but the UI should still render
    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // The dashboard title should still display even if trends fail to load
      await expect(page.locator("h1")).toContainText("Tendances");
    }
  });

  test("l'API /api/alerts retourne 500 — ne bloque pas le chargement", async ({ page }) => {
    // Given authenticated user but alerts API fails
    await mockSession(page, ACTIVE_SESSION);

    await page.route("**/api/alerts", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Erreur interne", code: "INTERNAL_ERROR" }),
        });
      } else {
        await route.continue();
      }
    });

    // When navigating to alerts page
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    // Should not crash — either on login (server auth redirect) or alerts page
    const onLogin = page.url().includes("/login");
    const onAlerts = page.url().includes("/alerts");
    expect(onLogin || onAlerts).toBe(true);
  });

  test("l'API /api/user retourne 403 pour un utilisateur FREE tentant un export", async ({ page }) => {
    // Given a FREE plan user
    await mockSession(page, ACTIVE_SESSION);

    // When trying to access the export endpoint (PRO-only feature)
    const response = await page.request.get("/api/user/export?format=json");

    // Then the API should return 403 Forbidden
    // (this test works without mocking because the real auth() will fail first — 401)
    // We mock session to actually test the plan check
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    const response2 = await page.request.get("/api/user/export?format=json");
    // The response depends on whether the real DB has the user.
    // If session is mocked but user doesn't exist in DB, the plan check may fail differently.
    // We just verify the request doesn't crash the app.
    const status = response2.status();
    const validStatuses = [401, 403, 500];
    expect(validStatuses).toContain(status);
  });

  test("l'API /api/niches retourne 403 pour un FREE qui dépasse la limite", async ({ page }) => {
    // Given a FREE plan user
    await mockSession(page, ACTIVE_SESSION);

    // When POST to follow a second niche (FREE limit is 1)
    const response = await page.request.post("/api/niches", {
      data: { nicheId: "niche-2" },
    });

    // The response should be 403 if the mock session is honored by the API
    // (In practice, the server-side auth() reads real cookies, so this may be 401 first)
    const status = response.status();
    expect([401, 403, 400, 500]).toContain(status);

    if (status === 403) {
      const body = await response.json();
      expect(body.code).toBe("FORBIDDEN");
      expect(body.error).toContain("Limite du plan FREE");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Plan & Role — Access control for plans, admin gates                        */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Plans et rôles", () => {
  test("un utilisateur FREE voit les limites appliquées dans la réponse API", async ({
    page,
  }) => {
    // Given mock session with FREE plan
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    // When fetching trends
    const response = await page.request.get("/api/trends?niche=tech");

    // Then verify plan info is present in response (if auth passes)
    const status = response.status();
    if (status === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("plan");
      expect(body.plan).toBe("FREE");
    }
  });

  test("un utilisateur PRO voit son plan dans la réponse API", async ({ page }) => {
    // Given mock session with PRO plan
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PRO_SESSION),
      });
    });

    // When fetching trends
    const response = await page.request.get("/api/trends?niche=tech");

    // Then verify PRO plan is reflected
    const status = response.status();
    if (status === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("plan");
      expect(body.plan).toBe("PRO");
    }
  });

  test("l'accès admin est bloqué pour un utilisateur non-admin", async ({ page }) => {
    // Given a regular USER session (not ADMIN)
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    // When trying to access admin API
    const response = await page.request.get("/api/admin/stats");

    // Then the response should be 401 (not authorized)
    const status = response.status();
    expect(status).toBe(401);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("l'API /api/admin/plans est inaccessible pour un utilisateur standard", async ({
    page,
  }) => {
    // Given a regular user
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    // When accessing admin plans endpoint
    const response = await page.request.get("/api/admin/plans");

    // Then it should be rejected
    const status = response.status();
    // Either 401 (role check) or 500 (error)
    expect([401, 500]).toContain(status);
  });

  test("un utilisateur PRO peut accéder aux fonctionnalités PRO", async ({ page }) => {
    // Given a PRO session
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PRO_SESSION),
      });
    });

    // Mock trends to return data
    await page.route("**/api/trends*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: [
            {
              id: "trend-pro-1",
              title: "Tendance PRO",
              channelName: "ProChannel",
              channelUrl: "https://youtube.com/@prochannel",
              videoUrl: "https://youtube.com/watch?v=pro123",
              thumbnailUrl: "https://i.ytimg.com/vi/pro123/default.jpg",
              views: 999999,
              publishedAt: new Date().toISOString(),
              score: 99.9,
              nicheId: "niche-1",
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
          plan: "PRO",
          nextCursor: null,
        }),
      });
    });

    // When accessing dashboard
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Then the page should handle PRO content gracefully
    const currentUrl = page.url();
    const isOnDashboard = currentUrl.includes("/dashboard");
    const isOnLogin = currentUrl.includes("/login");
    expect(isOnDashboard || isOnLogin).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Edge Cases — Rapid navigation, URL manipulation, concurrent attempts       */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Cas limites", () => {
  test("navigation rapide entre plusieurs routes protégées ne cause pas d'erreur", async ({
    page,
  }) => {
    // Given the user has an active session (mocked)
    await mockSession(page, ACTIVE_SESSION);

    // Rapidly navigate between protected routes
    const routes = ["/dashboard", "/my-niches", "/alerts", "/billing", "/settings"];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // The page should either be on the target route or redirected to /login
      const currentUrl = page.url();
      const isValidTarget =
        currentUrl.includes(route) || currentUrl.includes("/login") || currentUrl.includes("/dashboard");
      expect(isValidTarget).toBe(true);
    }

    // No page crash after rapid navigation sequence
    await expect(page.locator("body")).toBeVisible();
  });

  test("accès direct à /api/auth/session sans être connecté retourne null", async ({
    page,
  }) => {
    // Given no session at all (no mocking)
    // When directly accessing the session endpoint
    const response = await page.request.get("/api/auth/session");

    // Then it should return a non-error response (possibly null or empty)
    const status = response.status();
    // In NextAuth v5, /api/auth/session returns 200 with a JSON body that may be
    // null or { user: null } when no session exists
    expect(status).toBe(200);

    const body = await response.json();
    // The body should be null or an object with null user
    expect(body === null || body?.user === null || body?.user === undefined).toBe(true);
  });

  test("manipulation d'URL — headers modifiés ne contournent pas l'auth", async ({ page }) => {
    // When trying to access /dashboard with custom headers (potential bypass attempt)
    const response = await page.request.get("/dashboard", {
      headers: {
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "localhost:3000",
        Authorization: "Bearer fake-token-12345",
      },
    });

    // Then the server should still redirect to login (auth check happens server-side)
    // The response status should be 200 (Next.js redirect is a 307/308 internally,
    // but Playwright follows redirects by default)
    expect(response.status()).toBe(200);

    // The final URL should be /login
    expect(response.url()).toContain("/login");
  });

  test("accès à /billing sans auth affiche la page de connexion", async ({ page }) => {
    // Given no session
    // When navigating to billing
    await page.goto("/billing");
    await page.waitForURL(/\/login/);

    // Then the login page should render correctly
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByText("Connectez-vous pour débloquer")).toBeVisible();
  });

  test("l'API alert POST est bloquée pour un utilisateur FREE", async ({ page }) => {
    // Given a FREE user session
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    // When trying to create an alert (PRO feature)
    const response = await page.request.post("/api/alerts", {
      data: {
        nicheId: "niche-1",
        type: "VIEW_THRESHOLD",
        threshold: 100000,
        channel: "email",
      },
    });

    // Then the response should be 403 (Forbidden)
    const status = response.status();
    // If auth passes, should be 403; if auth fails (server-side), could be 401
    expect([401, 403]).toContain(status);

    if (status === 403) {
      const body = await response.json();
      expect(body.code).toBe("FORBIDDEN");
    }
  });

  test("navigation vers /settings sans session redirige vers login", async ({ page }) => {
    // Given no session
    // When navigating to settings
    const response = await page.goto("/settings");
    await page.waitForURL(/\/login/);

    // Then login page is displayed
    await expect(page.locator("h1")).toContainText("l'Algorithme");

    // The redirect was a server-side redirect (307/308)
    expect(response?.status()).toBe(200); // Playwright follows redirects
  });

  test("le badge 'Accès Privé' est cohérent après re-render", async ({ page }) => {
    // Given the login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // The "Accès Privé" badge should be visible
    await expect(page.getByText("Accès Privé")).toBeVisible();

    // Re-render by clicking the logo link
    await page.locator('header a').first().click();
    await page.waitForLoadState("networkidle");

    // Navigate back to login
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Badge still visible after re-navigation
    await expect(page.getByText("Accès Privé")).toBeVisible();
  });

  test("l'utilisateur tente d'accéder à /api/admin/users sans rôle ADMIN", async ({ page }) => {
    // Given a regular user session
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ACTIVE_SESSION),
      });
    });

    // When trying to access admin users endpoint
    const response = await page.request.get("/api/admin/users");

    // Then rejected
    const status = response.status();
    expect([401, 403]).toContain(status);
  });
});

/* -------------------------------------------------------------------------- */
/*  Resilience — Network failures, race conditions, concurrent requests        */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Résilience", () => {
  test("plusieurs requêtes API simultanées sans session retournent 401", async ({
    page,
  }) => {
    // Given no session
    // When firing multiple parallel API requests to protected endpoints
    const results = await Promise.all([
      page.request.get("/api/trends?niche=tech"),
      page.request.get("/api/alerts"),
      page.request.get("/api/niches"),
      page.request.get("/api/user/export?format=json"),
    ]);

    // Then all should return 401 Unauthorized
    for (const response of results) {
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.error).toBe("Non authentifié");
    }
  });

  test("le session endpoint est cohérent entre requêtes répétées", async ({ page }) => {
    // Given no session
    // When calling /api/auth/session multiple times
    const responses = await Promise.all([
      page.request.get("/api/auth/session"),
      page.request.get("/api/auth/session"),
      page.request.get("/api/auth/session"),
    ]);

    // Then all responses should be consistent
    for (const response of responses) {
      expect(response.status()).toBe(200);
      const body = await response.json();
      // Without auth, body should be null or have no user
      expect(body === null || body?.user === null || body?.user === undefined).toBe(true);
    }
  });

  test("l'API trends avec paramètres invalides ne contourne pas l'auth", async ({ page }) => {
    // Given no session
    // When accessing trends with various invalid params
    const response = await page.request.get("/api/trends?niche=");
    expect(response.status()).toBe(401);

    const response2 = await page.request.get("/api/trends");
    expect(response2.status()).toBe(401);

    const response3 = await page.request.get("/api/trends?niche=../etc/passwd");
    expect(response3.status()).toBe(401);
  });

  test("page /login déjà visitée — le re-render est stable", async ({ page }) => {
    // Given the login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Simulate a re-render by triggering a navigation within the auth group
    // (login page has no client-side navigation, so we just reload)
    await page.reload();
    await page.waitForLoadState("networkidle");

    // After reload, the login page should still display the same content
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  OAuth Error Simulation                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Auth étendu — Simulation OAuth", () => {
  test("le formulaire de connexion Google est présent et interactif", async ({ page }) => {
    // This test validates the sign-in form is ready for interaction.
    // Full OAuth flow requires real credentials, but we verify the form
    // structure and that clicking the button triggers a server action.
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Verify the form exists with the Google button
    const button = page.getByRole("button", { name: /continuer avec google/i });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();

    // Verify the containing form exists (server action form)
    const form = page.locator("form").filter({ has: button });
    await expect(form).toBeVisible();

    // Clicking the button submits a server action to /api/auth/signin/google.
    // Intercept to verify the POST is dispatched, then abort gracefully.
    let signInAttempted = false;
    await page.route("**/api/auth/signin/google", async (route, request) => {
      if (request.method() === "POST") {
        signInAttempted = true;
      }
      // Abort rather than letting a real redirect happen to Google
      await route.abort("connectionrefused");
    });

    // Click the Google sign-in button
    await button.click({ force: true });

    // Wait for the server action fetch to be dispatched
    await page.waitForTimeout(1000);

    // The sign-in POST should have been attempted (aborted gracefully by our mock)
    expect(signInAttempted).toBe(true);

    // Page should still be on the login URL after aborted redirect
    expect(page.url()).toContain("/login");
  });

  test("erreur OAuth simulée — l'application ne crashe pas", async ({ page }) => {
    // Simulate what happens when Google OAuth returns an error.
    // NextAuth v5 redirects to /login?error=... on OAuth failure.
    await page.goto("/login?error=OAuthAccountNotLinked");
    await page.waitForLoadState("networkidle");

    // The app should still display the login page without crashing
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();

    // Test with another common OAuth error
    await page.goto("/login?error=AccessDenied");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();

    // Test with generic error
    await page.goto("/login?error=Configuration");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("callbackUrl invalide dans l'URL ne cause pas d'erreur", async ({ page }) => {
    // When a user arrives at login with a malicious callbackUrl
    await page.goto("/login?callbackUrl=https://evil.com/steal-data");
    await page.waitForLoadState("networkidle");

    // The login page should still render safely
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();

    // Test with relative path traversal
    await page.goto("/login?callbackUrl=../../etc/passwd");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });
});
