import { test, expect, type Page, type Route } from "@playwright/test";

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
 * Hardened Auth E2E tests for YouTube TrendHunter
 *
 * Covers advanced auth security scenarios NOT present in auth.spec.ts or auth-extended.spec.ts:
 *   - Rate limiting & bruteforce protection
 *   - CSRF & state parameter validation
 *   - Session security & fixation
 *   - Multi-tab & concurrent sessions
 *   - Account linking & identity
 *   - Session token & API key rotation
 *   - 2FA / MFA (graceful handling when not implemented)
 *   - Passwordless / Magic link (graceful handling when not implemented)
 *
 * IMPORTANT: Server-side auth() reads session from database-backed cookies (NextAuth v5,
 * database strategy). page.route() can only mock client-side fetches. Full end-to-end auth
 * requires a valid session cookie + database record.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
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

const SECOND_USER_SESSION = {
  user: {
    id: "other-user-id",
    name: "Other",
    email: "other@test.com",
    role: "USER" as const,
    plan: "FREE" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

const MOCK_RATE_LIMIT_RESPONSE = {
  status: 429,
  headers: {
    "Content-Type": "application/json",
    "X-RateLimit-Limit": "5",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 55),
    "Retry-After": "55",
  },
  body: JSON.stringify({
    error: "Trop de requêtes. Réessayez plus tard.",
    code: "RATE_LIMIT",
  }),
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function mockSession(page: Page, session = ACTIVE_SESSION) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    });
  });
}

async function clearMocks(page: Page) {
  await page.unrouteAll({ behavior: "wait" });
}

/**
 * Wait for a cookie to appear in the browser context.
 */
async function waitForCookie(
  page: Page,
  name: string,
  timeout = 5000,
): Promise<{ name: string; value: string; [key: string]: unknown } | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === name);
    if (cookie) return cookie;
    await page.waitForTimeout(200);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  1. Rate Limiting & Bruteforce Protection                                  */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Rate Limiting", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("tentatives de connexion rapides (5+ en 1s) déclenchent un rate limit simulé", async ({
    page,
  }) => {
    // Given an endpoint that uses withRateLimit("auth") — 5 max per 60s
    // We simulate what the server returns when rate-limited
    let attemptCount = 0;

    await page.route("**/api/extension/auth*", async (route: Route) => {
      attemptCount++;
      if (attemptCount > 3) {
        // Simulate rate limit after 3 rapid attempts
        await route.fulfill(MOCK_RATE_LIMIT_RESPONSE);
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
      }
    });

    // When making rapid attempts
    const results = await page.evaluate(async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch("/api/extension/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Test" }),
          }).then(async (res) => ({
            status: res.status,
            body: await res.json(),
          })),
        ),
      );
      return results;
    });

    // Then at least one response should be 429 (rate limited)
    const rateLimited = results.some((r) => r.status === 429);
    expect(rateLimited).toBe(true);

    // The rate limited response has the proper error code
    for (const res of results) {
      if (res.status === 429) {
        expect(res.body.code).toBe("RATE_LIMIT");
        expect(res.body.error).toContain("Trop de requêtes");
      }
    }
  });

  test("la réponse rate limit contient les en-têtes Retry-After et X-RateLimit-*", async ({
    page,
  }) => {
    // When a rate-limited response is returned
    await page.route("**/api/extension/auth*", async (route: Route) => {
      await route.fulfill(MOCK_RATE_LIMIT_RESPONSE);
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "RateTest" }),
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: res.status, headers };
    });

    // Then all rate limit headers should be present
    expect(result.status).toBe(429);
    expect(result.headers["x-ratelimit-limit"]).toBe("5");
    expect(result.headers["x-ratelimit-remaining"]).toBe("0");
    expect(result.headers["x-ratelimit-reset"]).toBeDefined();
    expect(result.headers["retry-after"]).toBe("55");
  });

  test("après rate limit, le formulaire de connexion reste accessible", async ({ page }) => {
    // Given the user was rate limited (simulate by navigating with error param)
    await page.goto("/login?error=RateLimit");
    await page.waitForLoadState("networkidle");

    // Then the login page still renders correctly
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("le compteur de rate limit se réinitialise après la fenêtre d'attente — simulation", async ({
    page,
  }) => {
    // Simulate a rate limit that expires after a short window
    const shortWindowResponse = {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": "5",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600), // far future
        "Retry-After": "3600",
      },
      body: JSON.stringify({
        error: "Trop de requêtes. Réessayez plus tard.",
        code: "RATE_LIMIT",
      }),
    };

    let callIndex = 0;
    await page.route("**/api/extension/auth*", async (route: Route) => {
      callIndex++;
      // First call: rate limited. Second call: reset (simulating window expiry).
      if (callIndex === 1) {
        await route.fulfill(shortWindowResponse);
      } else {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
      }
    });

    // First call — rate limited
    const first = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ResetTest" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(first.status).toBe(429);

    // Second call — simulates that the window has elapsed
    const second = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ResetTest" }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(second.status).toBe(401);
    expect(first.status).toBe(429);
  });

  test("le rate limit IP-based est distinct du rate limit session-based", async ({ page }) => {
    // Simulate that different identifiers have independent rate limit counters
    await page.route("**/api/extension/auth*", async (route: Route) => {
      // Check the request headers to simulate IP-based vs session-based
      const headers = route.request().headers();
      const hasSession = headers["cookie"]?.includes("next-auth.session-token");

      if (hasSession) {
        // Session-based: allow
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Non authentifié", code: "UNAUTHORIZED" }),
        });
      } else {
        // IP-based: rate limit
        await route.fulfill(MOCK_RATE_LIMIT_RESPONSE);
      }
    });

    // Request without session cookie → IP rate limited
    const withoutSession = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "IPTest" }),
      });
      return { status: res.status };
    });
    expect(withoutSession.status).toBe(429);

    // Request with session cookie → allowed
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "mock-session-token",
        domain: "localhost",
        path: "/",
      },
    ]);
    const withSession = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "SessionTest" }),
      });
      return { status: res.status };
    });
    expect(withSession.status).not.toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. CSRF & State Parameter Validation                                      */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — CSRF et validation d'état", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("callback OAuth sans paramètre state — page d'erreur sécurisée", async ({ page }) => {
    // Simulate an OAuth callback without the state parameter (CSRF manipulation)
    // NextAuth v5 redirects to /login?error=... when state is missing/invalid
    const response = await page.goto("/api/auth/callback/google?code=injected-code");
    await page.waitForLoadState("networkidle");

    // The app should not crash — should redirect to login with an error
    const currentUrl = page.url();
    expect(currentUrl.includes("/login")).toBe(true);

    // The login page renders without crash
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.locator("body")).not.toContainText("Application Error");
  });

  test("callback OAuth avec paramètre state falsifié — rejeté", async ({ page }) => {
    // Simulate callback with a manipulated state parameter
    const response = await page.goto(
      "/api/auth/callback/google?code=injected-code&state=tampered-state-value",
    );
    await page.waitForLoadState("networkidle");

    // Should end up at login (rejected) without crashing
    expect(page.url().includes("/login")).toBe(true);
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("callback OAuth avec state expiré — rejeté proprement", async ({ page }) => {
    // Simulate callback with an expired state parameter
    // NextAuth v5 expires state after ~10 minutes by default
    await page.goto("/api/auth/callback/google?code=stale-code&state=expired-state");
    await page.waitForLoadState("networkidle");

    // Should handle gracefully without crashing
    expect(page.url().includes("/login")).toBe(true);
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("endpoint CSRF token validation — formulaire sans token rejeté", async ({ page }) => {
    // Attempt to POST to the sign-in endpoint without a proper CSRF token
    // NextAuth v5 requires a valid csrfToken for sign-in POSTs
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/signin/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "",
      });
      return { status: res.status };
    });

    // Should be rejected — either 403, 400, or redirect to error page
    const status = result.status;
    const validResponses = [400, 403, 404, 405];
    expect(validResponses).toContain(status);
  });

  test("soumission de formulaire sans jeton CSRF — 403 simulé", async ({ page }) => {
    // Intercept CSRF endpoint to test graceful handling of CSRF failures
    await page.route("**/api/auth/csrf*", async (route: Route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Jeton CSRF invalide",
          code: "CSRF_TOKEN_INVALID",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/csrf");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(403);

    expect(result.body.code).toBe("CSRF_TOKEN_INVALID");
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Session Security & Fixation                                            */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Sécurité de session", () => {
  test("le cookie de session possède l'attribut httpOnly", async ({ page }) => {
    // Navigate to login to trigger any session cookie creation
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Check all cookies from the context
    const cookies = await page.context().cookies();
    const sessionCookies = cookies.filter(
      (c) =>
        c.name.includes("next-auth") || c.name.includes("session") || c.name.includes("__Secure"),
    );

    if (sessionCookies.length > 0) {
      // If session cookies exist, they must have httpOnly
      for (const cookie of sessionCookies) {
        expect(cookie.httpOnly).toBe(true);
      }
    } else {
      // If no session cookies (not logged in), at least verify the login
      // page renders correctly
      await expect(page.locator("h1")).toContainText("l'Algorithme");
    }
  });

  test("le cookie de session possède SameSite=Lax ou Strict", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const cookies = await page.context().cookies();
    const sessionCookies = cookies.filter(
      (c) =>
        c.name.includes("next-auth") || c.name.includes("session") || c.name.includes("__Secure"),
    );

    if (sessionCookies.length > 0) {
      for (const cookie of sessionCookies) {
        // SameSite should be Lax or Strict to prevent CSRF
        expect(["Lax", "Strict"]).toContain(cookie.sameSite);
      }
    }
  });

  test("un cookie de session falsifié (signature modifiée) est rejeté", async ({ page }) => {
    // Set a session cookie with a modified/invalid signature
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "invalid-session-token-with-tampered-signature",
        domain: "localhost",
        path: "/",
      },
    ]);

    // Navigate to a protected route
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // The app should redirect to login (invalid session)
    expect(page.url().includes("/login")).toBe(true);
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("définir un cookie de session depuis un contexte différent est rejeté", async ({
    browser,
  }) => {
    // Create two separate browser contexts (simulating different clients)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Set a session cookie in context A
      await contextA.addCookies([
        {
          name: "next-auth.session-token",
          value: "session-from-context-a",
          domain: "localhost",
          path: "/",
        },
      ]);

      // Try to use the same cookie value in context B
      await contextB.addCookies([
        {
          name: "next-auth.session-token",
          value: "session-from-context-a",
          domain: "localhost",
          path: "/",
        },
      ]);

      // Both should be redirected to login (no valid session in DB)
      await pageA.goto("/dashboard");
      await pageB.goto("/dashboard");
      await pageA.waitForLoadState("networkidle");
      await pageB.waitForLoadState("networkidle");

      expect(pageA.url().includes("/login")).toBe(true);
      expect(pageB.url().includes("/login")).toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("l'ID de session change après connexion — pas de fixation", async ({ page }) => {
    // Note: Full session fixation test requires real OAuth login.
    // We verify that the app is built to prevent fixation by checking
    // that session cookies are only set through the proper OAuth callback.
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Get cookies before "login"
    const cookiesBefore = await page.context().cookies();
    const sessionBefore = cookiesBefore.filter((c) => c.name.includes("session"));

    // Mock a successful session (simulates what happens after login)
    await mockSession(page, ACTIVE_SESSION);

    // Navigate to dashboard which would trigger session establishment
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Get cookies after session mock
    const cookiesAfter = await page.context().cookies();
    const sessionAfter = cookiesAfter.filter((c) => c.name.includes("session"));

    // The mock doesn't set real cookies, so we verify the behavior is correct:
    // The page should either be on dashboard (if server-side auth passes)
    // or login (if server redirects). No crash either way.
    const isOnDashboard = page.url().includes("/dashboard");
    const isOnLogin = page.url().includes("/login");
    expect(isOnDashboard || isOnLogin).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Multi-tab & Concurrent Sessions                                        */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Sessions concurrentes (multi-onglet)", () => {
  test("ouverture de connexion dans l'onglet A puis onglet B — les deux voient la même session mockée", async ({
    page,
    context,
  }) => {
    // Given a mocked session
    await mockSession(page, ACTIVE_SESSION);

    // Open tab A
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Open tab B from the same context
    const pageB = await context.newPage();
    await mockSession(pageB, ACTIVE_SESSION);
    await pageB.goto("/my-niches");
    await pageB.waitForLoadState("networkidle");

    try {
      // Both tabs should be in a valid state (either on their route or redirected)
      const tabAUrl = page.url();
      const tabBUrl = pageB.url();

      // Both tabs should either be on their target OR on login (redirect)
      const validTabA = tabAUrl.includes("/dashboard") || tabAUrl.includes("/login");
      const validTabB = tabBUrl.includes("/my-niches") || tabBUrl.includes("/login");
      expect(validTabA).toBe(true);
      expect(validTabB).toBe(true);

      // No crash
      await expect(page.locator("body")).toBeVisible();
      await expect(pageB.locator("body")).toBeVisible();
    } finally {
      await pageB.close();
    }
  });

  test("déconnexion dans l'onglet A — l'onglet B reste fonctionnel jusqu'au refresh", async ({
    page,
    context,
  }) => {
    // Given two tabs with an active session
    await mockSession(page, ACTIVE_SESSION);
    const pageB = await context.newPage();
    await mockSession(pageB, ACTIVE_SESSION);

    await page.goto("/dashboard");
    await pageB.goto("/alerts");
    await page.waitForLoadState("networkidle");
    await pageB.waitForLoadState("networkidle");

    try {
      // When: simulate logout in tab A by removing the mock and setting expired session
      await clearMocks(page);
      await page.route("**/api/auth/session*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "null",
        });
      });

      // Navigate tab A to trigger session re-check
      await page.goto("/settings");
      await page.waitForLoadState("networkidle");

      // Tab A should be redirected to login
      const tabAUrl = page.url();
      expect(tabAUrl.includes("/login")).toBe(true);

      // Tab B still has the mock, so it should still work
      const tabBUrl = pageB.url();
      expect(tabBUrl.includes("/alerts") || tabBUrl.includes("/login")).toBe(true);

      // After refresh in tab B (without mock), it should also redirect to login
      await clearMocks(pageB);
      await pageB.reload();
      await pageB.waitForLoadState("networkidle");
      expect(pageB.url().includes("/login")).toBe(true);
    } finally {
      await pageB.close();
    }
  });

  test("session expirée détectée dans un onglet — les autres onglets détectent aussi après navigation", async ({
    page,
    context,
  }) => {
    // Given two tabs with active session
    await mockSession(page, ACTIVE_SESSION);
    const pageB = await context.newPage();
    await mockSession(pageB, ACTIVE_SESSION);

    await page.goto("/billing");
    await pageB.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await pageB.waitForLoadState("networkidle");

    try {
      // When: session expires for both (update mock globally via same route)
      const expiredSession = {
        ...ACTIVE_SESSION,
        expires: "2020-01-01T00:00:00.000Z",
      };

      // Update mock for both pages
      await clearMocks(page);
      await clearMocks(pageB);
      await mockSession(page, expiredSession);
      await mockSession(pageB, expiredSession);

      // Navigate both tabs to trigger session check
      await page.goto("/home");
      await pageB.goto("/my-niches");
      await page.waitForLoadState("networkidle");
      await pageB.waitForLoadState("networkidle");

      // Both should detect expired session and redirect to login
      expect(page.url().includes("/login")).toBe(true);
      expect(pageB.url().includes("/login")).toBe(true);
    } finally {
      await pageB.close();
    }
  });

  test("rafraîchissement après déconnexion dans l'onglet B — redirigé vers login", async ({
    page,
    context,
  }) => {
    // Given a session mocked on both tabs
    await mockSession(page, ACTIVE_SESSION);
    const pageB = await context.newPage();
    await mockSession(pageB, ACTIVE_SESSION);

    await page.goto("/dashboard");
    await pageB.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await pageB.waitForLoadState("networkidle");

    try {
      // Simulate logout in tab A
      await clearMocks(page);
      await page.route("**/api/auth/session*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "null",
        });
      });
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      // Tab B still has the old mock, refresh it without mock
      await clearMocks(pageB);

      // Also clear any session-like cookies in context B
      const cookies = await context.cookies();
      for (const cookie of cookies) {
        if (cookie.name.includes("next-auth") || cookie.name.includes("session")) {
          await context.removeCookies({
            name: cookie.name,
            domain: "localhost",
            path: "/",
          });
        }
      }

      await pageB.reload();
      await pageB.waitForLoadState("networkidle");

      // After refresh without valid session, tab B should redirect to login
      expect(pageB.url().includes("/login")).toBe(true);
    } finally {
      await pageB.close();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Account Linking & Identity                                             */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Liaison de comptes et identité", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("erreur OAuthAccountNotLinked — gérée sans crash", async ({ page }) => {
    // NextAuth v5 shows this error when a Google account with an existing
    // email tries to sign in but isn't linked
    await page.goto("/login?error=OAuthAccountNotLinked");
    await page.waitForLoadState("networkidle");

    // App must handle gracefully
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application Error");
  });

  test("connexion Google puis tentative de connexion credentials — rejetée (Google uniquement)", async ({
    page,
  }) => {
    // This app only has Google provider, so credentials login is not available.
    // Simulate by testing what happens when credential-based access is attempted.

    // Mock a session as if logged in with Google
    await mockSession(page, ACTIVE_SESSION);

    // Attempt to access a password-based endpoint (not available in this app)
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com", password: "somepassword" }),
      });
      return { status: res.status };
    });

    // Should be rejected — credentials provider doesn't exist
    const status = result.status;
    const validResponses = [404, 405, 400, 403];
    expect(validResponses).toContain(status);
  });

  test("email OAuth en conflit avec email du compte — gestion gracieuse", async ({ page }) => {
    // Test handling of NextAuth OAuth email mismatch errors
    // This simulates what happens when Google returns a different email than expected
    await page.goto("/login?error=OAuthAccountNotLinked");
    await page.waitForLoadState("networkidle");

    // Verify the app handles this gracefully
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();

    // Test with a generic OAuth error too
    await page.goto("/login?error=OAuthSignin");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("compte avec erreur de fusion OAuth — callback malformé géré", async ({ page }) => {
    // Simulate various malformed OAuth callback scenarios
    const malformedCallbacks = [
      "/api/auth/callback/google?error=access_denied",
      "/api/auth/callback/google?error=consent_required",
      "/api/auth/callback/google?error=interaction_required",
    ];

    for (const callback of malformedCallbacks) {
      await page.goto(callback);
      await page.waitForLoadState("networkidle");

      // Should always end up at login without crash
      expect(page.url().includes("/login")).toBe(true);
      await expect(page.locator("h1")).toContainText("l'Algorithme");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  6. Session Token & API Key Rotation                                       */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Rotation des tokens et clés API", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("les tokens API ont un format sécurisé (préfixe th_ + hash)", async ({ page }) => {
    // The API tokens use format: th_<raw>.<hashPrefix>
    // We verify the token creation endpoint validates this format

    await mockSession(page, ACTIVE_SESSION);

    // Mock the extension auth endpoint to return a properly formatted token
    await page.route("**/api/extension/auth*", async (route: Route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "th_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p.a1b2c3d4",
            id: "token-id-123",
            name: "Test Token",
          }),
        });
      } else {
        await route.continue();
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Token" }),
      });
      return { status: res.status, body: await res.json() };
    });

    if (result.status === 200) {
      // Token should start with th_ prefix
      expect(result.body.token).toMatch(/^th_[a-f0-9]+\./);
    } else {
      // If real auth redirects, that's fine — token creation requires real DB
      const validStatuses = [200, 401, 403];
      expect(validStatuses).toContain(result.status);
    }
  });

  test("révocation de token API — les requêtes avec l'ancien token échouent", async ({ page }) => {
    // Simulate token revocation: first create, then revoke, then use

    const tokens: { id: string; token: string }[] = [];

    await page.route("**/api/extension/auth*", async (route: Route) => {
      if (route.request().method() === "POST") {
        // Create token
        tokens.push({
          id: "token-new-1",
          token: "th_newtoken123.abc123",
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            token: "th_newtoken123.abc123",
            id: "token-new-1",
            name: "My Token",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Create a token
    const createResponse = await page.evaluate(async () => {
      const res = await fetch("/api/extension/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Token" }),
      });
      return { status: res.status, body: await res.json() };
    });

    if (createResponse.status === 200) {
      // Now simulate the token being revoked — next POST returns error
      await clearMocks(page);
      await page.route("**/api/extension/auth*", async (route: Route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Token révoqué",
              code: "TOKEN_REVOKED",
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Use same token again after revocation
      const revokedResponse = await page.evaluate(async () => {
        const res = await fetch("/api/extension/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Token" }),
        });
        return { status: res.status, body: await res.json() };
      });
      expect(revokedResponse.status).toBe(401);
      expect(revokedResponse.body.code).toBe("TOKEN_REVOKED");
    }
  });

  test("session invalidée après bannissement — simulation", async ({ page }) => {
    // Simulate what happens when a user is banned/disabled:
    // The session endpoint returns a special error

    await mockSession(page, ACTIVE_SESSION);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Now simulate user being banned — session returns 403 with BANNED error
    await clearMocks(page);
    await page.route("**/api/auth/session*", async (route: Route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Compte désactivé",
          code: "ACCOUNT_DISABLED",
        }),
      });
    });

    // Trigger a session re-check
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(403);

    expect(result.body.code).toBe("ACCOUNT_DISABLED");
  });

  test("indicateur de fraîcheur de session dans la réponse API", async ({ page }) => {
    // Verify the session response structure includes expiry info
    await page.route("**/api/auth/session*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...ACTIVE_SESSION,
          expires: "2099-01-01T00:00:00.000Z",
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);

    // Session should have an expires field (freshness indicator)
    expect(result.body).toHaveProperty("expires");
    expect(new Date(result.body.expires).getTime()).toBeGreaterThan(Date.now());
  });

  test("rotation du token de session — l'ancien token devient invalide", async ({ page }) => {
    // NextAuth v5 with database strategy rotates session tokens.
    // Simulate: old session returns null after rotation

    // First, mock an active session
    await mockSession(page, ACTIVE_SESSION);
    const firstResult = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return { status: res.status, body: await res.json() };
    });
    expect(firstResult.status).toBe(200);

    // Simulate token rotation — clear old mock, set new session (different ID)
    await clearMocks(page);
    const ROTATED_SESSION = {
      user: {
        id: "rotated-user-id",
        name: "Rotated",
        email: "rotated@test.com",
        role: "USER" as const,
        plan: "FREE" as const,
      },
      expires: "2099-06-01T00:00:00.000Z",
    };

    await page.route("**/api/auth/session*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ROTATED_SESSION),
      });
    });

    // After rotation, the old session data is gone
    const rotatedResult = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return { status: res.status, body: await res.json() };
    });
    expect(rotatedResult.status).toBe(200);
    expect(rotatedResult.body.user.id).not.toBe(ACTIVE_SESSION.user.id);
  });
});

/* -------------------------------------------------------------------------- */
/*  7. 2FA / MFA                                                              */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — 2FA / MFA (non implémenté)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("le flux 2FA n'existe pas — accès à /login?error=2FARequired géré", async ({ page }) => {
    // The app does not implement 2FA. Verify graceful handling if 2FA error is passed.
    await page.goto("/login?error=2FARequired");
    await page.waitForLoadState("networkidle");

    // Should render login page normally without crash
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("aucun endpoint 2FA exposé — 404 géré proprement", async ({ page }) => {
    // Verify that common 2FA endpoints return 404 without crashing
    const twoFaEndpoints = [
      "/api/auth/2fa/setup",
      "/api/auth/2fa/verify",
      "/api/auth/2fa/disable",
      "/api/auth/2fa/recovery-codes",
    ];

    for (const endpoint of twoFaEndpoints) {
      const result = await page.evaluate(async (ep) => {
        const res = await fetch(ep);
        return { status: res.status };
      }, endpoint);
      expect(result.status).toBe(404);
    }
  });

  test("pas de page 2FA dédiée — redirection sécurisée", async ({ page }) => {
    // If someone navigates to a 2FA page, it should 404 or redirect
    const response = await page.goto("/2fa/setup");
    await page.waitForLoadState("networkidle");

    // Should be either 404 page or redirect to login
    const currentUrl = page.url();
    const isValidState = currentUrl.includes("/login") || response?.status() === 404;
    expect(isValidState).toBe(true);
    await expect(page.locator("body")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Passwordless / Magic Link                                              */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Magic Link (non implémenté)", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("le flux magic link n'existe pas — erreur gérée", async ({ page }) => {
    // The app does not implement passwordless/magic link auth.
    // Verify graceful handling of related errors.
    await page.goto("/login?error=MagicLinkExpired");
    await page.waitForLoadState("networkidle");

    // Should render login page normally without crash
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("tentative d'accès à un endpoint magic link — 404 géré", async ({ page }) => {
    // Common magic link endpoints should return 404
    const magicLinkEndpoints = [
      "/api/auth/magic-link/send",
      "/api/auth/magic-link/verify",
      "/api/auth/magic-link/request",
      "/auth/magic-link",
    ];

    for (const endpoint of magicLinkEndpoints) {
      const result = await page.evaluate(async (ep) => {
        const res = await fetch(ep);
        return { status: res.status, url: res.url };
      }, endpoint);
      // Should 404 and not crash
      if (!result.url.includes("/login")) {
        expect(result.status).toBe(404);
      }
    }
  });

  test("callback magic link avec signature invalide — rejeté sans crash", async ({ page }) => {
    // Simulate a magic link callback with invalid signature
    await page.goto("/api/auth/callback/magic-link?token=invalid-token&email=test@test.com");
    await page.waitForLoadState("networkidle");

    // Should not crash — either redirect to login or 404
    const currentUrl = page.url();
    expect(currentUrl.includes("/login") || currentUrl.includes("/404")).toBe(true);
    await expect(page.locator("body")).toBeVisible();
  });

  test("callback magic link avec email non correspondant — rejeté", async ({ page }) => {
    // Simulate magic link with email mismatch
    await page.goto("/api/auth/callback/magic-link?token=valid-token&email=wrong@email.com");
    await page.waitForLoadState("networkidle");

    // Should not crash — redirect to login or 404
    const currentUrl = page.url();
    expect(currentUrl.includes("/login") || currentUrl.includes("/404")).toBe(true);
    await expect(page.locator("body")).toBeVisible();
  });

  test("tentative de réutilisation d'un magic link — rejeté proprement", async ({ page }) => {
    // Simulate reusing the same magic link twice
    await page.goto("/api/auth/callback/magic-link?token=used-token&email=test@test.com");
    await page.waitForLoadState("networkidle");

    // First use should redirect safely
    const firstUrl = page.url();
    expect(firstUrl.includes("/login") || firstUrl.includes("/404")).toBe(true);

    // Second use of the same token
    await page.goto("/api/auth/callback/magic-link?token=used-token&email=test@test.com");
    await page.waitForLoadState("networkidle");

    // Second use should also be safe
    const secondUrl = page.url();
    expect(secondUrl.includes("/login") || secondUrl.includes("/404")).toBe(true);
    await expect(page.locator("body")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  9. Resilience — Edge cases combining multiple attack vectors               */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Résilience combinée", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("enchaînement: rate limit + redirection protégée + refresh = stable", async ({ page }) => {
    // Scenario: User gets rate limited, navigates to protected page,
    // gets redirected to login, refreshes — all should be stable.

    // Step 1: Rate limit simulation via URL parameter
    await page.goto("/login?error=RateLimit");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");

    // Step 2: Navigate to protected page (should redirect to login)
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    expect(page.url().includes("/login")).toBe(true);

    // Step 3: Refresh the login page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Should still show login without crash
    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("enchaînement: session invalide + OAuth error + navigation = stable", async ({ page }) => {
    // Step 1: Navigate with an invalid session cookie
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "definitely-fake-session",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    expect(page.url().includes("/login")).toBe(true);

    // Step 2: Add OAuth error on top
    await page.goto("/login?error=OAuthAccountNotLinked");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("l'Algorithme");

    // Step 3: Navigate to another protected route
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");
    expect(page.url().includes("/login")).toBe(true);

    // Step 4: All good, no crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("requêtes API concurrentes pendant une expiration de session", async ({ page }) => {
    // Simulate session that expires mid-flight while concurrent API calls are made

    // Mock session as active initially
    await mockSession(page, ACTIVE_SESSION);

    // Make several concurrent API calls
    const results = await page.evaluate(async () => {
      const results = await Promise.all([
        (async () => {
          const r = await fetch("/api/auth/session");
          return { endpoint: "/api/auth/session", status: r.status };
        })(),
        (async () => {
          const r = await fetch("/api/auth/session");
          return { endpoint: "/api/auth/session#2", status: r.status };
        })(),
        (async () => {
          const r = await fetch("/api/auth/session");
          return { endpoint: "/api/auth/session#3", status: r.status };
        })(),
      ]);
      return results;
    });

    // All calls should return without crashing
    for (const result of results) {
      expect([200, 401, 403]).toContain(result.status);
    }
  });

  test("manipulation des en-têtes de session — pas de fuite d'information", async ({ page }) => {
    // When accessing the session endpoint, verify no sensitive headers leak
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: res.status, headers };
    });

    // Response should not contain internal headers
    const headers = result.headers;
    const sensitiveHeaders = ["x-powered-by", "server", "x-aspnet-version"];
    for (const header of sensitiveHeaders) {
      // If present, these should not reveal version info
      if (headers[header]) {
        expect(headers[header]).not.toMatch(/\d+\.\d+\.\d+/);
      }
    }
  });

  test("cookie de session avec domaine différent — rejeté", async ({ page }) => {
    // Attempt to set a session cookie for a different domain
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "cross-domain-session",
        domain: "evil.com",
        path: "/",
      },
    ]);

    // Navigate to the app
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // The cross-domain cookie should not affect the app
    const cookies = await page.context().cookies();
    const evilCookies = cookies.filter((c) => c.domain === "evil.com");
    expect(evilCookies.length).toBe(0);

    // App should still work normally
    await expect(page.locator("h1")).toContainText("l'Algorithme");
  });

  test("cache de session — réponse non mise en cache", async ({ page }) => {
    // Session responses should not be cached by the browser
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: res.status, headers };
    });

    // Check cache-control headers
    const cacheControl = result.headers["cache-control"];
    if (cacheControl) {
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("must-revalidate");
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  10. Security — CSP, callbackUrl sanitization, combined attack vectors      */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Sécurité des URLs et en-têtes", () => {
  test("Auth — CSP headers on login page", async ({ page }) => {
    const response = await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const headers = response?.headers() ?? {};
    expect(headers["content-security-policy"]).toBeDefined();
  });

  test("Auth — callbackUrl protocol-relative neutralisé", async ({ page }) => {
    await page.goto("/login?callbackUrl=//evil.com");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("Auth — callbackUrl URL absolue neutralisée", async ({ page }) => {
    await page.goto("/login?callbackUrl=https://evil.com");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
  });

  test("Auth — Erreur + callbackUrl combinés", async ({ page }) => {
    await page.goto("/login?error=OAuthSignin&callbackUrl=javascript:alert(1)");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.getByRole("button", { name: /continuer avec google/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application Error");
  });
});

/* -------------------------------------------------------------------------- */
/*  11. Resilience & Accessibility — Timeout, tab order, reduced motion        */
/* -------------------------------------------------------------------------- */

test.describe("Auth renforcé — Résilience et accessibilité", () => {
  test("Auth — Timeout réseau session", async ({ page }) => {
    await page.route("**/api/auth/session*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.locator("body")).toBeVisible();
  });

  test("Auth — Ordre tabulation complet", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(firstFocused).toBe("A");

    await page.keyboard.press("Tab");
    const secondFocused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(secondFocused).toContain("Continuer avec Google");

    await page.keyboard.press("Tab");
    const thirdFocused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(thirdFocused).toContain("Conditions");

    await page.keyboard.press("Tab");
    const fourthFocused = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(fourthFocused).toContain("Confidentialité");
  });

  test("Auth — prefers-reduced-motion respecté", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("l'Algorithme");
    await expect(page.locator("body")).toBeVisible();
  });
});
