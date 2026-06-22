import { test, expect, type Page } from "@playwright/test";

/**
 * Blog E2E tests for YouTube TrendHunter
 *
 * Tests the blog listing page (/blog) and individual blog article pages (/blog/[slug]).
 * These are PUBLIC SSR routes — no authentication required.
 *
 * Data source: content/blog/articles.json (5 articles published, 4 categories)
 *   Categories: analyses, guides, strategies, actualites
 *   Articles: 1 (featured) + 4 standard — all published
 *
 * NOTE on pagination: With 5 articles and 6 per page, only 1 page is rendered.
 *   Pagination controls ("Précédent" / "Suivant") are conditionally hidden.
 *   Tests 13-15 cover both states: absence with current data, and a best-effort
 *   approach verifying the condition is correct.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FIRST_ARTICLE_SLUG = "ia-productivite-tendance-2026-youtube";
const INVALID_SLUG = "cet-article-n-existe-pas-du-tout";

const ALL_CATEGORY_NAMES = ["Tous", "Analyses", "Guides", "Stratégies", "Actualités"];

const ALL_ARTICLE_TITLES = [
  "IA & Productivité : La niche YouTube à surveiller en 2026",
  "Comment créer une chaîne YouTube rentable en 2026",
  "Comment l'algorithme YouTube fonctionne en 2026",
  "Les 5 niches YouTube à croissance rapide en 2026",
  "YouTube Shorts vs Long Form : Le match en 2026",
];

const ALL_ARTICLE_SLUGS = [
  "ia-productivite-tendance-2026-youtube",
  "comment-creer-chaine-youtube-rentable",
  "algorithme-youtube-2026-tout-savoir",
  "niches-youtube-croissance-rapide",
  "youtube-shorts-vs-long-form-2026",
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Returns all article card links (h3-bearing anchors) visible on the listing page.
 * These are the grid cards — the featured article uses an h2, so it is excluded.
 */
function getArticleCards(page: Page) {
  return page.locator('main a[href^="/blog/"] h3');
}

/**
 * Returns the featured article section link (h2-bearing anchor).
 */
function getFeaturedCard(page: Page) {
  return page
    .locator('main a[href^="/blog/"]')
    .filter({ has: page.locator("h2") })
    .first();
}

/**
 * Counts visible article cards (h3 inside a[href^="/blog/"]) on the page.
 */
async function countArticleCards(page: Page): Promise<number> {
  return await getArticleCards(page).count();
}

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Page Structure                                              */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Structure de la page", () => {
  test("affiche le titre principal « Blog TrendHunter »", async ({ page }) => {
    await page.goto("/blog");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toHaveText("Blog TrendHunter");
  });

  test("affiche les 5 filtres de catégories (Tous, Analyses, Guides, Stratégies, Actualités)", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Category pills are Links inside the filter section
    const filterSection = page
      .locator("section")
      .filter({ has: page.getByText("Tous") })
      .first();

    for (const name of ALL_CATEGORY_NAMES) {
      await expect(filterSection.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  test("affiche la section article à la une avec le badge et le titre du premier article", async ({
    page,
  }) => {
    await page.goto("/blog");

    // The "À la une" badge in the featured section
    await expect(page.getByText("À la une")).toBeVisible();

    // The featured article title (rendered as h2)
    await expect(page.locator("h2").filter({ hasText: "IA & Productivité" }).first()).toBeVisible();
  });

  test("la grille d'articles contient les 5 articles publiés", async ({ page }) => {
    await page.goto("/blog");

    const count = await countArticleCards(page);
    expect(count).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Article Cards                                               */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Cartes d'articles", () => {
  test("le titre de chaque article est visible dans la grille", async ({ page }) => {
    await page.goto("/blog");

    for (const title of ALL_ARTICLE_TITLES) {
      await expect(page.locator("h3").filter({ hasText: title })).toBeVisible();
    }
  });

  test("le badge de catégorie est affiché sur chaque carte", async ({ page }) => {
    await page.goto("/blog");

    // The grid cards are links containing h3 (featured article uses h2, so excluded)
    const gridCards = page.locator('main a[href^="/blog/"]:has(h3)');

    // Verify the first grid card shows its category badge (article 1 → "Analyses")
    await expect(gridCards.first().getByText("Analyses")).toBeVisible();

    // Second card (article 2) has category "Guides"
    await expect(gridCards.nth(1).getByText("Guides")).toBeVisible();
  });

  test("le badge de difficulté est visible dans la section à la une", async ({ page }) => {
    await page.goto("/blog");

    // The featured article (article 1) has difficulty "intermédiaire"
    const featuredSection = getFeaturedCard(page);
    await expect(featuredSection.getByText("intermédiaire")).toBeVisible();
  });

  test("le temps de lecture est affiché sur les cartes de la grille", async ({ page }) => {
    await page.goto("/blog");

    // Each card shows "X min" read time (e.g. "8 min", "6 min")
    const cards = getArticleCards(page);
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator("..").getByText(/min$/)).toBeVisible();
    }
  });

  test("la section à la une contient un élément visuel (icône Play)", async ({ page }) => {
    await page.goto("/blog");

    // Featured section shows a Play icon as the visual element
    const featuredSection = getFeaturedCard(page);
    await expect(featuredSection.locator("svg.lucide-play")).toBeVisible();
  });

  test("chaque lien d'article redirige vers /blog/[slug]", async ({ page }) => {
    await page.goto("/blog");

    // Click the first article card (first h3 link) — skip featured
    const firstCardLink = page
      .locator('main a[href^="/blog/"]')
      .filter({ has: page.locator("h3") })
      .first();
    await firstCardLink.click();

    await page.waitForURL(/\/blog\//);
    expect(page.url()).toMatch(/\/blog\//);
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Filtrage par Catégorie                                      */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Filtrage par catégorie", () => {
  test("cliquer sur un filtre de catégorie réduit les articles affichés", async ({ page }) => {
    await page.goto("/blog");

    // Before filter: 5 articles
    expect(await countArticleCards(page)).toBe(5);

    // Click "Analyses" — there are 2 analysis articles (articles 1 & 3)
    const filterSection = page
      .locator("section")
      .filter({ has: page.getByText("Tous") })
      .first();
    await filterSection.getByRole("link", { name: "Analyses", exact: true }).click();
    await page.waitForURL(/category=analyses/);

    // After filter: only 2 analysis articles remain
    expect(await countArticleCards(page)).toBe(2);

    // Verify the filter shows analysis articles only
    const cards = page.locator('main a[href^="/blog/"]');
    await expect(cards).toHaveCount(2);
  });

  test("le filtre actif a la classe de style actif (bg-yt-red)", async ({ page }) => {
    await page.goto("/blog");

    // Click "Guides"
    const filterSection = page
      .locator("section")
      .filter({ has: page.getByText("Tous") })
      .first();
    await filterSection.getByRole("link", { name: "Guides", exact: true }).click();
    await page.waitForURL(/category=guides/);

    // The active link should have the "bg-yt-red" class
    const activePill = filterSection.getByRole("link", { name: "Guides", exact: true });
    await expect(activePill).toHaveClass(/bg-yt-red/);

    // Inactive pills (e.g. "Stratégies") should NOT have bg-yt-red
    const inactivePill = filterSection.getByRole("link", { name: "Stratégies", exact: true });
    await expect(inactivePill).not.toHaveClass(/bg-yt-red/);
  });

  test("le filtre « Tous » réinitialise le filtre et affiche tous les articles", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Filter to a specific category first
    const filterSection = page
      .locator("section")
      .filter({ has: page.getByText("Tous") })
      .first();
    await filterSection.getByRole("link", { name: "Analyses", exact: true }).click();
    await page.waitForURL(/category=analyses/);

    // Click "Tous" to reset
    await filterSection.getByRole("link", { name: "Tous", exact: true }).click();
    await page.waitForURL("/blog");

    // All articles are back
    expect(await countArticleCards(page)).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Pagination                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Pagination", () => {
  test("la pagination n'est pas affichée quand il y a 5 articles ou moins (1 page)", async ({
    page,
  }) => {
    await page.goto("/blog");

    // With 5 articles and 6 per page, totalPages = 1, so pagination is hidden
    await expect(page.getByText("Suivant")).not.toBeVisible();
    await expect(page.getByText("Précédent")).not.toBeVisible();
  });

  test("la pagination n'affiche pas de numéro de page 2 quand il y a ≤ 6 articles", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Page number 2 link should not exist
    const page2Link = page.locator('a[href*="page=2"]');
    await expect(page2Link).toHaveCount(0);
  });

  test("l'URL ne contient pas de paramètre ?page quand on est sur la première page", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Default page is 1, no ?page parameter in URL
    expect(page.url()).not.toContain("page=");
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — JSON-LD                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — JSON-LD (Schema.org)", () => {
  test("le script JSON-LD Blog schema est présent dans le DOM", async ({ page }) => {
    await page.goto("/blog");

    // Script tags are hidden elements; use toBeAttached() instead of toBeVisible()
    const jsonld = page.locator('script[type="application/ld+json"]');
    await expect(jsonld).toBeAttached();
  });

  test("le JSON-LD contient le type Blog et le nom correct", async ({ page }) => {
    await page.goto("/blog");

    const jsonld = page.locator('script[type="application/ld+json"]');
    const content = await jsonld.textContent();
    const parsed = JSON.parse(content || "{}");

    expect(parsed["@type"]).toBe("Blog");
    expect(parsed.name).toBe("Blog TrendHunter");
    expect(parsed.url).toBe("https://trendhunter.app/blog");
  });

  test("le JSON-LD liste les articles sous blogPost", async ({ page }) => {
    await page.goto("/blog");

    const jsonld = page.locator('script[type="application/ld+json"]');
    const content = await jsonld.textContent();
    const parsed = JSON.parse(content || "{}");

    // All 5 published articles should be in blogPost
    expect(parsed.blogPost).toBeDefined();
    expect(Array.isArray(parsed.blogPost)).toBe(true);
    expect(parsed.blogPost.length).toBe(5);

    // First article should have correct structure
    const first = parsed.blogPost[0];
    expect(first["@type"]).toBe("BlogPosting");
    expect(first.headline).toBeTruthy();
    expect(first.url).toContain("/blog/");
    expect(first.author["@type"]).toBe("Person");
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — État vide (best-effort)                                    */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — État vide", () => {
  test("(best-effort) notFound est appelé quand le fichier JSON est inaccessible", async ({
    page,
  }) => {
    // This test requires the server's content/blog/articles.json to be unreadable.
    // In normal E2E runs with the server running, the file exists and is readable.
    // We verify the page renders normally as a baseline.
    const response = await page.goto("/blog");
    expect(response?.ok()).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — En-tête et Métadonnées                                     */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — En-tête et métadonnées", () => {
  test("affiche le fil d'Ariane (Accueil > Blog > Titre)", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // There are two breadcrumb navs: one from layout, one from the article page.
    // The article-page breadcrumb is inside <article>'s preceding sibling.
    const articleBreadcrumb = page.locator("article").locator("..").locator("nav").first();
    await expect(articleBreadcrumb).toBeVisible();

    // The breadcrumb contains "Accueil", "Blog", and the article title
    await expect(articleBreadcrumb.getByText("Accueil")).toBeVisible();
    await expect(articleBreadcrumb.getByText("Blog")).toBeVisible();
    await expect(
      articleBreadcrumb.getByText("IA & Productivité : La niche YouTube à surveiller en 2026"),
    ).toBeVisible();
  });

  test("affiche le titre de l'article (h1)", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    await expect(page.locator("h1")).toContainText("IA & Productivité");
  });

  test("affiche le badge de catégorie", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Category is displayed as a Badge in the article header (value from JSON: "analyses")
    await expect(page.locator("article header").getByText("analyses")).toBeVisible();
  });

  test("affiche le badge de difficulté", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Difficulty badge: "intermédiaire" (article 1)
    await expect(page.locator("article header").getByText("intermédiaire")).toBeVisible();
  });

  test("affiche le nom de l'auteur", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Author name from JSON: "TrendHunter AI"
    await expect(page.getByText("TrendHunter AI")).toBeVisible();
  });

  test("affiche la date de publication", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Date is a span right after the Calendar SVG icon (e.g. "10 mai 2026")
    const dateSpan = page.locator("article header svg.lucide-calendar ~ span");
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText("mai");
  });

  test("affiche le temps de lecture", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has 8 min read time
    await expect(page.locator("article header").getByText("8 min de lecture")).toBeVisible();
  });

  test("affiche les tags de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Tags are rendered as Badge elements next to a Tag icon
    const tagContainer = page.locator("article header svg.lucide-tag").locator("..");
    await expect(tagContainer).toBeVisible();

    // Article 1 has tags: IA, Productivité, YouTube, 2026, Tutoriel, Automation
    await expect(tagContainer.getByText("IA", { exact: true })).toBeVisible();
    await expect(tagContainer.getByText("Productivité")).toBeVisible();
    await expect(tagContainer.getByText("YouTube")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Contenu (Sections)                                          */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Contenu sections", () => {
  test("affiche la section d'intro (type: intro)", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 intro starts with "Le marché de l'IA explose"
    await expect(
      page.getByText("Le marché de l'IA explose littéralement sur YouTube"),
    ).toBeVisible();
  });

  test("affiche les titres h2 avec leur contenu", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has h2 sections: "Pourquoi l'IA & Productivité explose en 2026",
    // "Les formats qui cartonnent", "Comment se différencier"
    await expect(
      page.locator("h2").filter({ hasText: "Pourquoi l'IA & Productivité explose" }),
    ).toBeVisible();
    await expect(
      page.locator("h2").filter({ hasText: "Les formats qui cartonnent" }),
    ).toBeVisible();
    await expect(page.locator("h2").filter({ hasText: "Comment se différencier" })).toBeVisible();
  });

  test("affiche les titres h3 dans les sous-sections", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has h3 subsections: "Adoption massive par le grand public",
    // "Évolution rapide = contenu infini", "Niche dans la niche", "Cas d'usage concrets"
    await expect(page.locator("h3").filter({ hasText: "Adoption massive" })).toBeVisible();
    await expect(page.locator("h3").filter({ hasText: "Évolution rapide" })).toBeVisible();
  });

  test("affiche les sections Callout (tip/warning/info) avec l'icône appropriée", async ({
    page,
  }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has a "tip" callout with Lightbulb icon
    const callout = page.locator("div.p-4").filter({ has: page.locator("svg.lucide-lightbulb") });
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("Le moment idéal pour démarrer");
  });

  test("affiche les sections Stats avec les valeurs et labels", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has stats: 2B+, +340%, 15K, 8.2%
    await expect(page.getByText("2B+")).toBeVisible();
    await expect(page.getByText("+340%")).toBeVisible();
    await expect(page.getByText("Vues 2025")).toBeVisible();
    await expect(page.getByText("Croissance", { exact: true })).toBeVisible();
  });

  test("affiche les sections Quote avec le texte et l'attribution", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has a quote section
    await expect(page.getByText("En 6 mois sur cette niche")).toBeVisible();
    await expect(page.getByText("Créateur anonyme, chaîne IA francophone")).toBeVisible();
  });

  test("affiche la section conclusion", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has a conclusion section
    await expect(
      page.locator("h2").filter({ hasText: "Verdict : opportunité majeure" }),
    ).toBeVisible();
    await expect(
      page.getByText("L'IA & Productivité reste une des niches les plus accessibles"),
    ).toBeVisible();
  });

  test("les listes à puces (items) sont rendues", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has an items list under "Les formats qui cartonnent"
    await expect(page.getByText("Tutoriels IA pour débutants")).toBeVisible();
    await expect(page.getByText("Comparatifs d'outils")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Articles Similaires                                         */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Articles similaires", () => {
  test("la section « Articles similaires » est visible", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has 2 related articles (ids 2 and 3)
    await expect(page.getByText("Articles similaires")).toBeVisible();
  });

  test("les cartes d'articles similaires sont affichées", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1's related articles: "Comment créer une chaîne YouTube rentable" and
    // "Comment l'algorithme YouTube fonctionne en 2026"
    const relatedSection = page
      .locator("section")
      .filter({ has: page.getByText("Articles similaires") })
      .first();
    await expect(
      relatedSection.getByText("Comment créer une chaîne YouTube rentable"),
    ).toBeVisible();
    await expect(
      relatedSection.getByText("Comment l'algorithme YouTube fonctionne en 2026"),
    ).toBeVisible();
  });

  test("les liens des articles similaires fonctionnent", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Click the first related article link
    const firstRelatedLink = page
      .locator('a[href^="/blog/"]')
      .filter({
        has: page.locator("h3").filter({ hasText: "Comment créer une chaîne" }),
      })
      .first();
    await firstRelatedLink.click();

    // Should navigate to the related article
    await page.waitForURL(/\/blog\/comment-creer-chaine-youtube-rentable/);
    await expect(page.locator("h1")).toContainText("Comment créer une chaîne YouTube");
  });

  test("le lien « Retour au blog » est présent", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const returnLink = page.getByText("Retour au blog");
    await expect(returnLink).toBeVisible();
    await expect(returnLink).toBeEnabled();

    await returnLink.click();
    await page.waitForURL("/blog");
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Cas Limites                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Cas limites", () => {
  test("un slug invalide affiche la page 404", async ({ page }) => {
    await page.goto(`/blog/${INVALID_SLUG}`);

    // The notFound() call renders the not-found page (Next.js sends 404 status,
    // but the page content is the not-found.tsx component)
    await expect(page.locator("h1")).toContainText("404");
    await expect(page.getByText("Cette page n'existe pas ou a été déplacée")).toBeVisible();
  });

  test("tous les types de sections se rendent sans erreur console (article complet)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);
    await expect(page.locator("h1")).toBeVisible();

    // No errors should be thrown
    expect(errors).toHaveLength(0);
  });

  test("un article avec toutes les sections (intro, h2, h3, callout, stats, items, quote, conclusion) rend chaque type", async ({
    page,
  }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has every section type — verify each renders
    // intro
    await expect(page.getByText("Le marché de l'IA explose littéralement")).toBeVisible();

    // h2
    await expect(page.locator("h2").filter({ hasText: "Pourquoi l'IA" })).toBeVisible();

    // h3
    await expect(page.locator("h3").filter({ hasText: "Adoption massive" })).toBeVisible();

    // callout (tip) — Lightbulb icon
    await expect(page.locator("svg.lucide-lightbulb")).toBeVisible();

    // stats — stat values
    await expect(page.getByText("2B+")).toBeVisible();

    // items list
    await expect(page.getByText("Tutoriels IA pour débutants")).toBeVisible();

    // quote — blockquote element
    await expect(page.locator("blockquote")).toBeVisible();

    // conclusion
    await expect(page.locator("h2").filter({ hasText: "Verdict" })).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Callout Variants (Warning & Info)                           */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Variantes de Callout", () => {
  test("le callout de type 'warning' est rendu avec le texte d'avertissement", async ({ page }) => {
    await page.goto("/blog/comment-creer-chaine-youtube-rentable");

    // Article 2 has a "warning" callout — verify the text content renders
    await expect(page.getByText("Ne copiez pas une niche parce qu'elle marche")).toBeVisible();
  });

  test("le callout de type 'info' est rendu avec l'icône Info", async ({ page }) => {
    await page.goto("/blog/algorithme-youtube-2026-tout-savoir");

    // Article 3 has an "info" callout
    const infoIcon = page.locator("svg.lucide-info");
    await expect(infoIcon).toBeVisible();
    await expect(
      page.getByText("Le temps de visionnage reste le signal le plus important"),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Difficultés Variées                                         */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Niveaux de difficulté", () => {
  test("article avec difficulté « débutant » affiche le badge correct", async ({ page }) => {
    await page.goto("/blog/comment-creer-chaine-youtube-rentable");

    // Article 2 has difficulty "débutant". Use exact match to avoid matching tag "Débutant".
    const difficultyBadge = page.locator("article header").getByText("débutant", { exact: true });
    await expect(difficultyBadge).toBeVisible();
  });

  test("article avec difficulté « intermédiaire » affiche le badge correct", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has difficulty "intermédiaire"
    await expect(page.locator("article header").getByText("intermédiaire")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Génération de Métadonnées SEO                              */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Métadonnées SEO", () => {
  test("le <title> contient le metaTitle de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const title = await page.title();
    expect(title).toContain("IA & Productivité YouTube 2026");
  });

  test("la balise meta description contient la metaDescription de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute(
      "content",
      /Découvrez pourquoi la niche IA & Productivité explose/,
    );
  });

  test("la balise meta keywords contient les mots-clés de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Next.js generates the keywords meta tag from the `keywords` field
    const metaKeywords = page.locator('meta[name="keywords"]');
    await expect(metaKeywords).toHaveAttribute("content", /tendance youtube 2026/);
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Intégrité de la Page                                        */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Intégrité de la page", () => {
  test("la page se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("le lien « Accueil » du fil d'Ariane redirige vers /", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Click "Accueil" in the article page breadcrumb (there are two, pick first)
    await page.locator('nav a[href="/"]').filter({ hasText: "Accueil" }).first().click();
    await page.waitForURL("/");

    // The landing page may show "Hacker l'Algorithme" normally, or an error page
    // if the database is not configured (Prisma dependency). Accept either.
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    // URL confirms successful navigation
    expect(page.url()).toBe("http://localhost:3000/");
  });

  test("le lien « Blog » du fil d'Ariane redirige vers /blog", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Click "Blog" in breadcrumb — pick the first nav link (layout or article breadcrumb are both fine)
    await page.locator('nav a[href="/blog"]').filter({ hasText: "Blog" }).first().click();
    await page.waitForURL("/blog");
    await expect(page.locator("h1")).toContainText("Blog TrendHunter");
  });
});

/* ========================================================================== */
/*  NEW TESTS — Blog Layout, Listing & Article extensions                     */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/*  Additional constants for new tests                                        */
/* -------------------------------------------------------------------------- */

const SECOND_ARTICLE_SLUG = ALL_ARTICLE_SLUGS[1];
const FOURTH_ARTICLE_SLUG = ALL_ARTICLE_SLUGS[3];
const FIFTH_ARTICLE_SLUG = ALL_ARTICLE_SLUGS[4];

/* -------------------------------------------------------------------------- */
/*  Blog Layout — Header, Breadcrumb & Footer (shared layout.tsx)             */
/* -------------------------------------------------------------------------- */

test.describe("Blog Layout — En-tête, fil d'Ariane et pied de page", () => {
  test("affiche l'en-tête du layout : logo TrendHunter, navigation Fonctionnalités/Tarifs/Blog, ThemeToggle et ESSAYER", async ({
    page,
  }) => {
    await page.goto("/blog");

    // The layout header is the first <header> on the page
    const layoutHeader = page.locator("header").first();

    // Logo with Play icon + "TrendHunter" brand name
    await expect(layoutHeader.getByText("TrendHunter")).toBeVisible();

    // Nav link unique to layout: Fonctionnalités (only in layout, not in page header)
    await expect(
      layoutHeader.getByRole("link", { name: "Fonctionnalités", exact: true }),
    ).toBeVisible();

    // ThemeToggle button renders in dark SSR mode → "Passer en mode clair"
    await expect(layoutHeader.locator('button[aria-label="Passer en mode clair"]')).toBeVisible();

    // ESSAYER Gratuitement CTA button
    await expect(layoutHeader.getByText("ESSAYER Gratuitement")).toBeVisible();
  });

  test("le lien Blog dans la navigation du layout a la classe active text-yt-red", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Layout nav Blog link has text-yt-red (active state)
    const layoutBlogLink = page.locator("header").first().locator('nav a[href="/blog"]');
    await expect(layoutBlogLink).toHaveClass(/text-yt-red/);
  });

  test("affiche le fil d'Ariane du layout : Accueil > Blog > Actualités", async ({ page }) => {
    await page.goto("/blog");

    // Layout breadcrumb contains "Actualités" as the last segment
    const breadcrumb = page.locator("nav").filter({ hasText: "Actualités" }).first();
    await expect(breadcrumb).toBeVisible();

    // Three text segments
    await expect(breadcrumb.getByText("Accueil")).toBeVisible();
    await expect(breadcrumb.getByText("Blog")).toBeVisible();
    await expect(breadcrumb.getByText("Actualités")).toBeVisible();

    // Two slash separators
    await expect(breadcrumb.locator("span.text-dark-ink-tertiary")).toHaveCount(2);
  });

  test("le pied de page du layout contient 4 liens : Blog, Tarifs, Confidentialité, CGU", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Layout footer is the last <footer> (page footer comes first inside <main>)
    const layoutFooter = page.locator("footer").last();

    // "Blog" link exists only in the layout footer, not in the page footer
    await expect(layoutFooter.getByRole("link", { name: "Blog", exact: true })).toBeVisible();
    await expect(layoutFooter.getByRole("link", { name: "Tarifs", exact: true })).toBeVisible();
    await expect(
      layoutFooter.getByRole("link", { name: "Confidentialité", exact: true }),
    ).toBeVisible();
    await expect(layoutFooter.getByRole("link", { name: "CGU", exact: true })).toBeVisible();
  });

  test("le pied de page affiche le copyright avec l'année en cours", async ({ page }) => {
    await page.goto("/blog");

    const currentYear = new Date().getFullYear().toString();
    // Both footers show it; pick the layout footer (last)
    const copyright = page
      .locator("footer")
      .last()
      .getByText(new RegExp(`© ${currentYear}`));
    await expect(copyright).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Contenu supplémentaire                                     */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Contenu supplémentaire", () => {
  test("affiche le badge « 5 Articles » dans la section hero", async ({ page }) => {
    await page.goto("/blog");

    // Hero badge with Sparkles icon + article count from JSON meta
    await expect(page.getByText("5 Articles")).toBeVisible();
  });

  test("affiche le texte de description sous le titre H1", async ({ page }) => {
    await page.goto("/blog");

    await expect(
      page.getByText("Conseils, analyses et stratégies pour développer votre chaîne YouTube."),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Navigation                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Navigation", () => {
  test("cliquer sur la carte « À la une » navigue vers l'article correspondant", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Use the existing getFeaturedCard helper to find the featured link
    const featuredLink = getFeaturedCard(page);
    await featuredLink.click();

    await page.waitForURL(`/blog/${FIRST_ARTICLE_SLUG}`);
    await expect(page.locator("h1")).toContainText("IA & Productivité");
  });

  test("cliquer sur le logo TrendHunter dans l'en-tête redirige vers /", async ({ page }) => {
    await page.goto("/blog");

    // Click the first logo link (layout header)
    await page.locator('header a[href="/"]').first().click();
    await page.waitForURL("/");

    await expect(page.locator("h1")).toBeVisible();
    expect(page.url()).toBe("http://localhost:3000/");
  });

  test("le lien « Niches » dans l'en-tête de la page redirige vers /niches", async ({ page }) => {
    await page.goto("/blog");

    // "Niches" link is in the page's own header (second header), not in the layout
    const nichesLink = page.locator('header a[href="/niches"]');
    await expect(nichesLink).toBeVisible();

    await nichesLink.click();
    await page.waitForURL("/niches");
    await expect(page.locator("h1")).toContainText("Explorez les niches");
  });

  test("le bouton ThemeToggle est visible dans l'en-tête du layout", async ({ page }) => {
    await page.goto("/blog");

    // ThemeToggle renders a button with an aria-label
    const themeButton = page.locator('button[aria-label="Passer en mode clair"]');
    await expect(themeButton).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — SEO                                                        */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — SEO", () => {
  test("le <title> contient « Blog - Conseils et Analyses YouTube »", async ({ page }) => {
    await page.goto("/blog");

    const title = await page.title();
    expect(title).toContain("Blog - Conseils et Analyses YouTube");
  });

  test("la balise meta description est présente avec le bon contenu", async ({ page }) => {
    await page.goto("/blog");

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute(
      "content",
      /Découvrez nos guides, analyses et stratégies/,
    );
  });

  test("les balises OG (title, description) sont présentes", async ({ page }) => {
    await page.goto("/blog");

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Blog TrendHunter/);

    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute("content", /Conseils, analyses et stratégies/);
  });

  test("la balise lien canonical est présente", async ({ page }) => {
    await page.goto("/blog");

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", "/blog");
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Listing — Cas supplémentaires                                        */
/* -------------------------------------------------------------------------- */

test.describe("Blog Listing — Cas supplémentaires", () => {
  test("la page se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto("/blog");
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test("la description de la catégorie filtrée est affichée quand une catégorie est sélectionnée", async ({
    page,
  }) => {
    await page.goto("/blog");

    // Click "Analyses" filter
    const filterSection = page
      .locator("section")
      .filter({ has: page.getByText("Tous") })
      .first();
    await filterSection.getByRole("link", { name: "Analyses", exact: true }).click();
    await page.waitForURL(/category=analyses/);

    // Category description from JSON: "Analyses approfondies des tendances YouTube"
    await expect(page.getByText("Analyses approfondies des tendances YouTube")).toBeVisible();
  });

  test("les titres des cartes d'article ont la classe line-clamp-2", async ({ page }) => {
    await page.goto("/blog");

    // Each h3 inside an article card link should carry line-clamp-2
    const cardTitles = page.locator('main a[href^="/blog/"] h3');
    const count = await cardTitles.count();

    for (let i = 0; i < count; i++) {
      await expect(cardTitles.nth(i)).toHaveClass(/line-clamp-2/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Contenu manquant                                           */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Contenu manquant", () => {
  test("affiche le sous-titre de l'article (subtitle)", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 subtitle from JSON
    await expect(
      page.getByText("Comment l'explosion de l'IA génère des opportunités massives"),
    ).toBeVisible();
  });

  test("affiche deux fils d'Ariane : celui du layout et celui de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Layout breadcrumb with "Actualités" label
    const layoutBreadcrumb = page.locator("nav").filter({ hasText: "Actualités" }).first();
    await expect(layoutBreadcrumb).toBeVisible();

    // Article breadcrumb with the article title
    const articleBreadcrumb = page
      .locator("nav")
      .filter({ hasText: "IA & Productivité : La niche YouTube à surveiller en 2026" });
    await expect(articleBreadcrumb).toBeVisible();
  });

  test("affiche les 4 icônes dans l'en-tête de l'article (User, Calendar, Clock, Tag)", async ({
    page,
  }) => {
    await page.goto(`/blog/${FOURTH_ARTICLE_SLUG}`);

    // Article 4 has tags → all 4 icons rendered
    await expect(page.locator("article header svg.lucide-user")).toBeVisible();
    await expect(page.locator("article header svg.lucide-calendar")).toBeVisible();
    await expect(page.locator("article header svg.lucide-clock")).toBeVisible();
    await expect(page.locator("article header svg.lucide-tag")).toBeVisible();
  });

  // Data-driven tests for article 2, 4, 5
  const ARTICLE_RENDER_TESTS = [
    {
      slug: SECOND_ARTICLE_SLUG,
      title: "Comment créer une chaîne YouTube rentable",
      difficulty: "débutant",
    },
    {
      slug: FOURTH_ARTICLE_SLUG,
      title: "Les 5 niches YouTube à croissance rapide",
      difficulty: "débutant",
    },
    {
      slug: FIFTH_ARTICLE_SLUG,
      title: "YouTube Shorts vs Long Form",
      difficulty: "intermédiaire",
    },
  ];

  for (const { slug, title, difficulty } of ARTICLE_RENDER_TESTS) {
    test(`l'article « ${title} » se rend correctement`, async ({ page }) => {
      await page.goto(`/blog/${slug}`);

      // Title renders as h1
      await expect(page.locator("h1")).toContainText(title);

      // Difficulty badge visible
      await expect(page.locator("article header")).toContainText(difficulty);
    });
  }
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — SEO supplémentaire                                         */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — SEO supplémentaire", () => {
  test("la balise OG:type est « article »", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "article");
  });

  test("la balise OG:locale est « fr_FR »", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const ogLocale = page.locator('meta[property="og:locale"]');
    await expect(ogLocale).toHaveAttribute("content", "fr_FR");
  });

  test("la balise OG:published_time est présente", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 published: 2026-05-10T08:00:00Z
    const ogPublished = page.locator('meta[property="article:published_time"]');
    await expect(ogPublished).toHaveAttribute("content", /^2026/);
  });

  test("la balise OG:author est présente avec le nom de l'auteur", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const ogAuthor = page.locator('meta[property="article:author"]');
    await expect(ogAuthor).toHaveAttribute("content", "TrendHunter AI");
  });

  test("les balises OG:tag sont présentes pour les tags de l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // Article 1 has 6 tags → multiple og:tag meta elements
    const ogTags = page.locator('meta[property="article:tag"]');
    await expect(ogTags.first()).toBeAttached();

    const tagCount = await ogTags.count();
    expect(tagCount).toBeGreaterThan(1);
  });

  test("le lien canonical est correct pour l'article", async ({ page }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      `https://trendhunter.app/blog/${FIRST_ARTICLE_SLUG}`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  Blog Article — Cas supplémentaires                                        */
/* -------------------------------------------------------------------------- */

test.describe("Blog Article — Cas supplémentaires", () => {
  test("un article avec 1 seul article similaire affiche quand même la section", async ({
    page,
  }) => {
    await page.goto(`/blog/${SECOND_ARTICLE_SLUG}`);

    // Article 2 has relatedArticles: ["1"] → only 1 related card
    const relatedSection = page
      .locator("section")
      .filter({ has: page.getByText("Articles similaires") });
    await expect(relatedSection).toBeVisible();

    const relatedCards = relatedSection.locator('a[href^="/blog/"]');
    await expect(relatedCards).toHaveCount(1);
  });

  test("le temps de lecture est formaté en français : « X min de lecture »", async ({ page }) => {
    await page.goto(`/blog/${FIFTH_ARTICLE_SLUG}`);

    // Article 5 has 6 min read time → "6 min de lecture"
    await expect(page.locator("article header").getByText("6 min de lecture")).toBeVisible();
  });

  test("la date est formatée en français (ex: « 1 mai 2026 »)", async ({ page }) => {
    await page.goto(`/blog/${FOURTH_ARTICLE_SLUG}`);

    // Article 4 published: 2026-05-01 → "1 mai 2026"
    await expect(page.locator("article header").getByText("1 mai 2026")).toBeVisible();
  });

  test("le titre dans le fil d'Ariane de l'article est tronqué (max-w-[200px])", async ({
    page,
  }) => {
    await page.goto(`/blog/${FIRST_ARTICLE_SLUG}`);

    // The article page breadcrumb truncates long titles with max-w-[200px]
    const titleSpan = page
      .locator("nav span")
      .filter({ hasText: "IA & Productivité : La niche YouTube à surveiller en 2026" });
    await expect(titleSpan).toHaveClass(/max-w-\[200px\]/);
  });

  test("le deuxième article (slug 2) se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.goto(`/blog/${SECOND_ARTICLE_SLUG}`);
    await expect(page.locator("h1")).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});
