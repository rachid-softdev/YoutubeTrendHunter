import { test, expect, type Page } from "@playwright/test";

/**
 * ThemeToggle — E2E tests pour YouTube TrendHunter
 *
 * Teste le composant ThemeToggle sur la page d'accueil publique (/).
 * ThemeToggle est un composant "use client" qui utilise useSyncExternalStore
 * avec un store personnalisé pour lire/mettre à jour le thème via localStorage
 * et les préférences système prefers-color-scheme.
 *
 * Stratégie de test:
 *   - Page d'accueil "/" : publique, sans besoin d'auth mock
 *   - page.evaluate() pour lire localStorage et document.documentElement.classList
 *   - page.emulateMedia() pour mocker prefers-color-scheme
 *   - page.addInitScript() pour initialiser localStorage avant le chargement
 */

/* -------------------------------------------------------------------------- */
/*  Constantes                                                                 */
/* -------------------------------------------------------------------------- */

const ARIA_DARK = "Passer en mode clair";
const ARIA_LIGHT = "Passer en mode sombre";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Navigue vers la page d'accueil et attend le chargement complet.
 */
async function gotoHome(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

/**
 * Nettoie localStorage (supprime la clé "theme") avant le chargement de page.
 * Utilise addInitScript pour s'exécuter avant tous les scripts de la page
 * (y compris le beforeInteractive Script dans layout.tsx).
 */
async function clearStorage(page: Page) {
  await page.addInitScript(() => localStorage.removeItem("theme"));
}

/**
 * Configure le localStorage AVANT le chargement de la page.
 * Utilise addInitScript pour garantir l'ordre: init script → beforeInteractive → React.
 */
async function setStorage(page: Page, value: string) {
  await page.addInitScript((v) => localStorage.setItem("theme", v), value);
}

// ========================================================================== //
//  ThemeToggle — État initial (dark mode par défaut)                          //
//  Vérifie que sans localStorage, avec prefers-color-scheme: dark, le         //
//  composant s'affiche correctement en mode sombre.                           //
// ========================================================================== //

test.describe("ThemeToggle — État initial (dark mode par défaut)", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    // Simule une préférence système sombre
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);
  });

  test("icône Sun visible et aria-label 'Passer en mode clair' en mode dark", async ({ page }) => {
    // Le bouton doit avoir l'aria-label indiquant qu'on peut passer en mode clair
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();
    // L'icône Sun (lucide-sun) doit être présente
    await expect(toggleBtn.locator(".lucide-sun")).toBeVisible();
  });

  test("document.documentElement a la classe 'dark' initialement", async ({ page }) => {
    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(true);
  });

  test("icône Moon PAS visible en mode dark", async ({ page }) => {
    // Le bouton "Passer en mode sombre" (mode light) ne doit pas être visible
    await expect(page.getByRole("button", { name: ARIA_LIGHT })).toHaveCount(0);
    // L'icône Moon ne doit pas être visible dans le header
    await expect(page.locator(".lucide-moon")).toHaveCount(0);
  });
});

// ========================================================================== //
//  ThemeToggle — Flash Prevention                                              //
//  Vérifie que le script beforeInteractive injecte la classe dark avant        //
//  l'hydratation React, évitant un flash de thème incorrect au chargement.     //
// ========================================================================== //

test.describe("ThemeToggle — Flash Prevention", () => {
  test("le beforeInteractive Script injecte 'dark' sur le htmlElement avant hydratation", async ({
    page,
  }) => {
    let initialClass = "";
    await page.addInitScript(() => {
      initialClass = document.documentElement.className;
      // Store it so we can read it later
      (window as any).__initialHtmlClass = document.documentElement.className;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const savedClass = await page.evaluate(() => (window as any).__initialHtmlClass);
    // The beforeInteractive script runs after addInitScript but before React hydration
    // So the dark class should be present
    expect(savedClass).toContain("dark");
  });

  test("avec localStorage 'theme'='light' → pas de flash dark initial", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "light");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(false);
  });

  test("sans localStorage avec prefers-color-scheme:light → pas de classe dark", async ({
    page,
  }) => {
    await clearStorage(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(false);
  });

  test("le beforeInteractive s'exécute avant le rendu React (classe dark présente dès le premier paint)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__classAtFirstPaint = document.documentElement.className;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const firstPaintClass = await page.evaluate(() => (window as any).__classAtFirstPaint);
    expect(firstPaintClass).toContain("dark");
  });
});

// ========================================================================== //
//  ThemeToggle — Bascule vers le mode clair                                    //
//  Vérifie qu'un clic sur le toggle passe correctement en mode clair.         //
// ========================================================================== //

test.describe("ThemeToggle — Bascule vers le mode clair", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);
  });

  test("clic → localStorage.setItem('theme', 'light') est appelé", async ({ page }) => {
    // Au départ en mode dark
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await toggleBtn.click();

    // Vérifier la valeur dans localStorage
    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(theme).toBe("light");
  });

  test("après clic, icône Moon visible et aria-label 'Passer en mode sombre'", async ({ page }) => {
    await page.getByRole("button", { name: ARIA_DARK }).click();

    // Le bouton doit maintenant indiquer qu'on peut passer en mode sombre
    const toggleBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-moon")).toBeVisible();
  });

  test("après clic, document.documentElement perd la classe 'dark'", async ({ page }) => {
    await page.getByRole("button", { name: ARIA_DARK }).click();

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(false);
  });

  test("localStorage 'theme' a la valeur 'light' après clic", async ({ page }) => {
    await page.getByRole("button", { name: ARIA_DARK }).click();

    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(theme).toBe("light");
  });
});

// ========================================================================== //
//  ThemeToggle — Bascule retour vers le mode sombre                            //
//  Vérifie qu'un second clic repasse en mode dark.                            //
// ========================================================================== //

test.describe("ThemeToggle — Bascule retour vers le mode sombre", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);
    // Premier clic → mode clair
    await page.getByRole("button", { name: ARIA_DARK }).click();
  });

  test("second clic → localStorage 'theme' = 'dark', icône Sun réapparaît", async ({ page }) => {
    // Clic sur le bouton qui est maintenant en mode clair
    await page.getByRole("button", { name: ARIA_LIGHT }).click();

    // localStorage doit être 'dark'
    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(theme).toBe("dark");

    // L'icône Sun doit réapparaître
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-sun")).toBeVisible();
  });

  test("second clic → document.documentElement a la classe 'dark' à nouveau", async ({ page }) => {
    await page.getByRole("button", { name: ARIA_LIGHT }).click();

    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(true);
  });
});

// ========================================================================== //
//  ThemeToggle — Persistance localStorage                                      //
//  Vérifie que le thème est correctement restauré depuis localStorage          //
//  au chargement de la page.                                                  //
// ========================================================================== //

test.describe("ThemeToggle — Persistance localStorage", () => {
  test("localStorage 'theme' = 'light' → icône Moon visible au chargement", async ({ page }) => {
    await setStorage(page, "light");
    await gotoHome(page);

    // Mode light: icône Moon, aria-label "Passer en mode sombre"
    const toggleBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-moon")).toBeVisible();
  });

  test("localStorage 'theme' = 'dark' → icône Sun visible au chargement", async ({ page }) => {
    await setStorage(page, "dark");
    await gotoHome(page);

    // Mode dark: icône Sun, aria-label "Passer en mode clair"
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-sun")).toBeVisible();
  });

  test("localStorage 'theme' = 'xyz' (valeur invalide) → fallback préférence système", async ({
    page,
  }) => {
    // Configure une valeur invalide ET une préférence système sombre
    await page.addInitScript(() => localStorage.setItem("theme", "xyz"));
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);

    // Le composant devrait ignorer la valeur invalide et utiliser la préférence système (dark)
    // → icône Sun + aria-label "Passer en mode clair"
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-sun")).toBeVisible();

    // Vérifier que le HTML a la clase dark
    const hasDarkClass = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDarkClass).toBe(true);
  });

  test("le thème persiste après navigation vers une autre page", async ({ page }) => {
    await setStorage(page, "light");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to another page
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Theme should still be light
    const toggleBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-moon")).toBeVisible();
  });
});

// ========================================================================== //
//  ThemeToggle — Préférence système (prefers-color-scheme)                     //
//  Vérifie que le composant respecte la préférence système quand               //
//  localStorage n'a pas de valeur.                                            //
// ========================================================================== //

test.describe("ThemeToggle — Préférence système", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test("prefers-color-scheme: light → icône Moon visible", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await gotoHome(page);

    // Mode light: icône Moon
    const toggleBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-moon")).toBeVisible();
  });

  test("prefers-color-scheme: dark → icône Sun visible", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);

    // Mode dark: icône Sun
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn.locator(".lucide-sun")).toBeVisible();
  });
});

// ========================================================================== //
//  ThemeToggle — Accessibilité                                                 //
//  Vérifie les attributs ARIA et la navigation au clavier.                    //
// ========================================================================== //

test.describe("ThemeToggle — Accessibilité", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoHome(page);
  });

  test("aria-label correspond à l'état courant (dark → mode clair)", async ({ page }) => {
    // En mode dark, l'aria-label doit être "Passer en mode clair"
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();

    // Vérifier l'attribut aria-label directement
    const ariaLabel = await toggleBtn.getAttribute("aria-label");
    expect(ariaLabel).toBe(ARIA_DARK);
  });

  test("aria-label change après bascule (devient 'Passer en mode sombre')", async ({ page }) => {
    await page.getByRole("button", { name: ARIA_DARK }).click();

    // Après bascule vers light, l'aria-label doit être "Passer en mode sombre"
    const toggleBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(toggleBtn).toBeVisible();

    const ariaLabel = await toggleBtn.getAttribute("aria-label");
    expect(ariaLabel).toBe(ARIA_LIGHT);
  });

  test("bouton accessible au clavier — touche Enter déclenche la bascule", async ({ page }) => {
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();

    // Press Enter sur le bouton
    await toggleBtn.press("Enter");

    // Le thème doit avoir basculé en mode clair
    const lightBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(lightBtn).toBeVisible();

    // localStorage doit être 'light'
    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(theme).toBe("light");
  });

  test("bouton accessible au clavier — touche Espace déclenche la bascule", async ({ page }) => {
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });
    await expect(toggleBtn).toBeVisible();

    // Press Space sur le bouton
    await toggleBtn.press(" ");

    // Le thème doit avoir basculé en mode clair
    const lightBtn = page.getByRole("button", { name: ARIA_LIGHT });
    await expect(lightBtn).toBeVisible();

    // Vérifier la persistance dans localStorage
    const theme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(theme).toBe("light");
  });

  test("bouton est focusable (élément <button> natif)", async ({ page }) => {
    const toggleBtn = page.getByRole("button", { name: ARIA_DARK });

    // Vérifier que le bouton peut recevoir le focus
    await toggleBtn.focus();
    await expect(toggleBtn).toBeFocused();
  });
});
