import { test, expect } from "@playwright/test";

/**
 * Legal pages (Privacy / Terms) E2E tests for YouTube TrendHunter
 *
 * Tests the /privacy and /terms legal pages.
 * These are PUBLIC routes — no authentication required.
 *
 * Coverage includes:
 *   - /privacy: headings, content sections, logo, email, console errors, prose class
 *   - /terms: headings, content sections, logo, console errors
 *   - Meta tags (SEO) for both pages
 *   - Cross-page navigation between legal pages via the landing page footer hub
 */

/* -------------------------------------------------------------------------- */
/*  Privacy — Politique de confidentialité                                    */
/* -------------------------------------------------------------------------- */

test.describe("Privacy — Politique de confidentialité", () => {
  test("affiche le titre SEO par défaut", async ({ page }) => {
    await page.goto("/privacy");
    // Pages without a metadata export inherit the root layout default
    await expect(page).toHaveTitle("TrendHunter — Veille YouTube IA");
  });

  test("affiche la meta description SEO par défaut", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Détectez les tendances YouTube émergentes avant vos concurrents. Analyse IA, alertes temps réel, extension Chrome.",
    );
  });

  test("affiche le H1 « Politique de confidentialité »", async ({ page }) => {
    await page.goto("/privacy");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("Politique de confidentialité");
  });

  test("affiche « Dernière mise à jour » avec l'année en cours", async ({ page }) => {
    await page.goto("/privacy");

    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`Dernière mise à jour : ${currentYear}`)).toBeVisible();
  });

  test("affiche les 4 sections avec leurs titres", async ({ page }) => {
    await page.goto("/privacy");

    const sections = [
      "Collecte de données",
      "Utilisation des données",
      "Partage des données",
      "Vos droits",
    ];

    for (const title of sections) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("le logo TrendHunter est visible et lien vers /", async ({ page }) => {
    await page.goto("/privacy");

    const logo = page.locator("a[href='/']");
    await expect(logo).toBeVisible();
    await expect(logo).toContainText("TrendHunter");
  });

  test("l'email contact@trendhunter.app est visible dans la section « Vos droits »", async ({
    page,
  }) => {
    await page.goto("/privacy");

    const email = page.getByText("contact@trendhunter.app");
    await expect(email).toBeVisible();
  });

  test("le clic sur le logo redirige vers la page d'accueil", async ({ page }) => {
    await page.goto("/privacy");

    await page.locator("a[href='/']").first().click();
    await page.waitForURL("/");
    await expect(page.locator("h1")).toContainText("Hacker");
  });

  test("se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/privacy");
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("le contenu utilise la classe .prose.prose-invert", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page.locator(".prose.prose-invert")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Terms — Conditions Générales                                              */
/* -------------------------------------------------------------------------- */

test.describe("Terms — Conditions Générales", () => {
  test("affiche le titre SEO par défaut", async ({ page }) => {
    await page.goto("/terms");
    // Pages without a metadata export inherit the root layout default
    await expect(page).toHaveTitle("TrendHunter — Veille YouTube IA");
  });

  test("affiche la meta description SEO par défaut", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Détectez les tendances YouTube émergentes avant vos concurrents. Analyse IA, alertes temps réel, extension Chrome.",
    );
  });

  test("affiche le H1 « Conditions Générales d'Utilisation »", async ({ page }) => {
    await page.goto("/terms");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("Conditions Générales d'Utilisation");
  });

  test("affiche « Dernière mise à jour » avec l'année en cours", async ({ page }) => {
    await page.goto("/terms");

    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`Dernière mise à jour : ${currentYear}`)).toBeVisible();
  });

  test("affiche les 5 sections avec leurs titres", async ({ page }) => {
    await page.goto("/terms");

    const sections = [
      "1. Acceptation des conditions",
      "2. Description du service",
      "3. Abonnements",
      "4. Propriété intellectuelle",
      "5. Limitation de responsabilité",
    ];

    for (const title of sections) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("le logo TrendHunter est visible", async ({ page }) => {
    await page.goto("/terms");

    const logo = page.locator("a[href='/']");
    await expect(logo).toBeVisible();
    await expect(logo).toContainText("TrendHunter");
  });

  test("le clic sur le logo redirige vers la page d'accueil", async ({ page }) => {
    await page.goto("/terms");

    await page.locator("a[href='/']").first().click();
    await page.waitForURL("/");
    await expect(page.locator("h1")).toContainText("Hacker");
  });

  test("se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/terms");
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Navigation entre pages légales                                            */
/* -------------------------------------------------------------------------- */

test.describe("Navigation entre pages légales", () => {
  test("navigation /privacy → /terms sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText("Politique de confidentialité");

    await page.goto("/terms");
    await expect(page.locator("h1")).toContainText("Conditions Générales");

    expect(errors).toHaveLength(0);
  });

  test("navigation /terms → /privacy sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/terms");
    await expect(page.locator("h1")).toContainText("Conditions Générales");

    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText("Politique de confidentialité");

    expect(errors).toHaveLength(0);
  });
});
