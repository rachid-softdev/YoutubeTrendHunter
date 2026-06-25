/**
 * Cross-browser E2E tests for YouTube TrendHunter
 *
 * Validates core application behaviour across Chromium, Firefox, and WebKit.
 * Each browser is tested in an isolated `test.describe` block. Tests use the
 * `runInBrowser` helper to launch the target browser manually, ensuring that
 * each describe block only runs in its matching Playwright project.
 *
 * Prerequisites:
 *   npx playwright install firefox webkit
 *
 * Run all cross-browser tests:
 *   pnpm exec playwright test --grep "Chromium|Firefox|WebKit"
 *
 * Run a specific browser:
 *   pnpm exec playwright test --project=firefox --grep "Firefox"
 */

import { test, expect, type Page, chromium, firefox, webkit } from "@playwright/test";
import { injectSessionCookie, cleanupUserSessions } from "_e2e-helpers";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const BASE_URL = "http://localhost:3000";

/** Feature card titles on the landing page */
const FEATURE_TITLES = [
  "Tendances en temps réel",
  "Score IA",
  "Alertes personnalisées",
  "Extension Chrome",
] as const;

/** Plan names expected on the pricing page */
const PLAN_NAMES = ["Free", "Pro", "Team"] as const;

/** Sidebar navigation link labels */
const SIDEBAR_LINKS = ["Tendances", "Niches", "Alertes", "Facturation"] as const;

/* -------------------------------------------------------------------------- */
/*  Helper — launch a browser, run tests, close                               */
/* -------------------------------------------------------------------------- */

async function runInBrowser(
  browserType: "chromium" | "firefox" | "webkit",
  callback: (page: Page) => Promise<void>,
): Promise<void> {
  const browser = await { chromium, firefox, webkit }[browserType].launch();
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "fr-FR" });
  const page = await context.newPage();
  try {
    await callback(page);
  } finally {
    await browser.close();
  }
}

/* -------------------------------------------------------------------------- */
/*  Chromium                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("Chromium", () => {
  test.skip(({ browserName }) => browserName !== "chromium");

  test("1 — Landing page : rendu correct", async () => {
    await runInBrowser("chromium", async (page) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      // Titre principal
      await expect(page.locator("h1")).toContainText("Trouvez les tendances YouTube");

      // 4 feature cards
      for (const title of FEATURE_TITLES) {
        await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
      }

      // Bouton CTA
      await expect(page.getByText("Essayer gratuitement")).toBeVisible();
    });
  });

  test("2 — Dashboard : chargement et affichage", async () => {
    await runInBrowser("chromium", async (page) => {
      const { user } = await injectSessionCookie(page, { plan: "PRO" });
      try {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        // Sidebar visible (aside dans le layout dashboard)
        await expect(page.locator("aside")).toBeVisible();

        // Liens de navigation latérale visibles
        for (const label of SIDEBAR_LINKS) {
          await expect(page.locator("aside").getByText(label)).toBeVisible();
        }

        // NicheSelector : un élément <select> doit être présent
        const select = page.locator("select");
        await expect(select).toBeVisible();
        await expect(select).toBeEnabled();

        // Titre de la page
        await expect(page.locator("h1")).toContainText("Tendances");

        // Vérifier que le conteneur des TrendCards est présent
        // (les cartes elles-mêmes dépendent des données en base)
        await expect(page.locator("div.space-y-3")).toBeAttached();
      } finally {
        await cleanupUserSessions(user.id);
      }
    });
  });

  test("3 — Pricing page : rendu des 3 plans", async () => {
    await runInBrowser("chromium", async (page) => {
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      // 3 noms de plans visibles
      for (const name of PLAN_NAMES) {
        await expect(page.getByText(name).first()).toBeVisible();
      }

      // Badge "Populaire" visible sur le plan Pro (un seul)
      const popularBadge = page.getByText("Populaire");
      await expect(popularBadge).toBeVisible();
      await expect(popularBadge).toHaveCount(1);

      // Features listes visibles (vérification d'au moins une feature par plan)
      await expect(page.getByText("1 niche suivie")).toBeVisible();
      await expect(page.getByText("Toutes les niches")).toBeVisible();
      await expect(page.getByText("5 utilisateurs")).toBeVisible();
    });
  });

  test("4 — Login page : formulaire", async () => {
    await runInBrowser("chromium", async (page) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      // Titre Connexion
      await expect(page.locator("h1")).toContainText("Connexion");

      // Bouton Google OAuth
      const googleBtn = page.getByText("Continuer avec Google");
      await expect(googleBtn).toBeVisible();
    });
  });

  test("5 — Erreur 404", async () => {
    await runInBrowser("chromium", async (page) => {
      const response = await page.goto("/page-inexistante");
      await page.waitForLoadState("networkidle");

      // Le code HTTP doit être 404
      expect(response?.status()).toBe(404);

      // Le h1 doit contenir "404"
      await expect(page.locator("h1")).toContainText("404");
    });
  });

  test("6 — localStorage et sessionStorage : persistance", async () => {
    await runInBrowser("chromium", async (page) => {
      const LOCAL_KEY = "cross-browser-test-local";
      const SESSION_KEY = "cross-browser-test-session";
      const TEST_VALUE = "persisted-value";

      // Stocker les valeurs
      await page.goto(BASE_URL);
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, value);
        },
        { key: LOCAL_KEY, value: TEST_VALUE },
      );
      await page.evaluate(
        ({ key, value }) => {
          sessionStorage.setItem(key, value);
        },
        { key: SESSION_KEY, value: TEST_VALUE },
      );

      // Naviguer vers une autre page du même origin
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      // Vérifier la persistance
      const localValue = await page.evaluate((key) => localStorage.getItem(key), LOCAL_KEY);
      expect(localValue).toBe(TEST_VALUE);

      const sessionValue = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
      expect(sessionValue).toBe(TEST_VALUE);

      // Nettoyer
      await page.evaluate((key) => localStorage.removeItem(key), LOCAL_KEY);
      await page.evaluate((key) => sessionStorage.removeItem(key), SESSION_KEY);
    });
  });

  test("7 — Cookies : comportement SameSite", async () => {
    await runInBrowser("chromium", async (page) => {
      const COOKIE_NAME = "cross-browser-test-cookie";
      const COOKIE_VALUE = "test-cookie-value";

      // Définir un cookie via page.context().addCookies()
      await page.context().addCookies([
        {
          name: COOKIE_NAME,
          value: COOKIE_VALUE,
          domain: "localhost",
          path: "/",
          sameSite: "Lax",
        },
      ]);

      // Naviguer vers la landing page
      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      // Vérifier que le cookie est accessible depuis la page
      const cookies = await page.context().cookies();
      const testCookie = cookies.find((c) => c.name === COOKIE_NAME);
      expect(testCookie).toBeDefined();
      expect(testCookie?.value).toBe(COOKIE_VALUE);

      // Vérifier via document.cookie
      const documentCookie = await page.evaluate(() => document.cookie);
      expect(documentCookie).toContain(COOKIE_NAME);

      // Nettoyer
      await page.context().clearCookies();
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Firefox                                                                   */
/*                                                                             */
/*  Note: page.route() in Firefox intercepts browser-internal requests too.   */
/*  Use specific URL patterns (like "/api/**") to avoid interfering with      */
/*  browser chrome requests. These tests do not use route() so no special     */
/*  handling is required.                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Firefox", () => {
  test.skip(({ browserName }) => browserName !== "firefox");

  test("1 — Landing page : rendu correct", async () => {
    await runInBrowser("firefox", async (page) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h1")).toContainText("Trouvez les tendances YouTube");

      for (const title of FEATURE_TITLES) {
        await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
      }

      await expect(page.getByText("Essayer gratuitement")).toBeVisible();
    });
  });

  test("2 — Dashboard : chargement et affichage", async () => {
    await runInBrowser("firefox", async (page) => {
      const { user } = await injectSessionCookie(page, { plan: "PRO" });
      try {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        await expect(page.locator("aside")).toBeVisible();

        for (const label of SIDEBAR_LINKS) {
          await expect(page.locator("aside").getByText(label)).toBeVisible();
        }

        const select = page.locator("select");
        await expect(select).toBeVisible();
        await expect(select).toBeEnabled();

        await expect(page.locator("h1")).toContainText("Tendances");
        await expect(page.locator("div.space-y-3")).toBeAttached();
      } finally {
        await cleanupUserSessions(user.id);
      }
    });
  });

  test("3 — Pricing page : rendu des 3 plans", async () => {
    await runInBrowser("firefox", async (page) => {
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      for (const name of PLAN_NAMES) {
        await expect(page.getByText(name).first()).toBeVisible();
      }

      const popularBadge = page.getByText("Populaire");
      await expect(popularBadge).toBeVisible();
      await expect(popularBadge).toHaveCount(1);

      await expect(page.getByText("1 niche suivie")).toBeVisible();
      await expect(page.getByText("Toutes les niches")).toBeVisible();
      await expect(page.getByText("5 utilisateurs")).toBeVisible();
    });
  });

  test("4 — Login page : formulaire", async () => {
    await runInBrowser("firefox", async (page) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h1")).toContainText("Connexion");

      const googleBtn = page.getByText("Continuer avec Google");
      await expect(googleBtn).toBeVisible();
    });
  });

  test("5 — Erreur 404", async () => {
    await runInBrowser("firefox", async (page) => {
      const response = await page.goto("/page-inexistante");
      await page.waitForLoadState("networkidle");

      expect(response?.status()).toBe(404);
      await expect(page.locator("h1")).toContainText("404");
    });
  });

  test("6 — localStorage et sessionStorage : persistance", async () => {
    await runInBrowser("firefox", async (page) => {
      const LOCAL_KEY = "cross-browser-test-local";
      const SESSION_KEY = "cross-browser-test-session";
      const TEST_VALUE = "persisted-value";

      await page.goto(BASE_URL);
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, value);
        },
        { key: LOCAL_KEY, value: TEST_VALUE },
      );
      await page.evaluate(
        ({ key, value }) => {
          sessionStorage.setItem(key, value);
        },
        { key: SESSION_KEY, value: TEST_VALUE },
      );

      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      const localValue = await page.evaluate((key) => localStorage.getItem(key), LOCAL_KEY);
      expect(localValue).toBe(TEST_VALUE);

      const sessionValue = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
      expect(sessionValue).toBe(TEST_VALUE);

      await page.evaluate((key) => localStorage.removeItem(key), LOCAL_KEY);
      await page.evaluate((key) => sessionStorage.removeItem(key), SESSION_KEY);
    });
  });

  test("7 — Cookies : comportement SameSite", async () => {
    await runInBrowser("firefox", async (page) => {
      const COOKIE_NAME = "cross-browser-test-cookie";
      const COOKIE_VALUE = "test-cookie-value";

      await page.context().addCookies([
        {
          name: COOKIE_NAME,
          value: COOKIE_VALUE,
          domain: "localhost",
          path: "/",
          sameSite: "Lax",
        },
      ]);

      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      const cookies = await page.context().cookies();
      const testCookie = cookies.find((c) => c.name === COOKIE_NAME);
      expect(testCookie).toBeDefined();
      expect(testCookie?.value).toBe(COOKIE_VALUE);

      const documentCookie = await page.evaluate(() => document.cookie);
      expect(documentCookie).toContain(COOKIE_NAME);

      await page.context().clearCookies();
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  WebKit (Safari)                                                           */
/*                                                                             */
/*  Note: WebKit enforces stricter localStorage quotas (~5 MB vs 10 MB in     */
/*  other browsers). These tests use small values so quotas are not a concern.*/
/* -------------------------------------------------------------------------- */

test.describe("WebKit (Safari)", () => {
  test.skip(({ browserName }) => browserName !== "webkit");

  test("1 — Landing page : rendu correct", async () => {
    await runInBrowser("webkit", async (page) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h1")).toContainText("Trouvez les tendances YouTube");

      for (const title of FEATURE_TITLES) {
        await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
      }

      await expect(page.getByText("Essayer gratuitement")).toBeVisible();
    });
  });

  test("2 — Dashboard : chargement et affichage", async () => {
    await runInBrowser("webkit", async (page) => {
      const { user } = await injectSessionCookie(page, { plan: "PRO" });
      try {
        await page.goto("/dashboard");
        await page.waitForLoadState("networkidle");

        await expect(page.locator("aside")).toBeVisible();

        for (const label of SIDEBAR_LINKS) {
          await expect(page.locator("aside").getByText(label)).toBeVisible();
        }

        const select = page.locator("select");
        await expect(select).toBeVisible();
        await expect(select).toBeEnabled();

        await expect(page.locator("h1")).toContainText("Tendances");
        await expect(page.locator("div.space-y-3")).toBeAttached();
      } finally {
        await cleanupUserSessions(user.id);
      }
    });
  });

  test("3 — Pricing page : rendu des 3 plans", async () => {
    await runInBrowser("webkit", async (page) => {
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      for (const name of PLAN_NAMES) {
        await expect(page.getByText(name).first()).toBeVisible();
      }

      const popularBadge = page.getByText("Populaire");
      await expect(popularBadge).toBeVisible();
      await expect(popularBadge).toHaveCount(1);

      await expect(page.getByText("1 niche suivie")).toBeVisible();
      await expect(page.getByText("Toutes les niches")).toBeVisible();
      await expect(page.getByText("5 utilisateurs")).toBeVisible();
    });
  });

  test("4 — Login page : formulaire", async () => {
    await runInBrowser("webkit", async (page) => {
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      await expect(page.locator("h1")).toContainText("Connexion");

      const googleBtn = page.getByText("Continuer avec Google");
      await expect(googleBtn).toBeVisible();
    });
  });

  test("5 — Erreur 404", async () => {
    await runInBrowser("webkit", async (page) => {
      const response = await page.goto("/page-inexistante");
      await page.waitForLoadState("networkidle");

      expect(response?.status()).toBe(404);
      await expect(page.locator("h1")).toContainText("404");
    });
  });

  test("6 — localStorage et sessionStorage : persistance", async () => {
    await runInBrowser("webkit", async (page) => {
      const LOCAL_KEY = "cross-browser-test-local";
      const SESSION_KEY = "cross-browser-test-session";
      const TEST_VALUE = "persisted-value";

      await page.goto(BASE_URL);
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, value);
        },
        { key: LOCAL_KEY, value: TEST_VALUE },
      );
      await page.evaluate(
        ({ key, value }) => {
          sessionStorage.setItem(key, value);
        },
        { key: SESSION_KEY, value: TEST_VALUE },
      );

      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      const localValue = await page.evaluate((key) => localStorage.getItem(key), LOCAL_KEY);
      expect(localValue).toBe(TEST_VALUE);

      const sessionValue = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
      expect(sessionValue).toBe(TEST_VALUE);

      await page.evaluate((key) => localStorage.removeItem(key), LOCAL_KEY);
      await page.evaluate((key) => sessionStorage.removeItem(key), SESSION_KEY);
    });
  });

  test("7 — Cookies : comportement SameSite", async () => {
    await runInBrowser("webkit", async (page) => {
      const COOKIE_NAME = "cross-browser-test-cookie";
      const COOKIE_VALUE = "test-cookie-value";

      await page.context().addCookies([
        {
          name: COOKIE_NAME,
          value: COOKIE_VALUE,
          domain: "localhost",
          path: "/",
          sameSite: "Lax",
        },
      ]);

      await page.goto(BASE_URL);
      await page.waitForLoadState("networkidle");

      const cookies = await page.context().cookies();
      const testCookie = cookies.find((c) => c.name === COOKIE_NAME);
      expect(testCookie).toBeDefined();
      expect(testCookie?.value).toBe(COOKIE_VALUE);

      const documentCookie = await page.evaluate(() => document.cookie);
      expect(documentCookie).toContain(COOKIE_NAME);

      await page.context().clearCookies();
    });
  });
});
