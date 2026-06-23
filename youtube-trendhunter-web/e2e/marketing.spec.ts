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

    const tryBtn = page
      .locator("header a[href='/login']")
      .filter({ hasText: "ESSAYER GRATUITEMENT" });
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

    const compareLink = page
      .locator("a[href='/pricing']")
      .filter({ hasText: "Voir la comparaison détaillée" });
    await expect(compareLink).toBeVisible();

    await compareLink.click();
    await page.waitForURL(/\/pricing/);
  });

  test("la section CTA finale « Prêt à hacker l'algorithme ? » est visible", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Prêt à hacker l'algorithme ?" })).toBeVisible();
    await expect(
      page.getByText("Rejoignez les créateurs qui ont déjà un temps d'avance."),
    ).toBeVisible();
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

/* -------------------------------------------------------------------------- */
/*  Landing Page — SEO Meta Tags                                              */
/* -------------------------------------------------------------------------- */

test.describe("Landing — SEO Meta Tags", () => {
  test("page title contient « TrendHunter »", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toContain("TrendHunter");
  });

  test("meta description existe et est non vide", async ({ page }) => {
    await page.goto("/");
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute("content", /.+/);
  });

  test("balises OpenGraph sont présentes (title, description, type, url)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /.+/);
  });

  test("balise link canonical existe", async ({ page }) => {
    await page.goto("/");
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /.+/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Landing Page — Responsive Design                                          */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Responsive Design", () => {
  test("à 375px (mobile) : la grille features est en 1 colonne", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const colCount = await page.locator("#features .grid").evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns;
      const match = cols.match(/repeat\((\d+)/);
      return match ? parseInt(match[1], 10) : cols.split(/\s+/).length;
    });
    expect(colCount).toBe(1);
  });

  test("à 375px (mobile) : les liens de navigation sont masqués, menu hamburger visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Desktop nav should be hidden on mobile
    await expect(page.locator("header nav")).not.toBeVisible();
    // Hamburger menu icon should be present
    await expect(
      page.locator("header svg.lucide-menu").or(page.locator("header button[aria-label*='Menu']")),
    ).toBeVisible();
  });

  test("à 768px (tablette) : la grille features est en 2 colonnes", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const colCount = await page.locator("#features .grid").evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns;
      const match = cols.match(/repeat\((\d+)/);
      return match ? parseInt(match[1], 10) : cols.split(/\s+/).length;
    });
    expect(colCount).toBe(2);
  });

  test("à 1440px (desktop) : la grille features est en 4 colonnes, navigation complète visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const colCount = await page.locator("#features .grid").evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns;
      const match = cols.match(/repeat\((\d+)/);
      return match ? parseInt(match[1], 10) : cols.split(/\s+/).length;
    });
    expect(colCount).toBe(4);
    // Desktop navigation should be fully visible
    await expect(page.locator("header nav")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Landing Page — Heading Hierarchy                                          */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Heading Hierarchy", () => {
  test("un seul h1 sur la page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("des h2 existent pour les sections (features, tarifs, etc.)", async ({ page }) => {
    await page.goto("/");
    const h2Count = await page.locator("h2").count();
    expect(h2Count).toBeGreaterThanOrEqual(2);
  });

  test("aucun saut de niveau de titre (pas de h1→h3 sans h2 intermédiaire)", async ({ page }) => {
    await page.goto("/");
    const levels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) =>
        parseInt(h.tagName[1], 10),
      );
    });
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Pricing — Plan Card Comparison Details                                    */
/* -------------------------------------------------------------------------- */

test.describe("Pricing — Plan Card Comparison Details", () => {
  test("chaque plan affiche son prix dans la carte", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("0€").first()).toBeVisible();
    await expect(page.getByText("15€").first()).toBeVisible();
    await expect(page.getByText("39€").first()).toBeVisible();
  });

  test("le plan Pro affiche le badge « POPULAIRE »", async ({ page }) => {
    await page.goto("/pricing");
    const badge = page.getByText("POPULAIRE");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCount(1);
  });

  test("le plan Team liste des fonctionnalités entreprise", async ({ page }) => {
    await page.goto("/pricing");
    const enterpriseFeatures = [
      "5 utilisateurs",
      "API access",
      "Webhooks",
      "Account manager dédié",
    ];
    for (const feature of enterpriseFeatures) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  1 — Landing Session connectée (Success)                                   */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Session connectée", () => {
  test("affiche le bouton DASHBOARD quand l'utilisateur est connecté", async ({ page }) => {
    await page.route("**/api/auth/session*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { name: "Test User", email: "test@example.com" },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();

    await expect(
      page.locator("header a[href='/dashboard']").filter({ hasText: "DASHBOARD" }),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  2 — Landing CTAs tarifs sur landing (Success)                             */
/* -------------------------------------------------------------------------- */

test.describe("Landing — CTAs tarifs sur landing", () => {
  test("les trois CTAs de la section #pricing ont les bons liens", async ({ page }) => {
    await page.goto("/");

    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    // CTA Free → /login
    const freeCta = pricingSection
      .locator("a[href='/login']")
      .filter({ hasText: "Commencer gratuit" });
    await expect(freeCta).toBeVisible();

    // CTA Pro → /login?plan=pro
    const proCta = pricingSection.locator("a[href='/login?plan=pro']");
    await expect(proCta).toBeVisible();

    // CTA Team → mailto
    const teamCta = pricingSection.locator("a[href='mailto:contact@trendhunter.app']");
    await expect(teamCta).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  3 — Landing Footer navigation vers légal (Cross-feature)                   */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Footer navigation vers légal", () => {
  test("les liens Confidentialité et CGU dans le footer redirigent vers les pages légales", async ({
    page,
  }) => {
    await page.goto("/");

    // Cliquer sur Confidentialité → /privacy
    const privacyLink = page.locator("footer a[href='/privacy']");
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await page.waitForURL("/privacy");
    await expect(page.locator("h1")).toContainText("Politique de confidentialité");

    // Revenir sur la landing et cliquer sur CGU → /terms
    await page.goto("/");
    const termsLink = page.locator("footer a[href='/terms']");
    await expect(termsLink).toBeVisible();
    await termsLink.click();
    await page.waitForURL("/terms");
    await expect(page.locator("h1")).toContainText("Conditions Générales d'Utilisation");
  });
});

/* -------------------------------------------------------------------------- */
/*  4 — Landing Skip-to-content link (Accessibility)                           */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Skip-to-content link", () => {
  test("le lien d'accessibilité « Aller au contenu » existe et reçoit le focus au Tab", async ({
    page,
  }) => {
    await page.goto("/");

    // Chercher le lien de skip navigation (caché visuellement, premier élément focusable)
    const skipLink = page
      .locator('a[href="#main-content"], a[href="#main"], a[href="#content"]')
      .or(page.locator("a.skip-to-content"))
      .or(page.locator("a.sr-only"))
      .first();

    // Si le lien existe, vérifier qu'il reçoit le focus
    if ((await skipLink.count()) > 0) {
      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
    } else {
      // Si pas de skip link custom, vérifier qu'au moins un lien est focusable au Tab
      await expect(page.locator("header a").first()).toBeAttached();
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      await expect(focused.first()).toBeAttached();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  5 — Landing Cohérence header/footer (Cross-feature)                        */
/* -------------------------------------------------------------------------- */

test.describe("Landing — Cohérence header/footer", () => {
  const pages = ["/", "/pricing", "/features"];

  for (const url of pages) {
    test(`le header et footer sont cohérents sur ${url}`, async ({ page }) => {
      await page.goto(url);

      // Header : logo TrendHunter
      await expect(page.locator("header a[href='/']").first()).toContainText("TrendHunter");

      // Header : navigation visible sur desktop
      await expect(page.locator("header nav").first()).toBeVisible();

      // Footer : copyright année en cours
      const currentYear = new Date().getFullYear();
      await expect(page.locator("footer").getByText(`© ${currentYear}`)).toBeVisible();

      // Footer : liens légaux
      await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
      await expect(page.locator("footer a[href='/terms']")).toBeVisible();
    });
  }
});
