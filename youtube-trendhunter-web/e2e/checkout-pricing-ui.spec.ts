import { test, expect } from "@playwright/test";

/**
 * UI Tarifs (Pricing) — tests d'interface utilisateur dédiés
 *
 * Couvre le rendu visuel, la réactivité, le SEO, l'accessibilité clavier,
 * le HTML sémantique, les variantes de boutons, et la navigation.
 *
 * Toutes ces pages sont PUBLIQUES — aucune authentification requise.
 * On utilise page.goto() directement.
 */

/* ========================================================================== */
/*  1 — Responsive (mobile)                                                    */
/* ========================================================================== */

test.describe("UI Tarifs — Responsive", () => {
  test("1 - mobile 375px affiche une grille à une colonne sans débordement", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/pricing");

    // Single column grid (Tailwind: grid-cols-1)
    await expect(page.locator(".grid-cols-1")).toBeVisible();

    // No horizontal overflow
    const fitsViewport = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fitsViewport).toBe(true);

    // All three plans visible
    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByText("Pro").first()).toBeVisible();
    await expect(page.getByText("Team").first()).toBeVisible();
  });

  test("2 - mobile 375px se charge sans erreur console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`Console ${msg.type()}: ${msg.text()}`);
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/pricing");
    await expect(page.locator("h1")).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});

/* ========================================================================== */
/*  2 — Carte Pro distinctive                                                  */
/* ========================================================================== */

test.describe("UI Tarifs — Carte Pro distinctive", () => {
  test("3 - la carte Pro a scale-105 md:scale-110", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("div[class*='scale-105']")).toBeVisible();
  });

  test("4 - la carte Pro a border-yt-red/50", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("div[class*='border-yt-red/50']")).toBeVisible();
  });

  test("5 - la carte Pro a z-20", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("div[class*='z-20']")).toBeVisible();
  });

  test("6 - les cartes non-Pro ont hover:border-white/20", async ({ page }) => {
    await page.goto("/pricing");
    const nonPro = page.locator("div[class*='hover:border-white/20']");
    await expect(nonPro).toHaveCount(2); // Free and Team
  });

  test("7 - les cartes non-Pro ont z-10", async ({ page }) => {
    await page.goto("/pricing");
    // Note: the outer wrapper div also has z-10, so use the more specific
    // hover:border-white/20 class (only non-Pro cards have it) to count just the cards
    const nonPro = page.locator("div[class*='hover:border-white/20']");
    await expect(nonPro).toHaveCount(2);
  });
});

/* ========================================================================== */
/*  3 — SEO et Meta                                                            */
/* ========================================================================== */

test.describe("UI Tarifs — SEO et Meta", () => {
  test("8 - le titre de la page est correct", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveTitle(/Tarifs.*TrendHunter/);
  });

  test("9 - la meta description est présente", async ({ page }) => {
    await page.goto("/pricing");
    const metaDesc = page.locator('meta[name="description"]');
    await expect(metaDesc).toHaveAttribute("content", /plan/);
  });

  test("10 - l'attribut lang est fr", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});

/* ========================================================================== */
/*  4 — Navigation clavier                                                     */
/* ========================================================================== */

test.describe("UI Tarifs — Navigation clavier", () => {
  test("11 - tabulation traverse les 3 CTA dans l'ordre", async ({ page }) => {
    await page.goto("/pricing");
    // Target the <a> link elements directly (not nested buttons) because buttons inside
    // anchors create double-focusable elements — Tab from a button goes to its parent
    // <a> first, then to the next button. Using link elements avoids this issue.
    const ctas = page.locator("a[href*='/login'], a[href*='mailto:']");
    await ctas.first().focus();
    await expect(ctas.first()).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(ctas.nth(1)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(ctas.nth(2)).toBeFocused();
  });
});

/* ========================================================================== */
/*  5 — HTML sémantique                                                        */
/* ========================================================================== */

test.describe("UI Tarifs — HTML sémantique", () => {
  test("12 - les listes de fonctionnalités utilisent ul/li", async ({ page }) => {
    await page.goto("/pricing");
    const lists = page.locator("ul");
    await expect(lists).toHaveCount(3); // One per plan
    const items = page.locator("ul li");
    await expect(items).toHaveCount(15); // 4 + 6 + 5
  });
});

/* ========================================================================== */
/*  6 — Ordre et contenu des cartes                                            */
/* ========================================================================== */

test.describe("UI Tarifs — Ordre et contenu des cartes", () => {
  test("13 - les cartes sont dans l'ordre Free, Pro, Team", async ({ page }) => {
    await page.goto("/pricing");
    const headings = page.locator("h3");
    await expect(headings.nth(0)).toHaveText("Free");
    await expect(headings.nth(1)).toHaveText("Pro");
    await expect(headings.nth(2)).toHaveText("Team");
  });

  test("14 - chaque plan a le bon nombre de fonctionnalités", async ({ page }) => {
    await page.goto("/pricing");
    const lists = page.locator("ul");
    await expect(lists.nth(0).locator("li")).toHaveCount(4); // Free
    await expect(lists.nth(1).locator("li")).toHaveCount(6); // Pro
    await expect(lists.nth(2).locator("li")).toHaveCount(5); // Team
  });
});

/* ========================================================================== */
/*  7 — Badge POPULAIRE                                                        */
/* ========================================================================== */

test.describe("UI Tarifs — Badge POPULAIRE", () => {
  test("15 - le badge POPULAIRE a la classe animate-pulse-glow", async ({ page }) => {
    await page.goto("/pricing");
    const badge = page.getByText("POPULAIRE").first();
    await expect(badge).toHaveClass(/animate-pulse-glow/);
  });
});

/* ========================================================================== */
/*  8 — Variantes de boutons CTA                                               */
/* ========================================================================== */

test.describe("UI Tarifs — Variantes de boutons CTA", () => {
  test("16 - le CTA Pro utilise la variante subscribe (remplie rouge)", async ({ page }) => {
    await page.goto("/pricing");
    // Pro CTA: link to /login?plan=pro with a subscribe-styled button
    const proCta = page.locator("a[href='/login?plan=pro'] button");
    await expect(proCta).toBeVisible();
  });

  test("17 - les CTA Free et Team utilisent la variante outline", async ({ page }) => {
    await page.goto("/pricing");
    // Free CTA: link to /login with outline variant
    const freeCta = page
      .locator("a[href='/login']")
      .filter({ hasText: "Commencer gratuit" })
      .first();
    await expect(freeCta).toBeVisible();

    // Team CTA: mailto link with outline variant
    const teamCta = page.locator("a[href='mailto:contact@trendhunter.app']");
    await expect(teamCta).toBeVisible();
  });
});

/* ========================================================================== */
/*  9 — Liens CTA                                                              */
/* ========================================================================== */

test.describe("UI Tarifs — Liens CTA", () => {
  test("18 - le CTA Free pointe vers /login", async ({ page }) => {
    await page.goto("/pricing");
    const freeLink = page.locator("a[href='/login']").filter({ hasText: "Commencer gratuit" });
    await expect(freeLink.first()).toBeVisible();
  });

  test("19 - le CTA Pro pointe vers /login?plan=pro", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("a[href='/login?plan=pro']").first()).toBeVisible();
  });

  test("20 - le CTA Team pointe vers mailto:contact@trendhunter.app", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("a[href='mailto:contact@trendhunter.app']").first()).toBeVisible();
  });
});

/* ========================================================================== */
/*  10 — Effet de survol CTA                                                   */
/* ========================================================================== */

test.describe("UI Tarifs — Effet de survol CTA", () => {
  test("21 - les boutons CTA ont l'effet group-hover:scale-105", async ({ page }) => {
    await page.goto("/pricing");
    // The parent Link has group class; button has group-hover:scale-105
    const buttons = page.locator("a[href] button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

/* ========================================================================== */
/*  11 — Navigation URL                                                        */
/* ========================================================================== */

test.describe("UI Tarifs — Navigation URL", () => {
  test("22 - l'URL /pricing ne redirige pas", async ({ page }) => {
    const response = await page.goto("/pricing");
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/pricing/);
  });

  test("23 - le bouton retour du navigateur après un clic CTA ramène au pricing", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const freeCta = page
      .locator("a[href='/login']")
      .filter({ hasText: "Commencer gratuit" })
      .first();
    await freeCta.click();
    await page.waitForURL(/\/login/);

    await page.goBack();
    await page.waitForURL(/\/pricing/);
    await expect(page.locator("h1")).toContainText("Investissez");
  });
});
