import { test, expect } from "@playwright/test";

/**
 * Features page E2E tests for YouTube TrendHunter
 *
 * Tests the public /features page — a self-contained marketing page
 * with hero, features grid (6 cards), comparison table (6 rows),
 * testimonials (3 cards), CTA section, footer, and header.
 *
 * This is a PUBLIC route — no authentication required.
 * The page is fully static (no API calls), so no mocking is needed.
 */

/* -------------------------------------------------------------------------- */
/*  Features — Hero Section                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Features — Hero Section", () => {
  test("affiche le badge « FONCTIONNALITÉS »", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByText("FONCTIONNALITÉS", { exact: true })).toBeVisible();
  });

  test("affiche le H1 principal « L'arsenal complet du créateur moderne »", async ({ page }) => {
    await page.goto("/features");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("L'arsenal complet du");
    await expect(h1).toContainText("créateur moderne");
  });

  test("affiche la description sous le H1", async ({ page }) => {
    await page.goto("/features");

    await expect(
      page.getByText("Des outils conçus pour vous donner un avantage compétitif sur YouTube."),
    ).toBeVisible();
  });

  test("affiche les deux CTA (Commencer Gratuit et Voir les tarifs)", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByText("COMmencer Gratuit", { exact: true })).toBeVisible();
    await expect(page.getByText("Voir les tarifs")).toBeVisible();
  });

  test("bouton CTA « COMmencer Gratuit » redirige vers /login", async ({ page }) => {
    await page.goto("/features");

    const cta = page.locator("a[href='/login']").filter({ hasText: "Commencer Gratuit" }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();
    await page.waitForURL(/\/login/);
  });

  test("bouton « Voir les tarifs » redirige vers /pricing", async ({ page }) => {
    await page.goto("/features");

    const btn = page.locator("a[href='/pricing']").filter({ hasText: "Voir les tarifs" });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    await btn.click();
    await page.waitForURL(/\/pricing/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Grille des fonctionnalités                                     */
/* -------------------------------------------------------------------------- */

test.describe("Features — Grille des fonctionnalités", () => {
  test("affiche le titre de section « Tout ce dont vous avez besoin »", async ({ page }) => {
    await page.goto("/features");

    await expect(
      page.getByRole("heading", { name: "Tout ce dont vous avez besoin" }),
    ).toBeVisible();
  });

  test("affiche la description de la section", async ({ page }) => {
    await page.goto("/features");

    await expect(
      page.getByText(
        "Chaque fonctionnalité a été pensée pour résoudre un problème réel des créateurs.",
      ),
    ).toBeVisible();
  });

  test("la grille contient exactement 6 cartes de fonctionnalités", async ({ page }) => {
    await page.goto("/features");

    const gridSection = page
      .locator("section")
      .filter({ has: page.getByText("Tout ce dont vous avez besoin") });
    const cards = gridSection.locator(".grid > div");
    await expect(cards).toHaveCount(6);
  });

  test("affiche les 6 titres de fonctionnalités", async ({ page }) => {
    await page.goto("/features");

    const titles = [
      "Détection de Tendances IA",
      "Angles de Contenu IA",
      "Alertes en Temps Réel",
      "Extension Chrome",
      "Filtrage par Niche",
      "Export et Intégrations",
    ];

    for (const title of titles) {
      await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
    }
  });

  test("chaque fonctionnalité a sa description textuelle", async ({ page }) => {
    await page.goto("/features");

    const descriptions = [
      "analyse des millions de vidéos YouTube",
      "génère automatiquement des angles de vidéo",
      "Soyez le premier prévient quand une niche",
      "Accédez aux données TrendHunter directement depuis YouTube",
      "Suivez les niches qui vous intéressent",
      "Exportez vos données en CSV, intégrez avec Zapier",
    ];

    for (const desc of descriptions) {
      await expect(page.getByText(desc)).toBeVisible();
    }
  });

  test("chaque fonctionnalité a ses 3 points clés (highlights)", async ({ page }) => {
    await page.goto("/features");

    const allHighlights = [
      ["Analyse en temps réel", "Score de potencial", "Prédictions 48h"],
      ["3 angles par tendance", "Titres optimisés", "Hooks prêts à utiliser"],
      ["Seuils personnalisables", "Multi-canaux", "Filtres par niche"],
      ["Side panel intégré", "Stats sous chaque vidéo", "Détection de niche auto"],
      ["5 niches incluses", "Niches illimitées (Pro)", "Ajout personnalisé"],
      ["Export CSV", "API complete", "Webhooks Zapier"],
    ];

    for (const highlights of allHighlights) {
      for (const highlight of highlights) {
        await expect(page.getByText(highlight)).toBeVisible();
      }
    }
  });

  test("chaque carte contient une icône SVG", async ({ page }) => {
    await page.goto("/features");

    // Each feature card has an SVG icon inside the colored background div
    const featuresSection = page
      .locator("section")
      .filter({ has: page.getByText("Tout ce dont vous avez besoin") });
    const cards = featuresSection.locator(".grid > div");
    const count = await cards.count();
    expect(count).toBe(6);

    // Each card should have at least one SVG (the feature icon)
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator("svg").first()).toBeVisible();
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Tableau de comparaison                                          */
/* -------------------------------------------------------------------------- */

test.describe("Features — Tableau de comparaison", () => {
  test("affiche le titre de section « Comment on se compare »", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByRole("heading", { name: "Comment on se compare" })).toBeVisible();
  });

  test("affiche la description du tableau", async ({ page }) => {
    await page.goto("/features");

    await expect(
      page.getByText("Face aux autres outils du marché, TrendHunter offre plus pour moins."),
    ).toBeVisible();
  });

  test("affiche les 4 colonnes d'en-tête (Fonctionnalité, TrendHunter, VidIQ, TubeBuddy)", async ({
    page,
  }) => {
    await page.goto("/features");

    const headers = page.locator("table thead tr th");
    await expect(headers).toHaveCount(4);
    await expect(headers.nth(0)).toContainText("Fonctionnalité");
    await expect(headers.nth(1)).toContainText("TrendHunter");
    await expect(headers.nth(2)).toContainText("VidIQ");
    await expect(headers.nth(3)).toContainText("TubeBuddy");
  });

  test("affiche les 6 lignes de fonctionnalités comparées", async ({ page }) => {
    await page.goto("/features");

    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(6);

    const featureNames = [
      "Tendances illimitées",
      "Alertes temps réel",
      "Angles de contenu IA",
      "Extension Chrome",
      "API access",
      "Support français",
    ];

    for (let i = 0; i < featureNames.length; i++) {
      await expect(rows.nth(i).locator("td").first()).toContainText(featureNames[i]);
    }
  });

  test("rend correctement les icônes Check et les mentions — / Partiel", async ({ page }) => {
    await page.goto("/features");

    const rows = page.locator("table tbody tr");

    // Row 0: "Tendances illimitées" — all 3 true => Check icons
    const r0 = rows.nth(0);
    await expect(r0.locator("td").nth(1).locator("svg")).toBeVisible(); // TH ✓
    await expect(r0.locator("td").nth(2).locator("svg")).toBeVisible(); // VidIQ ✓
    await expect(r0.locator("td").nth(3).locator("svg")).toBeVisible(); // TB ✓

    // Row 1: "Alertes temps réel" — TH true, VidIQ "Partiel", TB false
    const r1 = rows.nth(1);
    await expect(r1.locator("td").nth(1).locator("svg")).toBeVisible(); // TH ✓
    await expect(r1.locator("td").nth(2)).toContainText("Partiel"); // VidIQ text
    await expect(r1.locator("td").nth(3)).toContainText("—"); // TB —

    // Row 2: "Angles de contenu IA" — TH true, VidIQ false, TB false
    const r2 = rows.nth(2);
    await expect(r2.locator("td").nth(1).locator("svg")).toBeVisible(); // TH ✓
    await expect(r2.locator("td").nth(2)).toContainText("—"); // VidIQ —
    await expect(r2.locator("td").nth(3)).toContainText("—"); // TB —

    // Row 3: "Extension Chrome" — all 3 true
    const r3 = rows.nth(3);
    await expect(r3.locator("td").nth(1).locator("svg")).toBeVisible();
    await expect(r3.locator("td").nth(2).locator("svg")).toBeVisible();
    await expect(r3.locator("td").nth(3).locator("svg")).toBeVisible();

    // Row 4: "API access" — TH true, VidIQ false, TB false
    const r4 = rows.nth(4);
    await expect(r4.locator("td").nth(1).locator("svg")).toBeVisible();
    await expect(r4.locator("td").nth(2)).toContainText("—");
    await expect(r4.locator("td").nth(3)).toContainText("—");

    // Row 5: "Support français" — TH true, VidIQ false, TB false
    const r5 = rows.nth(5);
    await expect(r5.locator("td").nth(1).locator("svg")).toBeVisible();
    await expect(r5.locator("td").nth(2)).toContainText("—");
    await expect(r5.locator("td").nth(3)).toContainText("—");
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Témoignages                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Features — Témoignages", () => {
  test("affiche le titre de section « Ce que disent les créateurs »", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByRole("heading", { name: "Ce que disent les créateurs" })).toBeVisible();
  });

  test("affiche les 3 témoignages avec nom et rôle", async ({ page }) => {
    await page.goto("/features");

    const authors = [
      { name: "Marc T.", role: "Chaîne Tech, 120K abonnés" },
      { name: "Sophie L.", role: "Créatrice Fitness, 85K abonnés" },
      { name: "Alex R.", role: "YouTubeur Finance, 200K abonnés" },
    ];

    for (const author of authors) {
      await expect(page.getByText(author.name)).toBeVisible();
      await expect(page.getByText(author.role)).toBeVisible();
    }
  });

  test("chaque témoignage contient une citation", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByText("TrendHunter m'a permis de repérer la tendance")).toBeVisible();
    await expect(page.getByText("Les alertes en temps réel sont un game-changer")).toBeVisible();
    await expect(
      page.getByText("L'extension Chrome est parfaite. Je reste sur YouTube"),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Appel à l'action finale                                        */
/* -------------------------------------------------------------------------- */

test.describe("Features — Appel à l'action finale", () => {
  test("affiche le titre « Prêt à prendre de l'avance ? »", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByRole("heading", { name: "Prêt à prendre de l'avance ?" })).toBeVisible();
  });

  test("affiche le texte de la section CTA", async ({ page }) => {
    await page.goto("/features");

    await expect(
      page.getByText(
        "Rejoignez les créateurs qui utilisent TrendHunter pour stay ahead de l'algorithme.",
      ),
    ).toBeVisible();
  });

  test("bouton CTA final « COMmencer Gratuitement » redirige vers /login", async ({ page }) => {
    await page.goto("/features");

    const cta = page.locator("a[href='/login']").filter({ hasText: "COMmencer Gratuitement" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    await cta.click();
    await page.waitForURL(/\/login/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Pied de page                                                   */
/* -------------------------------------------------------------------------- */

test.describe("Features — Pied de page", () => {
  test("affiche le copyright avec l'année en cours", async ({ page }) => {
    await page.goto("/features");

    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`© ${currentYear} TrendHunter.`)).toBeVisible();
  });

  test("affiche les liens du footer (Tarifs, Confidentialité, CGU)", async ({ page }) => {
    await page.goto("/features");

    await expect(page.locator("footer a[href='/pricing']")).toContainText("Tarifs");
    await expect(page.locator("footer a[href='/privacy']")).toContainText("Confidentialité");
    await expect(page.locator("footer a[href='/terms']")).toContainText("CGU");
  });

  test("le footer contient le logo TrendHunter", async ({ page }) => {
    await page.goto("/features");

    await expect(page.locator("footer").getByText("TrendHunter").first()).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — En-tête / Navigation                                           */
/* -------------------------------------------------------------------------- */

test.describe("Features — En-tête / Navigation", () => {
  test("le logo TrendHunter est visible et lien vers /", async ({ page }) => {
    await page.goto("/features");

    const logo = page.locator("header a[href='/']");
    await expect(logo).toBeVisible();
    await expect(logo).toContainText("TrendHunter");
  });

  test("affiche les liens de navigation desktop (Fonctionnalités, Tarifs, Blog)", async ({
    page,
  }) => {
    await page.goto("/features");

    const nav = page.locator("header nav");
    await expect(nav.getByText("Fonctionnalités")).toBeVisible();
    await expect(nav.getByText("Tarifs")).toBeVisible();
    await expect(nav.getByText("Blog")).toBeVisible();
  });

  test("le lien « Tarifs » de la navigation pointe vers /pricing", async ({ page }) => {
    await page.goto("/features");

    const pricingLink = page.locator("header nav a[href='/pricing']");
    await expect(pricingLink).toBeVisible();
    await expect(pricingLink).toContainText("Tarifs");
  });

  test("le lien « Blog » de la navigation pointe vers /blog", async ({ page }) => {
    await page.goto("/features");

    const blogLink = page.locator("header nav a[href='/blog']");
    await expect(blogLink).toBeVisible();
    await expect(blogLink).toContainText("Blog");
  });

  test("affiche le bouton « ESSAYER Gratuitement » vers /login", async ({ page }) => {
    await page.goto("/features");

    const tryBtn = page
      .locator("header a[href='/login']")
      .filter({ hasText: "ESSAYER Gratuitement" });
    await expect(tryBtn).toBeVisible();
    await expect(tryBtn).toBeEnabled();
  });

  test("tous les éléments de navigation sont visibles sur desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/features");

    await expect(page.locator("header nav").getByText("Fonctionnalités")).toBeVisible();
    await expect(page.locator("header nav").getByText("Tarifs")).toBeVisible();
    await expect(page.locator("header nav").getByText("Blog")).toBeVisible();
    await expect(page.locator("header").getByText("ESSAYER Gratuitement")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Navigation et interactions                                     */
/* -------------------------------------------------------------------------- */

test.describe("Features — Navigation et interactions", () => {
  test("le lien « Tarifs » redirige vers /pricing", async ({ page }) => {
    await page.goto("/features");

    await page.locator("header nav a[href='/pricing']").click();
    await page.waitForURL(/\/pricing/);
    await expect(page.locator("h1")).toContainText("Investissez");
  });

  test("le lien « Blog » redirige vers /blog", async ({ page }) => {
    await page.goto("/features");

    await page.locator("header nav a[href='/blog']").click();
    await page.waitForURL(/\/blog/);
    await expect(page.locator("h1")).toContainText("Blog");
  });

  test("le bouton « ESSAYER Gratuitement » redirige vers /login", async ({ page }) => {
    await page.goto("/features");

    await page
      .locator("header a[href='/login']")
      .filter({ hasText: "ESSAYER Gratuitement" })
      .click();
    await page.waitForURL(/\/login/);
  });

  test("navigation features → pricing → retour features sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/features");
    await expect(page.locator("h1")).toContainText("L'arsenal complet");

    // Go to pricing via header
    await page.locator("header nav a[href='/pricing']").click();
    await page.waitForURL(/\/pricing/);
    await expect(page.locator("h1")).toContainText("Investissez");

    // Navigate back to features
    await page.goto("/features");
    await expect(page.locator("h1")).toContainText("L'arsenal complet");

    expect(errors).toHaveLength(0);
  });

  test("navigation features → login via hero CTA sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/features");
    await expect(page.locator("h1")).toBeVisible();

    // Click hero CTA
    await page.locator("a[href='/login']").filter({ hasText: "Commencer Gratuit" }).first().click();
    await page.waitForURL(/\/login/);

    expect(errors).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Cas limites (SEO, Console, Meta)                               */
/* -------------------------------------------------------------------------- */

test.describe("Features — Cas limites", () => {
  test("se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/features");
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("a le bon titre de page « Fonctionnalités - TrendHunter »", async ({ page }) => {
    await page.goto("/features");

    await expect(page).toHaveTitle("Fonctionnalités - TrendHunter | TrendHunter");
  });

  test("a la bonne meta description", async ({ page }) => {
    await page.goto("/features");

    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute(
      "content",
      "Découvrez toutes les fonctionnalités de TrendHunter : détection de tendances IA, alertes en temps réel, extension Chrome, analytics avancés.",
    );
  });

  test("a les balises Open Graph (og:title, og:description, og:url, og:type)", async ({ page }) => {
    await page.goto("/features");

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", "Fonctionnalités TrendHunter");

    const ogDesc = page.locator('meta[property="og:description"]');
    await expect(ogDesc).toHaveAttribute(
      "content",
      "Tous les outils pour grow votre chaîne YouTube",
    );

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute("content", "/features");

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");
  });

  test("la page /features ne redirige pas (publique)", async ({ page }) => {
    await page.goto("/features");

    // Stay on /features — no redirect
    await expect(page).toHaveURL(/\/features/);
    await expect(page.locator("h1")).toContainText("L'arsenal complet");
  });

  test("la grille des fonctionnalités utilise les classes responsives", async ({ page }) => {
    await page.goto("/features");

    const gridSection = page
      .locator("section")
      .filter({ has: page.getByText("Tout ce dont vous avez besoin") });
    const grid = gridSection.locator(".grid");

    // Check responsive grid classes
    const classAttr = await grid.getAttribute("class");
    expect(classAttr).toContain("grid-cols-1");
    expect(classAttr).toContain("md:grid-cols-2");
    expect(classAttr).toContain("lg:grid-cols-3");
  });

  test("le header est sticky (position sticky en haut)", async ({ page }) => {
    await page.goto("/features");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    const classAttr = await header.getAttribute("class");
    expect(classAttr).toContain("sticky");
    expect(classAttr).toContain("top-0");
  });
});

/* -------------------------------------------------------------------------- */
/*  Features — Responsive (viewport mobile)                                   */
/* -------------------------------------------------------------------------- */

test.describe("Features — Responsive mobile", () => {
  test("masque la navigation desktop sur mobile (viewport 375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    // The nav has class "hidden md:flex" — on mobile (< 768px) it's hidden
    const nav = page.locator("header nav");
    await expect(nav).toBeHidden();
  });

  test("affiche le logo et le bouton CTA sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    // Logo should still be visible
    await expect(page.locator("header a[href='/']")).toBeVisible();
    await expect(page.locator("header a[href='/']")).toContainText("TrendHunter");

    // CTA button should still be visible
    await expect(
      page.locator("header a[href='/login']").filter({ hasText: "ESSAYER Gratuitement" }),
    ).toBeVisible();
  });

  test("le contenu principal est visible sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    // Hero section content is visible
    await expect(page.locator("h1")).toContainText("L'arsenal complet");
    await expect(page.getByText("COMmencer Gratuit", { exact: true })).toBeVisible();

    // Features section is still accessible
    await expect(page.getByText("Détection de Tendances IA")).toBeVisible();
  });

  test("les cartes de fonctionnalités s'affichent en colonne unique sur mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    // The grid uses grid-cols-1 on mobile — verify cards are stacked
    const gridSection = page
      .locator("section")
      .filter({ has: page.getByText("Tout ce dont vous avez besoin") });
    const grid = gridSection.locator(".grid");

    const classAttr = await grid.getAttribute("class");
    expect(classAttr).toContain("grid-cols-1");
  });

  test("le tableau de comparaison est scrollable sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    // The table wrapper has overflow-x-auto for horizontal scroll on small screens
    const tableWrapper = page.locator(".overflow-x-auto");
    await expect(tableWrapper).toBeVisible();
    await expect(tableWrapper.locator("table")).toBeVisible();
  });

  test("le footer s'affiche correctement sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/features");

    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("footer").getByText("TrendHunter").first()).toBeVisible();

    // Footer links should be present
    await expect(page.locator("footer a[href='/pricing']")).toBeVisible();
    await expect(page.locator("footer a[href='/privacy']")).toBeVisible();

    // Copyright should be visible
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`© ${currentYear} TrendHunter.`)).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  14 — Features Tablette 768px 2 colonnes (Responsive)                      */
/* -------------------------------------------------------------------------- */

test.describe("Features — Tablette responsive", () => {
  test("à 768px la grille de fonctionnalités est en 2 colonnes", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/features");

    // La grille utilise grid-cols-1 md:grid-cols-2 lg:grid-cols-3
    // À 768px (md), elle doit être en 2 colonnes
    const featuresSection = page
      .locator("section")
      .filter({ has: page.getByText("Tout ce dont vous avez besoin") });
    const grid = featuresSection.locator(".grid");

    const colCount = await grid.evaluate((el) => {
      const cols = getComputedStyle(el).gridTemplateColumns;
      const match = cols.match(/repeat\((\d+)/);
      return match ? parseInt(match[1], 10) : cols.split(/\s+/).length;
    });
    expect(colCount).toBe(2);
  });
});
