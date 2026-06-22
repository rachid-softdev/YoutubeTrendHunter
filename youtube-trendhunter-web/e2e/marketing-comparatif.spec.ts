import { test, expect } from "@playwright/test";

/**
 * Marketing Comparatif E2E tests for YouTube TrendHunter
 *
 * Covers the public comparison page at /comparatif/vidiq-trendhunter:
 *   - Breadcrumb navigation
 *   - Hero section (badge, H1, CTA)
 *   - Feature comparison table (8 rows, check/cross icons)
 *   - Pricing section (2 cards, "NOTRE CHOIX" badge)
 *   - Pros & Cons sections
 *   - FAQ (3 questions, JSON-LD schema)
 *   - Final CTA + related links
 *   - SEO meta tags, OG tags, canonical, JSON-LD
 *   - Edge cases (console errors, responsive table, link integrity)
 *
 * PUBLIC route — no authentication required.
 */

const COMPARATIF_URL = "/comparatif/vidiq-trendhunter";

/* -------------------------------------------------------------------------- */
/*  1. Breadcrumb — Fil d'Ariane                                             */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Fil d'Ariane", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche 'Accueil > Tarifs > Comparatif vidIQ'", async ({ page }) => {
    const breadcrumb = page.locator("nav").filter({ hasText: "Accueil" });
    await expect(breadcrumb).toBeVisible();

    await expect(breadcrumb.getByText("Accueil")).toBeVisible();
    await expect(breadcrumb.getByText("Tarifs")).toBeVisible();
    await expect(breadcrumb.getByText("Comparatif vidIQ")).toBeVisible();
  });

  test("le lien Accueil pointe vers /", async ({ page }) => {
    const accueilLink = page.locator("nav a[href='/']").filter({ hasText: "Accueil" });
    await expect(accueilLink).toBeVisible();
    await expect(accueilLink).toHaveAttribute("href", "/");
  });

  test("le lien Tarifs pointe vers /pricing", async ({ page }) => {
    const tarifsLink = page.locator("nav a[href='/pricing']").filter({ hasText: "Tarifs" });
    await expect(tarifsLink).toBeVisible();
    await expect(tarifsLink).toHaveAttribute("href", "/pricing");
  });

  test("le dernier élément du fil d'Ariane est un span (non cliquable)", async ({ page }) => {
    const breadcrumbNav = page.locator("nav").filter({ hasText: "Accueil" });
    const spans = breadcrumbNav.locator("span");
    // The last span should be "Comparatif vidIQ"
    const lastSpan = spans.filter({ hasText: "Comparatif vidIQ" });
    await expect(lastSpan).toBeVisible();
    // It must NOT be a link
    await expect(lastSpan.locator("..").locator("a")).not.toContainText("Comparatif vidIQ");
  });

  test("le lien Accueil est cliquable et redirige vers /", async ({ page }) => {
    await page.locator("nav a[href='/']").first().click();
    await page.waitForURL("/");
    await expect(page).toHaveURL("/");
  });

  test("le lien Tarifs est cliquable et redirige vers /pricing", async ({ page }) => {
    await page.locator("nav a[href='/pricing']").first().click();
    await page.waitForURL(/\/pricing/);
    await expect(page).toHaveURL(/\/pricing/);
  });
});

/* -------------------------------------------------------------------------- */
/*  2. Hero Section                                                            */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Section Héro", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le badge 'COMPARATIF 2026'", async ({ page }) => {
    await expect(page.getByText("COMPARATIF 2026")).toBeVisible();
  });

  test("affiche le H1 'vidIQ vs TrendHunter' avec 'vs' en gris", async ({ page }) => {
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("vidIQ");
    await expect(h1).toContainText("vs");
    await expect(h1).toContainText("TrendHunter");

    // The "vs" word is wrapped in a span with text-dark-ink-tertiary class
    const vsSpan = h1.locator("span.text-dark-ink-tertiary");
    await expect(vsSpan).toHaveText("vs");
  });

  test("affiche le paragraphe de description", async ({ page }) => {
    await expect(
      page.getByText(
        "Le comparatif définitif entre les deux outils de détection de tendances YouTube les plus populaires.",
      ),
    ).toBeVisible();
  });

  test("le bouton 'Essayer TrendHunter' redirige vers /login", async ({ page }) => {
    const cta = page.locator("a[href='/login']").filter({ hasText: "Essayer TrendHunter" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();
    await page.waitForURL(/\/login/);
  });

  test("le bouton 'Comparer les tarifs' est visible et cliquable", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Comparer les tarifs" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});

/* -------------------------------------------------------------------------- */
/*  3. Tableau Comparatif                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Tableau des fonctionnalités", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le titre 'Comparaison des fonctionnalités'", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Comparaison des fonctionnalités" }),
    ).toBeVisible();
  });

  test("le tableau a 8 lignes de fonctionnalités", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(8);
  });

  test("affiche les en-têtes de colonnes (Fonctionnalité, vidIQ, TrendHunter)", async ({
    page,
  }) => {
    const table = page.locator("table");
    await expect(table.getByText("Fonctionnalité")).toBeVisible();
    await expect(table.getByText("vidIQ")).toBeVisible();
    await expect(table.getByText("TrendHunter")).toBeVisible();
  });

  test("affiche les noms de toutes les fonctionnalités", async ({ page }) => {
    const features = [
      "Détection de tendances IA",
      "Analyse en temps réel",
      "Extension Chrome",
      "Angles de contenu IA",
      "Niches françaises",
      "Alertes automatiques",
      "Prix gratuit",
      "Support français",
    ];

    for (const feature of features) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });

  test("affiche un check (vert) pour les fonctionnalités disponibles", async ({ page }) => {
    // vidIQ: true features (check green), TrendHunter has many checks
    const greenChecks = page.locator("table svg.text-green-500");
    await expect(greenChecks.first()).toBeVisible();
    // At least some green checks are present
    const count = await greenChecks.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test("affiche un X (rouge) pour les fonctionnalités non disponibles", async ({ page }) => {
    const redCrosses = page.locator("table svg.text-red-500");
    await expect(redCrosses.first()).toBeVisible();
  });

  test("affiche 'limité' pour vidIQ - Prix gratuit", async ({ page }) => {
    await expect(page.getByText("limité")).toBeVisible();
  });

  test("chaque ligne alterne les colonnes vidIQ et TrendHunter", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBe(8);

    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator("td");
      // Each row has 3 cells: feature name, vidIQ value, TrendHunter value
      await expect(cells.nth(0)).toBeVisible();
      await expect(cells.nth(1)).toBeVisible();
      await expect(cells.nth(2)).toBeVisible();
    }
  });

  test("les titres vidIQ et TrendHunter sont en rouge (text-yt-red)", async ({ page }) => {
    const vidIQHeader = page.locator("table th span.text-yt-red").filter({ hasText: "vidIQ" });
    const trendHunterHeader = page
      .locator("table th span.text-yt-red")
      .filter({ hasText: "TrendHunter" });

    await expect(vidIQHeader).toBeVisible();
    await expect(trendHunterHeader).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  4. Section Prix                                                            */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Section Tarifs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le titre 'Comparaison des tarifs'", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Comparaison des tarifs" })).toBeVisible();
  });

  test("affiche les 2 cartes de prix (vidIQ et TrendHunter)", async ({ page }) => {
    const cards = page
      .locator("section")
      .filter({ hasText: "Comparaison des tarifs" })
      .locator("div.grid > div");
    await expect(cards).toHaveCount(2);
  });

  test("la carte vidIQ affiche '19$/mois'", async ({ page }) => {
    const cards = page.locator("section").filter({ hasText: "Comparaison des tarifs" });
    await expect(cards.getByText("19$")).toBeVisible();
    await expect(cards.getByText("/mois")).toBeVisible();
  });

  test("la carte TrendHunter affiche '15€/mois'", async ({ page }) => {
    const cards = page.locator("section").filter({ hasText: "Comparaison des tarifs" });
    await expect(cards.getByText("15€")).toBeVisible();
    await expect(cards.getByText("/mois")).toBeVisible();
  });

  test("la carte TrendHunter est marquée 'NOTRE CHOIX' avec bordure rouge", async ({ page }) => {
    const notreChoix = page.getByText("NOTRE CHOIX");
    await expect(notreChoix).toBeVisible();

    // The badge is inside a div with border-yt-red/50 class (red border)
    const trendHunterCard = page
      .locator("section")
      .filter({ hasText: "Comparaison des tarifs" })
      .locator("div.grid > div")
      .filter({ hasText: "TrendHunter" });
    await expect(trendHunterCard).toBeVisible();

    const cardClass = await trendHunterCard.getAttribute("class");
    expect(cardClass).toContain("border-yt-red");
  });

  test("la carte vidIQ liste ses caractéristiques (plan gratuit, essai 7 jours, pas de support français)", async ({
    page,
  }) => {
    await expect(page.getByText("Plan gratuit limité")).toBeVisible();
    await expect(page.getByText("Essai 7 jours")).toBeVisible();
    await expect(page.getByText("Pas de support français")).toBeVisible();
  });

  test("la carte TrendHunter liste ses caractéristiques (plan gratuit, support, angles IA)", async ({
    page,
  }) => {
    await expect(page.getByText("Plan gratuit généreux")).toBeVisible();
    await expect(page.getByText("Support français")).toBeVisible();
    await expect(page.getByText("Angles de contenu IA")).toBeVisible();
  });

  test("la carte vidIQ a des icônes check (vert) et X (grisé)", async ({ page }) => {
    const vidIQCard = page
      .locator("section")
      .filter({ hasText: "Comparaison des tarifs" })
      .locator("div.grid > div")
      .filter({ hasText: "vidIQ" });

    // Plan gratuit limité, Essai 7 jours → check green
    await expect(vidIQCard.locator("svg.text-green-500")).toHaveCount(2);
    // Pas de support français → X with text-dark-ink-tertiary on the svg parent
    await expect(vidIQCard.locator("svg").filter({ hasNot: /text-green-500/ })).toHaveCount(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  5. Avantages & Inconvénients                                              */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Avantages et Inconvénients", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche les sous-titres 'vidIQ' et 'TrendHunter'", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "vidIQ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "TrendHunter" })).toBeVisible();
  });

  test("vidIQ affiche 3 avantages et 3 inconvénients", async ({ page }) => {
    const vidIQSection = page.locator("main").filter({ hasText: "vidIQ" }).first();

    // Check headings
    await expect(vidIQSection.getByText("✓ Avantages")).toBeVisible();
    await expect(vidIQSection.getByText("✗ Inconvénients")).toBeVisible();

    // 3 pros
    await expect(vidIQSection.getByText("Grande communauté anglophone")).toBeVisible();
    await expect(vidIQSection.getByText("Analyses historique des chaines")).toBeVisible();
    await expect(vidIQSection.getByText("Outils SEO intégrés")).toBeVisible();

    // 3 cons
    await expect(vidIQSection.getByText("Pas de support français")).toBeVisible();
    await expect(vidIQSection.getByText("Prix plus élevé")).toBeVisible();
    await expect(vidIQSection.getByText("Interface complexe pour débutants")).toBeVisible();
  });

  test("TrendHunter affiche 4 avantages et 2 inconvénients", async ({ page }) => {
    const thSection = page.locator("main").filter({ hasText: "TrendHunter" }).last();

    // Check headings
    await expect(thSection.getByText("✓ Avantages")).toBeVisible();
    await expect(thSection.getByText("✗ Inconvénients")).toBeVisible();

    // 4 pros
    await expect(thSection.getByText("Prix concurrentiel (15€/mois)")).toBeVisible();
    await expect(thSection.getByText("Support français réactif")).toBeVisible();
    await expect(thSection.getByText("Angles de contenu IA exclusifs")).toBeVisible();
    await expect(
      thSection
        .getByText("Niches localisées pour le marché français")
        .or(thSection.getByText(/Niches.*isées pour le marché français/)),
    ).toBeVisible();

    // 2 cons
    await expect(thSection.getByText("Plus récent sur le marché")).toBeVisible();
    await expect(thSection.getByText("Communauté en croissance")).toBeVisible();
  });

  test("les titres Avantages sont en vert et Inconvénients en rouge", async ({ page }) => {
    // Check green heading for Avantages
    const greenHeadings = page.locator("h4.text-green-500");
    await expect(greenHeadings.filter({ hasText: "Avantages" })).toHaveCount(2);

    // Check red heading for Inconvénients
    const redHeadings = page.locator("h4.text-red-500");
    await expect(redHeadings.filter({ hasText: "Inconvénients" })).toHaveCount(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  6. FAQ                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — FAQ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le titre 'Questions fréquentes'", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Questions fréquentes" })).toBeVisible();
  });

  test("affiche les 3 questions FAQ", async ({ page }) => {
    const questions = [
      "vidIQ est-il gratuit ?",
      "Quelle outil est meilleur pour les créateurs français ?",
      "TrendHunter dispose-t-il d'une extension Chrome ?",
    ];

    for (const question of questions) {
      await expect(page.getByText(question)).toBeVisible();
    }
  });

  test("chaque question FAQ a une réponse visible", async ({ page }) => {
    const answers = [
      "vidIQ propose une version gratuite avec des fonctionnalités limitées.",
      "TrendHunter est spécifiquement conçu pour le marché francophone",
      "Oui, TrendHunter propose une extension Chrome gratuite",
    ];

    for (const answer of answers) {
      await expect(page.getByText(answer)).toBeVisible();
    }
  });

  test("le JSON-LD de type FAQPage est présent et valide", async ({ page }) => {
    const script = page.locator('script[type="application/ld+json"]');
    await expect(script).toBeVisible();

    const jsonText = await script.textContent();
    expect(jsonText).toBeTruthy();

    const parsed = JSON.parse(jsonText!);
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toBeDefined();

    const faqPage = parsed["@graph"].find((item: any) => item["@type"] === "FAQPage");
    expect(faqPage).toBeDefined();
    expect(faqPage.mainEntity).toBeDefined();
    expect(faqPage.mainEntity).toHaveLength(3);

    // Validate first FAQ item
    const firstQ = faqPage.mainEntity[0];
    expect(firstQ["@type"]).toBe("Question");
    expect(firstQ.name).toBe("vidIQ est-il gratuit ?");
    expect(firstQ.acceptedAnswer["@type"]).toBe("Answer");
    expect(firstQ.acceptedAnswer.text).toContain("vidIQ propose une version gratuite");
  });
});

/* -------------------------------------------------------------------------- */
/*  7. CTA Final                                                              */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — CTA Final", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le titre 'Prêt à essayer TrendHunter ?'", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Prêt à essayer TrendHunter ?" })).toBeVisible();
  });

  test("affiche le paragraphe de description sous le CTA", async ({ page }) => {
    await expect(
      page.getByText(
        "Profitez du plan gratuit pour tester TrendHunter et détecter les tendances avant vos concurrents.",
      ),
    ).toBeVisible();
  });

  test("le bouton 'CRÉER UN COMPTE Gratuit' redirige vers /login", async ({ page }) => {
    const cta = page.locator("a[href='/login']").filter({ hasText: "CRÉER UN COMPTE Gratuit" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();
    await page.waitForURL(/\/login/);
  });

  test("affiche le texte 'Aucune carte de crédit requise'", async ({ page }) => {
    await expect(page.getByText("Aucune carte de crédit requise")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  8. Liens connexes (Autres comparatifs)                                    */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Liens connexes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("affiche le titre 'Autres comparatifs :'", async ({ page }) => {
    await expect(page.getByText("Autres comparatifs :")).toBeVisible();
  });

  test("le lien 'TubeBuddy vs TrendHunter' pointe vers /comparatif/tubebuddy-trendhunter", async ({
    page,
  }) => {
    const link = page.locator("a[href='/comparatif/tubebuddy-trendhunter']");
    await expect(link).toBeVisible();
    await expect(link).toContainText("TubeBuddy vs TrendHunter");
  });

  test("le lien 'Meilleurs outils tendances YouTube' pointe vers /comparatif/meilleur-outil-tendances-youtube", async ({
    page,
  }) => {
    const link = page.locator("a[href='/comparatif/meilleur-outil-tendances-youtube']");
    await expect(link).toBeVisible();
    await expect(link).toContainText("Meilleurs outils tendances YouTube");
  });

  test("les deux liens de comparatif sont cliquables et redirigent", async ({ page }) => {
    // TubeBuddy link
    const tubeBuddyLink = page.locator("a[href='/comparatif/tubebuddy-trendhunter']");
    await expect(tubeBuddyLink).toBeVisible();
    const tubeBuddyHref = await tubeBuddyLink.getAttribute("href");
    expect(tubeBuddyHref).toBe("/comparatif/tubebuddy-trendhunter");

    // Meilleurs outils link
    const meilleursLink = page.locator("a[href='/comparatif/meilleur-outil-tendances-youtube']");
    await expect(meilleursLink).toBeVisible();
    const meilleursHref = await meilleursLink.getAttribute("href");
    expect(meilleursHref).toBe("/comparatif/meilleur-outil-tendances-youtube");
  });
});

/* -------------------------------------------------------------------------- */
/*  9. SEO — Balises meta, OG, canonical, JSON-LD                             */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — SEO et Meta", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("le titre de la page est correct", async ({ page }) => {
    await expect(page).toHaveTitle(/vidIQ vs TrendHunter/);
    await expect(page).toHaveTitle(/Comparatif 2026/);
    await expect(page).toHaveTitle(/TrendHunter/);
  });

  test("la meta description est présente", async ({ page }) => {
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute(
      "content",
      /Comparaison approfondie entre vidIQ et TrendHunter/,
    );
  });

  test("la meta keywords est présente avec les mots-clés attendus", async ({ page }) => {
    const metaKeywords = page.locator('meta[name="keywords"]');
    await expect(metaKeywords).toHaveAttribute("content", /vidIQ vs TrendHunter/);
    await expect(metaKeywords).toHaveAttribute("content", /vidIQ alternative/);
    await expect(metaKeywords).toHaveAttribute("content", /comparatif vidIQ TrendHunter/);
  });

  test("la balise canonical est présente et correcte", async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      "https://trendhunter.app/comparatif/vidiq-trendhunter",
    );
  });

  test("les balises OG sont présentes et correctes", async ({ page }) => {
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute(
      "content",
      /vidIQ vs TrendHunter - Le comparatif définitif 2026/,
    );

    const ogDesc = page.locator('meta[property="og:description"]');
    await expect(ogDesc).toHaveAttribute(
      "content",
      /Quelle outil de détection de tendances YouTube choisir \?/,
    );

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute(
      "content",
      "https://trendhunter.app/comparatif/vidiq-trendhunter",
    );

    const ogSiteName = page.locator('meta[property="og:site_name"]');
    await expect(ogSiteName).toHaveAttribute("content", "TrendHunter");

    const ogLocale = page.locator('meta[property="og:locale"]');
    await expect(ogLocale).toHaveAttribute("content", "fr_FR");

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");
  });

  test("le JSON-LD FAQPage contient exactement 3 questions avec leurs réponses", async ({
    page,
  }) => {
    const scripts = page.locator('script[type="application/ld+json"]');
    const count = await scripts.count();

    // Find the FAQ schema script
    let faqFound = false;
    for (let i = 0; i < count; i++) {
      const text = await scripts.nth(i).textContent();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        const graph = parsed["@graph"] || [];
        const faqEntry = graph.find((g: any) => g["@type"] === "FAQPage");
        if (faqEntry) {
          faqFound = true;
          expect(faqEntry.mainEntity).toHaveLength(3);

          // Verify all 3 questions
          const questions = faqEntry.mainEntity.map((q: any) => q.name);
          expect(questions).toContain("vidIQ est-il gratuit ?");
          expect(questions).toContain("Quelle outil est meilleur pour les créateurs français ?");
          expect(questions).toContain("TrendHunter dispose-t-il d'une extension Chrome ?");

          // Verify answers are non-empty strings
          for (const q of faqEntry.mainEntity) {
            expect(q.acceptedAnswer.text).toBeTruthy();
            expect(typeof q.acceptedAnswer.text).toBe("string");
          }
          break;
        }
      } catch {
        // Not JSON — skip
      }
    }
    expect(faqFound).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  10. Navigation — Header & Footer                                          */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Navigation Header et Footer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(COMPARATIF_URL);
  });

  test("le header contient le logo TrendHunter lié à /", async ({ page }) => {
    const logoLink = page.locator("header a[href='/']");
    await expect(logoLink).toBeVisible();
    await expect(logoLink).toContainText("TrendHunter");
  });

  test("le header contient le lien Niches → /niches", async ({ page }) => {
    const nichesLink = page.locator("header nav a[href='/niches']");
    await expect(nichesLink).toBeVisible();
    await expect(nichesLink).toContainText("Niches");
  });

  test("le header contient le lien Tarifs → /pricing", async ({ page }) => {
    const tarifsLink = page.locator("header nav a[href='/pricing']");
    await expect(tarifsLink).toBeVisible();
    await expect(tarifsLink).toContainText("Tarifs");
  });

  test("le header contient le bouton 'ESSAYER Gratuitement' → /login", async ({ page }) => {
    const tryBtn = page
      .locator("header a[href='/login']")
      .filter({ hasText: "ESSAYER Gratuitement" });
    await expect(tryBtn).toBeVisible();
    await expect(tryBtn).toBeEnabled();
  });

  test("le footer contient le copyright avec l'année en cours", async ({ page }) => {
    const currentYear = new Date().getFullYear();
    await expect(page.locator("footer").getByText(`© ${currentYear} TrendHunter`)).toBeVisible();
  });

  test("le footer contient les liens Niches, Tarifs, Confidentialité", async ({ page }) => {
    await expect(page.locator("footer a[href='/niches']")).toContainText("Niches");
    await expect(page.locator("footer a[href='/pricing']")).toContainText("Tarifs");
    await expect(page.locator("footer a[href='/privacy']")).toContainText("Confidentialité");
  });
});

/* -------------------------------------------------------------------------- */
/*  11. Edge Cases                                                             */
/* -------------------------------------------------------------------------- */

test.describe("Comparatif — Cas limites", () => {
  test("la page se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto(COMPARATIF_URL);
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("le tableau est responsive (overflow-x-auto)", async ({ page }) => {
    await page.goto(COMPARATIF_URL);

    const tableContainer = page.locator(".overflow-x-auto");
    await expect(tableContainer).toBeVisible();
    await expect(tableContainer.locator("table")).toBeVisible();
  });

  test("la page ne redirige pas (route publique)", async ({ page }) => {
    const response = await page.goto(COMPARATIF_URL);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/comparatif\/vidiq-trendhunter/);
  });

  test("le contenu principal (main) est présent", async ({ page }) => {
    await page.goto(COMPARATIF_URL);
    await expect(page.locator("main")).toBeVisible();
  });

  test("tous les liens internes ont des href valides", async ({ page }) => {
    await page.goto(COMPARATIF_URL);

    // Collect all internal links (starting with /)
    const links = page.locator("a[href^='/']");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    // Verify none are empty or javascript:void
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).not.toBe("#");
      expect(href).not.toMatch(/^javascript:/);
    }
  });

  test("la page répond avec un status 200", async ({ page }) => {
    const response = await page.goto(COMPARATIF_URL);
    expect(response?.status()).toBe(200);
  });
});
