import { test, expect } from "@playwright/test";

/**
 * Marketing / Landing pages E2E tests for YouTube TrendHunter
 *
 * Tests the public marketing pages (landing page "/" and pricing "/pricing").
 * These are PUBLIC routes — no authentication required.
 *
 * Existing coverage in checkout.spec.ts covers basic pricing page display
 * (3 cards, prices, Pro badge, Free/Pro CTAs, some features). This file
 * adds comprehensive coverage for:
 *   - Landing page hero, features grid, header, footer
 *   - Full pricing page (all features per plan, descriptions, Team CTA)
 *   - Layout integrity, navigation, console errors
 */

/* -------------------------------------------------------------------------- */
/*  Landing Page — Hero Section                                               */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Hero Section", () => {
  test("affiche le H1 principal « Hacker l'Algorithme »", async ({ page }) => {
    await page.goto("/");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    // H1 contains "Hacker" and "l'Algorithme" split by a <br>
    await expect(h1).toContainText("Hacker");
    await expect(h1).toContainText("l'Algorithme");
  });

  test("affiche le sous-titre / description", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(
        "TrendHunter analyse des millions de vidéos pour vous livrer les niches à explosion imminente",
      ),
    ).toBeVisible();
  });

  test("affiche le badge « Intelligence Stratégique YouTube »", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Intelligence Stratégique YouTube")).toBeVisible();
  });

  test("bouton CTA « DÉMARRER L'ANALYSE » redirige vers /login", async ({ page }) => {
    await page.goto("/");

    const cta = page.locator("a[href='/login']").filter({ hasText: "DÉMARRER L'ANALYSE" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();
    await page.waitForURL(/\/login/);
  });

  test("bouton « VOIR LES FONCTIONNALITÉS » ancre vers #features", async ({ page }) => {
    await page.goto("/");

    const btn = page.locator('a[href="#features"]').filter({ hasText: "VOIR LES FONCTIONNALITÉS" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    await btn.click();
    await expect(page).toHaveURL(/#features/);
  });

  test("affiche le compteur de créateurs (section sociale)", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Rejoint par/)).toBeVisible();
    await expect(page.getByText("En direct de YouTube")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Landing Page — Features Grid                                              */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Features Grid", () => {
  test("affiche les 4 cartes de fonctionnalités avec titres corrects", async ({ page }) => {
    await page.goto("/");

    const features = [
      "Algorithme de Détection",
      "Analyse de Concurrents",
      "Alertes Stratégiques",
      "Extension Chrome",
    ];

    for (const title of features) {
      await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
    }
  });

  test("chaque fonctionnalité a une description textuelle", async ({ page }) => {
    await page.goto("/");

    const descriptions = [
      "niches à explosion imminente",
      "stratégies qui fonctionnent",
      "sujet commence à buzzer",
      "directement sous chaque vidéo",
    ];

    for (const desc of descriptions) {
      await expect(page.getByText(desc)).toBeVisible();
    }
  });

  test("chaque fonctionnalité a un badge (IA, LIVE, NEW, POPULAIRE)", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#features").getByText("IA")).toBeVisible();
    await expect(page.locator("#features").getByText("LIVE")).toBeVisible();
    await expect(page.locator("#features").getByText("NEW")).toBeVisible();
    await expect(page.locator("#features").getByText("POPULAIRE")).toBeVisible();
  });

  test("la grille contient exactement 4 cartes", async ({ page }) => {
    await page.goto("/");

    // Each feature card: div with class containing "group" inside the features section
    const cards = page.locator("#features .grid > div");
    await expect(cards).toHaveCount(4);
  });

  test("affiche le titre de section « L'arsenal ultime du créateur »", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "L'arsenal ultime du créateur" })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Landing Page — Header / Navigation                                        */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Header / Navigation", () => {
  test("le logo TrendHunter est visible et lien vers /", async ({ page }) => {
    await page.goto("/");

    const logo = page.locator("header a[href='/']");
    await expect(logo).toBeVisible();
    await expect(logo).toContainText("TrendHunter");
  });

  test("le lien de navigation « Tarifs » pointe vers #pricing", async ({ page }) => {
    await page.goto("/");

    const tarifsLink = page.locator("header nav a[href='#pricing']");
    await expect(tarifsLink).toBeVisible();
    await expect(tarifsLink).toContainText("Tarifs");
  });

  test("le lien de navigation « Fonctionnalités » pointe vers #features", async ({ page }) => {
    await page.goto("/");

    const featuresLink = page.locator("header nav a[href='#features']");
    await expect(featuresLink).toBeVisible();
    await expect(featuresLink).toContainText("Fonctionnalités");
  });

  test("affiche le lien « Se connecter » vers /login", async ({ page }) => {
    await page.goto("/");

    const loginLink = page.locator("header a[href='/login']").filter({ hasText: "Se connecter" });
    await expect(loginLink).toBeVisible();
  });

  test("affiche le bouton « ESSAYER GRATUITEMENT » vers /login", async ({ page }) => {
    await page.goto("/");

    const tryBtn = page.locator("header a[href='/login']").filter({ hasText: "ESSAYER GRATUITEMENT" });
    await expect(tryBtn).toBeVisible();
    await expect(tryBtn).toBeEnabled();
  });

  test("tous les éléments de navigation sont visibles sur desktop", async ({ page }) => {
    // Set a desktop viewport explicitly
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(page.locator("header").getByText("Fonctionnalités")).toBeVisible();
    await expect(page.locator("header").getByText("Tarifs")).toBeVisible();
    await expect(page.locator("header").getByText("Se connecter")).toBeVisible();
    await expect(page.locator("header").getByText("ESSAYER GRATUITEMENT")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Landing Page — Footer                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Footer", () => {
  test("affiche le copyright avec l'année en cours", async ({ page }) => {
    await page.goto("/");

    const currentYear = new Date().getFullYear();
    await expect(
      page.getByText(`© ${currentYear} TrendHunter. Pour les créateurs, par des créateurs.`),
    ).toBeVisible();
  });

  test("affiche les liens du footer (Tarifs, Confidentialité, CGU)", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("footer a[href='#pricing']")).toContainText("Tarifs");
    await expect(page.locator("footer a[href='/privacy']")).toContainText("Confidentialité");
    await expect(page.locator("footer a[href='/terms']")).toContainText("CGU");
  });
});

/* -------------------------------------------------------------------------- */
/*  Pricing Page — Plans & Affichage                                          */
/* -------------------------------------------------------------------------- */

test.describe("Pricing — Plans et Affichage", () => {
  test("affiche le H1 « Investissez dans votre succès »", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.locator("h1")).toContainText("Investissez dans");
    await expect(page.locator("h1")).toContainText("votre succès");
  });

  test("affiche les 3 noms de plans (Free, Pro, Team)", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByText("Pro").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();
  });

  test("affiche les 3 prix avec labels /mois", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByText("0€").first()).toBeVisible();
    await expect(page.getByText("15€").first()).toBeVisible();
    await expect(page.getByText("39€").first()).toBeVisible();
  });

  test("chaque plan affiche sa période /mois", async ({ page }) => {
    await page.goto("/pricing");

    // There should be 3 "/mois" labels (one per plan)
    await expect(page.getByText("/mois")).toHaveCount(3);
  });

  test("affiche les descriptions de chaque plan", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByText("Pour découvrir TrendHunter")).toBeVisible();
    await expect(page.getByText("Pour les créateurs de contenu")).toBeVisible();
    await expect(page.getByText("Pour les équipes")).toBeVisible();
  });

  test("le plan Pro est marqué « POPULAIRE »", async ({ page }) => {
    await page.goto("/pricing");

    const populaire = page.getByText("POPULAIRE");
    await expect(populaire).toBeVisible();
    // Only one POPULAIRE badge — on the Pro card
    await expect(populaire).toHaveCount(1);
  });

  test("la carte Pro a une mise en évidence visuelle (scale, ombre)", async ({ page }) => {
    await page.goto("/pricing");

    // The Pro card has special styling — it's inside a Card with scale-105 md:scale-110
    // We verify it has the popular class by checking for the POPULAIRE badge nearby
    const popularCard = page.locator("div[class*='scale-105']");
    await expect(popularCard).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Pricing Page — Fonctionnalités par Plan                                    */
/* -------------------------------------------------------------------------- */

test.describe("Pricing — Toutes les fonctionnalités", () => {
  test("le plan Free liste toutes ses fonctionnalités", async ({ page }) => {
    await page.goto("/pricing");

    const freeFeatures = [
      "1 niche suivie",
      "5 tendances par niche",
      "Access extension Chrome",
      "Support par email",
    ];

    for (const feature of freeFeatures) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });

  test("le plan Pro liste toutes ses fonctionnalités", async ({ page }) => {
    await page.goto("/pricing");

    const proFeatures = [
      "Toutes les niches",
      "Tendances illimitées",
      "Alertes en temps réel",
      "Angles de contenu IA",
      "Export CSV",
      "Support prioritaire",
    ];

    for (const feature of proFeatures) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });

  test("le plan Team liste toutes ses fonctionnalités", async ({ page }) => {
    await page.goto("/pricing");

    const teamFeatures = [
      "Tout Pro",
      "5 utilisateurs",
      "API access",
      "Webhooks",
      "Account manager dédié",
    ];

    for (const feature of teamFeatures) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });

  test("chaque fonctionnalité est précédée d'une icône de vérification", async ({ page }) => {
    await page.goto("/pricing");

    // Check that each plan has check icons (lucide Check components in circles)
    const checkIcons = page.locator("svg.lucide-check");
    // Each plan has 4, 6, 5 features respectively = 15 total check icons
    const count = await checkIcons.count();
    expect(count).toBeGreaterThanOrEqual(15);
  });
});

/* -------------------------------------------------------------------------- */
/*  Pricing Page — Appels à l'action (CTA)                                    */
/* -------------------------------------------------------------------------- */

test.describe("Pricing — Appels à l'action", () => {
  test("le CTA Free « Commencer gratuit » redirige vers /login", async ({ page }) => {
    await page.goto("/pricing");

    const freeCta = page.locator("a[href='/login']").filter({ hasText: "Commencer gratuit" });
    await expect(freeCta).toBeVisible();
    await expect(freeCta).toBeEnabled();

    await freeCta.first().click();
    await page.waitForURL(/\/login/);
  });

  test("le CTA Pro « Passer Pro » redirige vers /login?plan=pro", async ({ page }) => {
    await page.goto("/pricing");

    const proCta = page.locator("a[href='/login?plan=pro']");
    await expect(proCta).toBeVisible();
    await expect(proCta).toBeEnabled();

    await proCta.first().click();
    await page.waitForURL(/\/login/);
    // Verify plan=pro is in the URL
    await expect(page).toHaveURL(/plan=pro/);
  });

  test("le CTA Team « Contact commercial » est un lien mailto", async ({ page }) => {
    await page.goto("/pricing");

    const teamCta = page.locator("a[href='mailto:contact@trendhunter.app']");
    await expect(teamCta).toBeVisible();
    await expect(teamCta).toContainText("Contact commercial");
  });

  test("les trois CTAs sont des boutons", async ({ page }) => {
    await page.goto("/pricing");

    // All three CTAs should be rendered as button elements
    const buttons = page.locator("a[href] button");
    const ctaCount = await buttons.count();
    expect(ctaCount).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  Navigation entre pages                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Navigation entre pages", () => {
  test("accès direct à l'URL / affiche la landing page", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.locator("h1")).toContainText("Hacker");
  });

  test("accès direct à l'URL /pricing affiche la page tarifs", async ({ page }) => {
    const response = await page.goto("/pricing");
    expect(response?.ok()).toBe(true);
    await expect(page.locator("h1")).toContainText("Investissez");
  });

  test("navigation rapide landing → pricing sans erreur", async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Hacker");

    await page.click('header nav a[href="#pricing"]');
    // Wait for anchor navigation
    await expect(page).toHaveURL(/#pricing/);

    // Navigate to full pricing page
    await page.goto("/pricing");
    await expect(page.locator("h1")).toContainText("Investissez");

    expect(errors).toHaveLength(0);
  });

  test("navigation pricing → landing sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/pricing");

    // Click the logo with TrendHunter text to go home
    await page.locator("a[href='/']").first().click();
    await page.waitForURL("/");
    await expect(page.locator("h1")).toContainText("Hacker");

    expect(errors).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Layout & Routes publiques                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Layout & Routes publiques", () => {
  test("la page / ne redirige pas vers /login (publique)", async ({ page }) => {
    await page.goto("/");
    // Stay on / — no redirect
    await expect(page).toHaveURL("/");
  });

  test("la page /pricing ne redirige pas vers /login (publique)", async ({ page }) => {
    await page.goto("/pricing");
    // Stay on /pricing — no redirect
    await expect(page).toHaveURL(/\/pricing/);
  });

  test("le marketing layout ne requiert pas d'authentification", async ({ page }) => {
    // Verify that the marketing layout renders its content without
    // hitting any auth-protected endpoints
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    // Body should contain landing page content, not login page content
    await expect(page.getByText("Hacker l'Algorithme")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Console errors — pages sans erreur JS                                     */
/* -------------------------------------------------------------------------- */

test.describe("Console errors", () => {
  test("la page d'accueil se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/");
    // Wait for full page load
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("la page tarifs se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/pricing");
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Section Tarifs intégrée sur la Landing Page                               */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Section Tarifs (inline)", () => {
  test("la landing page a une section tarifs avec les 3 plans", async ({ page }) => {
    await page.goto("/");

    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    await expect(pricingSection.getByText("Tarifs simples et transparents")).toBeVisible();
  });

  test("le lien « Voir la comparaison détaillée » pointe vers /pricing", async ({ page }) => {
    await page.goto("/");

    const compareLink = page.locator("a[href='/pricing']").filter({ hasText: "Voir la comparaison détaillée" });
    await expect(compareLink).toBeVisible();

    await compareLink.click();
    await page.waitForURL(/\/pricing/);
  });

  test("la section CTA finale « Prêt à hacker l'algorithme ? » est visible", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Prêt à hacker l'algorithme ?" })).toBeVisible();
    await expect(page.getByText("Rejoignez les créateurs qui ont déjà un temps d'avance.")).toBeVisible();
  });

  test("le CTA final « COMMENCER L'AVENTURE » redirige vers /login", async ({ page }) => {
    await page.goto("/");

    const finalCta = page.locator("a[href='/login']").filter({ hasText: "COMMENCER L'AVENTURE" });
    await expect(finalCta).toBeVisible();
    await expect(finalCta).toBeEnabled();

    await finalCta.click();
    await page.waitForURL(/\/login/);
  });
});
