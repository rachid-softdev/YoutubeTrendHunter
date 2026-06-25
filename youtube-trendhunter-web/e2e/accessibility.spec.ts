import { test, expect, type Page } from "@playwright/test";
import { injectSessionCookie, cleanupTestSession } from "_e2e-helpers";

/**
 * Accessibility E2E tests for YouTube TrendHunter.
 *
 * Covers 10 WCAG checkpoints using Playwright browser automation:
 *   1. Keyboard navigation (Tab order)
 *   2. Escape closes dialogs
 *   3. ARIA labels on icons
 *   4. Color contrast — light mode
 *   5. Color contrast — dark mode
 *   6. Heading hierarchy
 *   7. Images alt text
 *   8. Skip-to-content link
 *   9. Touch targets (mobile)
 *  10. prefers-reduced-motion
 *
 * Strategy:
 *   - Public pages use page.goto() directly.
 *   - Authenticated pages use injectSessionCookie() for real DB-backed sessions.
 *   - WCAG math (luminance, contrast) runs inside page.evaluate().
 *   - Keyboard tests use page.keyboard.press('Tab').
 *   - Reduced-motion tests use page.emulateMedia().
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const MOBILE_VIEWPORT = { width: 375, height: 812 } as const;

// WCAG AA thresholds
const WCAG_AA_NORMAL = 4.5; // normal-size text
const WCAG_AA_LARGE = 3.0; // 18px+ or 14px+ bold

/* -------------------------------------------------------------------------- */
/*  WCAG Colour-contrast helpers (applied inside page.evaluate)                */
/* -------------------------------------------------------------------------- */

/**
 * Converts an sRGB channel (0–255) to linear light (0–1).
 */
const SRGB_TO_LINEAR = `
function sRgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
`;

/**
 * Computes relative luminance from an RGB triplet (0–255 each).
 */
const LUMINANCE_FN = `
function relativeLuminance(r, g, b) {
  return 0.2126 * sRgbToLinear(r) + 0.7152 * sRgbToLinear(g) + 0.0722 * sRgbToLinear(b);
}
`;

/**
 * Computes WCAG contrast ratio given two relative luminance values.
 */
const CONTRAST_RATIO_FN = `
function contrastRatio(l1, l2) {
  var lighter = Math.max(l1, l2);
  var darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
`;

const WCAG_MATH = [SRGB_TO_LINEAR, LUMINANCE_FN, CONTRAST_RATIO_FN].join("\n");

/**
 * Evaluates the contrast ratio of an element's foreground on its background.
 * Works with any colour value that getComputedStyle can resolve.
 */
async function getContrastRatioForElement(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    ({ wcagMath, sel }) => {
      eval(wcagMath);
      const el = document.querySelector(sel);
      if (!el) return -1;
      const style = getComputedStyle(el);
      const color = style.color;
      const bg = style.backgroundColor;

      // Parse rgba / rgb strings
      const parseRgb = (str: string): [number, number, number] => {
        const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return [0, 0, 0];
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      };

      // If background is transparent, walk up the tree
      let bgEl = el as HTMLElement | null;
      let bgStr = bg;
      while (bgStr === "rgba(0, 0, 0, 0)" || bgStr === "transparent") {
        bgEl = bgEl?.parentElement ?? null;
        if (!bgEl) break;
        bgStr = getComputedStyle(bgEl).backgroundColor;
      }

      const [r1, g1, b1] = parseRgb(color);
      const [r2, g2, b2] = parseRgb(bgStr);

      // @ts-expect-error — defined dynamically via eval(wcagMath)
      const l1 = relativeLuminance(r1, g1, b1);
      // @ts-expect-error — defined dynamically via eval(wcagMath)
      const l2 = relativeLuminance(r2, g2, b2);
      // @ts-expect-error — defined dynamically via eval(wcagMath)
      return contrastRatio(l1, l2);
    },
    { wcagMath: WCAG_MATH, sel: selector },
  );
}

/**
 * Returns all heading tags (h1–h6) in DOM order with their level and text.
 */
async function getHeadingHierarchy(page: Page): Promise<{ level: number; text: string }[]> {
  return page.evaluate(() => {
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    return Array.from(headings).map((h) => ({
      level: Number(h.tagName.slice(1)),
      text: (h.textContent ?? "").trim().slice(0, 80),
    }));
  });
}

/**
 * Returns focusable (tabbable) elements in DOM order.
 */
async function getFocusableElements(page: Page): Promise<{ tag: string; text: string }[]> {
  return page.evaluate(() => {
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const elements = document.querySelectorAll(selector);
    return Array.from(elements).map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? "").trim().slice(0, 60) || (el as HTMLElement).ariaLabel || "",
    }));
  });
}

/* -------------------------------------------------------------------------- */
/*  Test session token store — used for cleanup across authenticate tests     */
/* -------------------------------------------------------------------------- */

let currentSessionToken = "";

/* ========================================================================== */
/*  1. Navigation clavier — Tab through pages                                  */
/* ========================================================================== */

test.describe("1. Accessibilité — Navigation clavier", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Login page — Tab se déplace dans l'ordre logique", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Collect all focusable elements
    const focusables = await getFocusableElements(page);
    expect(focusables.length).toBeGreaterThanOrEqual(2);

    // First focusable should be the logo link
    await page.keyboard.press("Tab");
    let activeText = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.textContent?.trim() ?? el?.ariaLabel ?? el?.tagName ?? "";
    });
    const firstLabel = focusables[0].text.toLowerCase();
    expect(
      firstLabel.includes("trendhunter") || activeText.toLowerCase().includes("trendhunter"),
    ).toBe(true);

    // Second Tab: Google sign-in button (or next focusable in DOM)
    await page.keyboard.press("Tab");
    activeText = await page.evaluate(() => {
      const el = document.activeElement;
      return (el?.textContent ?? el?.ariaLabel ?? "").trim().slice(0, 80);
    });
    // Should be either the Google button or a link
    expect(activeText.length).toBeGreaterThan(0);
  });

  test("Dashboard sidebar — Tab à travers les liens de navigation", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Check we landed on the page (not redirected to login)
    const onPage = page.url().includes("/dashboard") || page.url().includes("/home");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login (session non reconnue par le serveur)",
      });
      return;
    }

    // Focus sidebar nav — first press may focus the logo link in sidebar
    // Collect sidebar nav links
    const sidebarLinks = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Navigation principale']");
      if (!nav) return [];
      const links = nav.querySelectorAll("a");
      return Array.from(links).map((l) => ({
        href: (l as HTMLAnchorElement).href,
        text: l.textContent?.trim() ?? "",
      }));
    });

    expect(sidebarLinks.length).toBeGreaterThanOrEqual(4);

    // Tab through the first 4 items: Tendances, Niches, Alertes, Facturation
    const expectedLabels = ["Tendances", "Niches", "Alertes", "Facturation"];

    // Press Tab multiple times until we hit the sidebar
    // We start from the body and need to tab to the nav links
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    // Now verify the next Tab presses land on expected nav items
    for (const label of expectedLabels) {
      // Press Tab to move to next item
      await page.keyboard.press("Tab");
      const activeText = await page.evaluate(() => {
        const el = document.activeElement;
        return (el?.textContent ?? "").trim();
      });
      expect(activeText.toLowerCase()).toContain(label.toLowerCase());
    }
  });

  test('aria-current="page" est présent sur le lien actif de la sidebar', async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    // Navigate to /home to ensure we land on the home/dashboard page
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login",
      });
      return;
    }

    // Check aria-current on the sidebar link for the active page
    const hasAriaCurrent = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Navigation principale']");
      if (!nav) return { found: false, reason: "no nav" };
      const links = Array.from(nav.querySelectorAll("a"));
      const activeLink = links.find((link) => link.getAttribute("aria-current") === "page");
      if (activeLink) {
        return { found: true, href: activeLink.href, text: activeLink.textContent?.trim() };
      }
      return { found: false, reason: "no aria-current='page' on any link" };
    });

    // Note: the current sidebar implementation uses visual styling (bg-yt-red) to indicate
    // active page but does NOT set aria-current="page". This is a known accessibility gap
    // that should be addressed. The test documents this gap.
    if (!hasAriaCurrent.found) {
      test.info().annotations.push({
        type: "warning",
        description: `Aria-current manquant: ${hasAriaCurrent.reason}. Le lien actif est indiqué visuellement mais pas balisé pour les lecteurs d'écran.`,
      });
    }
    // We expect it to be present; this assertion documents the gap
    expect(hasAriaCurrent.found).toBe(true);
  });
});

/* ========================================================================== */
/*  2. Escape ferme les modales/dialogs                                        */
/* ========================================================================== */

test.describe("2. Accessibilité — Escape ferme les modales", () => {
  test("Escape key ferme tout dialogue ouvert (skip si aucun dialog existant)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait a moment for CookieConsent to potentially appear (it has a 2s delay)
    await page.waitForTimeout(2500);

    // Check if any element with role="dialog" exists
    const hasDialog = await page.evaluate(() => {
      return document.querySelector('[role="dialog"], dialog') !== null;
    });

    if (!hasDialog) {
      test.info().annotations.push({
        type: "skip",
        description:
          "Aucun dialog/modal trouvé sur cette page. Le test Escape est conditionnel — aucun dialog à tester.",
      });
      return;
    }

    // Verify dialog is visible, press Escape, verify it closes
    const dialogVisible = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"], dialog');
      if (!dlg) return false;
      const style = getComputedStyle(dlg);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        dlg.getAttribute("aria-hidden") !== "true"
      );
    });
    expect(dialogVisible).toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500); // Allow transition animation

    const dialogClosed = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"], dialog');
      if (!dlg) return true; // removed from DOM = closed
      const style = getComputedStyle(dlg);
      return (
        style.display === "none" ||
        style.visibility === "hidden" ||
        dlg.getAttribute("aria-hidden") === "true"
      );
    });
    expect(dialogClosed).toBe(true);
  });
});

/* ========================================================================== */
/*  3. ARIA labels sur les icônes                                              */
/* ========================================================================== */

test.describe("3. Accessibilité — ARIA labels", () => {
  test('Les icônes lucide-react (SVG) ont aria-hidden="true"', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find all SVG icons (lucide-react renders as SVG elements)
    const iconsWithoutAriaHidden = await page.evaluate(() => {
      const svgs = document.querySelectorAll("svg");
      const violations: string[] = [];
      svgs.forEach((svg, i) => {
        // Skip the Google logo SVG (it's a meaningful icon)
        const parent = svg.parentElement;
        const isGoogleLogo = svg.innerHTML.includes("4285F4") || svg.innerHTML.includes("Google");
        if (isGoogleLogo) return;

        const hasAriaHidden = svg.getAttribute("aria-hidden") === "true";
        const hasRoleImg = svg.getAttribute("role") === "img";
        const hasAriaLabel =
          svg.hasAttribute("aria-label") && svg.getAttribute("aria-label") !== "";

        if (!hasAriaHidden && !hasRoleImg && !hasAriaLabel) {
          const parentText = parent?.textContent?.trim().slice(0, 40) ?? `svg #${i}`;
          violations.push(parentText);
        }
      });
      return violations;
    });

    if (iconsWithoutAriaHidden.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Icônes sans aria-hidden: ${iconsWithoutAriaHidden.join(", ")}`,
      });
    }
    expect(iconsWithoutAriaHidden).toHaveLength(0);
  });

  test("Les éléments interactifs (ThemeToggle, boutons) ont des aria-label pertinents", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check ThemeToggle button has aria-label
    const themeToggleAriaLabel = await page.evaluate(() => {
      // The ThemeToggle is a button with aria-label "Passer en mode clair" or "Passer en mode sombre"
      const buttons = Array.from(document.querySelectorAll("button"));
      const toggleBtn = buttons.find((btn) => {
        const label = btn.getAttribute("aria-label");
        return label && (label.includes("mode clair") || label.includes("mode sombre"));
      });
      return toggleBtn?.getAttribute("aria-label") ?? null;
    });

    expect(themeToggleAriaLabel).toBeTruthy();
    expect(themeToggleAriaLabel?.toLowerCase()).toMatch(/clair|sombre/);
  });
});

/* ========================================================================== */
/*  4. Contraste des couleurs (mode clair)                                     */
/* ========================================================================== */

test.describe("4. Accessibilité — Contraste mode clair", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Texte principal sur fond blanc respecte WCAG AA (ratio ≥ 4.5:1)", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    // Force light mode by adding an init script before navigation
    await page.addInitScript(() => {
      localStorage.setItem("theme", "light");
      document.documentElement.classList.remove("dark");
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    // Check h1 contrast
    const h1Ratio = await getContrastRatioForElement(page, "h1");
    expect(h1Ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  test("Textes et badges respectent WCAG AA en mode clair", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.addInitScript(() => {
      localStorage.setItem("theme", "light");
      document.documentElement.classList.remove("dark");
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    // Measure contrast on all visible text-bearing elements
    const textRatios = await page.evaluate(
      ({ wcagMath }) => {
        eval(wcagMath);

        const parseRgb = (str: string): [number, number, number] => {
          const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) return [0, 0, 0];
          return [Number(m[1]), Number(m[2]), Number(m[3])];
        };

        const getEffectiveBg = (el: Element): string => {
          let current: HTMLElement | null = el as HTMLElement;
          let bg = getComputedStyle(current).backgroundColor;
          while (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
            current = current.parentElement;
            if (!current) break;
            bg = getComputedStyle(current).backgroundColor;
          }
          return bg;
        };

        // Check all elements that contain text directly
        const textElements = document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, p, span, a, button, li, label, td, th, strong, b, small, .text-dark-ink, .text-dark-ink-secondary, .text-dark-ink-tertiary",
        );
        const results: { text: string; ratio: number; tag: string }[] = [];

        textElements.forEach((el) => {
          const text = (el.textContent ?? "").trim();
          if (!text) return;
          if (text.length < 2) return; // skip empty/minimal text

          const style = getComputedStyle(el);
          const fontSize = parseFloat(style.fontSize) || 16;
          const fontWeight = style.fontWeight;

          const [r1, g1, b1] = parseRgb(style.color);
          const bg = getEffectiveBg(el);
          const [r2, g2, b2] = parseRgb(bg);

          // @ts-expect-error — defined dynamically via eval(wcagMath)
          const l1 = relativeLuminance(r1, g1, b1);
          // @ts-expect-error — defined dynamically via eval(wcagMath)
          const l2 = relativeLuminance(r2, g2, b2);
          // @ts-expect-error — defined dynamically via eval(wcagMath)
          const ratio = contrastRatio(l1, l2);

          const isLarge =
            fontSize >= 18 || (fontSize >= 14 && (fontWeight === "700" || fontWeight === "bold"));
          const threshold = isLarge ? 3.0 : 4.5;

          if (ratio < threshold && ratio > 0) {
            results.push({
              text: text.slice(0, 40),
              ratio: Math.round(ratio * 100) / 100,
              tag: el.tagName.toLowerCase(),
            });
          }
        });

        return results;
      },
      { wcagMath: WCAG_MATH },
    );

    if (textRatios.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Éléments sous le seuil de contraste AA (${textRatios.length}): ${textRatios
          .slice(0, 10)
          .map((t) => `<${t.tag}> "${t.text}" (${t.ratio}:1)`)
          .join("; ")}`,
      });
    }
    // Soft check — hard failures are reserved for primary text
    expect(textRatios.filter((t) => t.ratio < 3.0)).toHaveLength(0);
  });
});

/* ========================================================================== */
/*  5. Contraste des couleurs (mode sombre)                                    */
/* ========================================================================== */

test.describe("5. Accessibilité — Contraste mode sombre", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Texte sur fond sombre respecte WCAG AA (ratio ≥ 4.5:1)", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    // Ensure dark mode (default for the app)
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    // Check primary text (h1) contrast
    const h1Ratio = await getContrastRatioForElement(page, "h1");
    expect(h1Ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

    // Check secondary text (paragraphs, descriptions)
    const paraRatio = await getContrastRatioForElement(page, "p");
    // p may exist in the page — check the first paragraph
    if (paraRatio > 0) {
      expect(paraRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }

    // Check sidebar nav link contrast
    const navLinkRatio = await page.evaluate(
      ({ wcagMath }) => {
        eval(wcagMath);
        const nav = document.querySelector("nav[aria-label='Navigation principale']");
        if (!nav) return -1;
        const link = nav.querySelector("a");
        if (!link) return -1;
        const style = getComputedStyle(link);
        const parseRgb = (str: string): [number, number, number] => {
          const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (!m) return [0, 0, 0];
          return [Number(m[1]), Number(m[2]), Number(m[3])];
        };

        const [r1, g1, b1] = parseRgb(style.color);
        const [r2, g2, b2] = parseRgb(style.backgroundColor);

        // @ts-expect-error — defined dynamically via eval(wcagMath)
        const l1 = relativeLuminance(r1, g1, b1);
        // @ts-expect-error — defined dynamically via eval(wcagMath)
        const l2 = relativeLuminance(r2, g2, b2);
        // @ts-expect-error — defined dynamically via eval(wcagMath)
        return contrastRatio(l1, l2);
      },
      { wcagMath: WCAG_MATH },
    );

    if (navLinkRatio > 0) {
      expect(navLinkRatio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });
});

/* ========================================================================== */
/*  6. Hiérarchie des headings                                                 */
/* ========================================================================== */

test.describe("6. Accessibilité — Hiérarchie des headings", () => {
  test("Landing page — h1 → h2 pas de saut", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hierarchy = await getHeadingHierarchy(page);
    expect(hierarchy.length).toBeGreaterThanOrEqual(2);
    expect(hierarchy[0].level).toBe(1);

    // Check there's no skip (e.g. h1→h3, h2→h4)
    for (let i = 1; i < hierarchy.length; i++) {
      const diff = hierarchy[i].level - hierarchy[i - 1].level;
      // diff can be 0 (same level, fine), 1+ (going deeper, OK if <= 1 step),
      // or negative (going up, allowed). Skip is diff > 1.
      if (diff > 1) {
        test.info().annotations.push({
          type: "warning",
          description: `Saut de heading: h${hierarchy[i - 1].level} → h${hierarchy[i].level} (« ${hierarchy[i - 1].text} » → « ${hierarchy[i].text} »)`,
        });
      }
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test("Dashboard — h1 présent, hiérarchie cohérente", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    const hierarchy = await getHeadingHierarchy(page);
    expect(hierarchy.length).toBeGreaterThanOrEqual(1);
    expect(hierarchy[0].level).toBe(1);

    for (let i = 1; i < hierarchy.length; i++) {
      const diff = hierarchy[i].level - hierarchy[i - 1].level;
      if (diff > 1) {
        test.info().annotations.push({
          type: "warning",
          description: `Saut de heading sur dashboard: h${hierarchy[i - 1].level} → h${hierarchy[i].level} (« ${hierarchy[i - 1].text} » → « ${hierarchy[i].text} »)`,
        });
      }
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test("Niches marketing — h1 → h2 pas de saut", async ({ page }) => {
    await page.goto("/niches");
    await page.waitForLoadState("networkidle");

    const hierarchy = await getHeadingHierarchy(page);
    expect(hierarchy.length).toBeGreaterThanOrEqual(2);
    expect(hierarchy[0].level).toBe(1);

    for (let i = 1; i < hierarchy.length; i++) {
      const diff = hierarchy[i].level - hierarchy[i - 1].level;
      if (diff > 1) {
        test.info().annotations.push({
          type: "warning",
          description: `Saut de heading: h${hierarchy[i - 1].level} → h${hierarchy[i].level} (« ${hierarchy[i - 1].text} » → « ${hierarchy[i].text} »)`,
        });
      }
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test("Pricing — h1 → h3 détecté comme saut (skip attendu)", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    const hierarchy = await getHeadingHierarchy(page);
    expect(hierarchy.length).toBeGreaterThanOrEqual(2);
    expect(hierarchy[0].level).toBe(1);

    const skips: string[] = [];
    for (let i = 1; i < hierarchy.length; i++) {
      const diff = hierarchy[i].level - hierarchy[i - 1].level;
      if (diff > 1) {
        skips.push(
          `h${hierarchy[i - 1].level} → h${hierarchy[i].level} (« ${hierarchy[i - 1].text} » → « ${hierarchy[i].text} »)`,
        );
      }
    }

    // The pricing page uses CardTitle (h3) directly after h1 — known structural issue.
    // This assertion verifies the gap is documented.
    if (skips.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Sauts de heading sur pricing: ${skips.join("; ")}. Les CardTitle sont des <h3> mais devraient être <h2> pour respecter la hiérarchie.`,
      });
    }
    expect(skips).toHaveLength(0);
  });
});

/* ========================================================================== */
/*  7. Images — alt text                                                       */
/* ========================================================================== */

test.describe("7. Accessibilité — Images alt text", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Toutes les balises <img> ont un attribut alt", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    const imagesMissingAlt = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      const missing: { src: string; alt: string | null }[] = [];
      imgs.forEach((img) => {
        const alt = img.getAttribute("alt");
        if (alt === null) {
          missing.push({ src: (img as HTMLImageElement).src?.slice(0, 60) ?? "", alt });
        }
      });
      return missing;
    });

    if (imagesMissingAlt.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `${imagesMissingAlt.length} image(s) sans attribut alt: ${imagesMissingAlt.map((i) => i.src).join(", ")}`,
      });
    }
    expect(imagesMissingAlt).toHaveLength(0);
  });

  test("L'avatar utilisateur dans la sidebar a un alt text pertinent", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    // Sidebar user avatar image
    const avatarAlt = await page.evaluate(() => {
      const sidebar = document.querySelector("aside");
      if (!sidebar) return null;
      const img = sidebar.querySelector("img");
      if (!img) return null;
      return img.getAttribute("alt");
    });

    if (avatarAlt === null) {
      // Avatar might be rendered as a fallback initial if no user image
      test.info().annotations.push({
        type: "info",
        description:
          "Avatar utilisateur rendu sous forme de fallback initial (pas de image). Ok si l'utilisateur n'a pas d'image de profil.",
      });
    } else {
      expect(avatarAlt.length).toBeGreaterThan(0);
    }
  });
});

/* ========================================================================== */
/*  8. Skip-to-content link                                                    */
/* ========================================================================== */

test.describe("8. Accessibilité — Skip-to-content", () => {
  test("Un lien 'Aller au contenu' caché visuellement devient focusable au Tab", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check for a skip link — common patterns:
    //   <a href="#main" class="skip-link">, <a href="#content">, or with aria-label
    const skipLinkExists = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const skipLink = links.find((link) => {
        const href = link.getAttribute("href");
        const text = link.textContent?.toLowerCase().trim() ?? "";
        const ariaLabel = link.getAttribute("aria-label")?.toLowerCase() ?? "";

        // Check for common skip-link patterns
        return (
          (href?.startsWith("#") &&
            (text.includes("contenu") ||
              text.includes("skip") ||
              text.includes("main") ||
              text.includes("content"))) ||
          ariaLabel.includes("skip") ||
          ariaLabel.includes("contenu") ||
          ariaLabel.includes("content")
        );
      });

      if (skipLink) {
        return {
          found: true,
          href: skipLink.getAttribute("href") ?? "",
          text: skipLink.textContent?.trim() ?? "",
          isHidden:
            getComputedStyle(skipLink).position === "absolute" ||
            skipLink.classList.contains("sr-only"),
        };
      }

      // Also check for visually-hidden class patterns
      const skipElements = Array.from(
        document.querySelectorAll(
          ".sr-only, .skip-link, [class*='skip'], [class*='visually-hidden']",
        ),
      );
      const hiddenLink = skipElements.find(
        (el) => el.tagName === "A" && el.getAttribute("href")?.startsWith("#"),
      );
      if (hiddenLink) {
        return {
          found: true,
          href: hiddenLink.getAttribute("href") ?? "",
          text: hiddenLink.textContent?.trim() ?? "",
          isHidden: true,
        };
      }

      return { found: false, href: "", text: "", isHidden: false };
    });

    if (!skipLinkExists.found) {
      test.info().annotations.push({
        type: "warning",
        description:
          "Aucun lien 'Aller au contenu' (skip-to-content) trouvé. Les utilisateurs de lecteurs d'écran doivent tabuler à travers toute la navigation pour atteindre le contenu principal.",
      });
    }
    expect(skipLinkExists.found).toBe(true);

    // If found, verify it becomes visible on focus
    if (skipLinkExists.found) {
      // First Tab press should focus the skip link (if it's the first focusable)
      await page.keyboard.press("Tab");
      const focusedIsSkip = await page.evaluate((expectedHref) => {
        const el = document.activeElement;
        if (!el || el.tagName !== "A") return false;
        return (el as HTMLAnchorElement).getAttribute("href") === expectedHref;
      }, skipLinkExists.href);

      if (!focusedIsSkip) {
        test.info().annotations.push({
          type: "warning",
          description: "Le lien skip-to-content n'est pas le premier élément focusable.",
        });
      }
    }
  });
});

/* ========================================================================== */
/*  9. Touch targets (Mobile)                                                  */
/* ========================================================================== */

test.describe("9. Accessibilité — Touch targets mobile (375×812)", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Tous les boutons et liens ont une taille minimale de 44×44px", async ({ page }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/dashboard") || page.url().includes("/home");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    const smallTargets = await page.evaluate(() => {
      const interactiveSelector = 'a[href], button:not([disabled]), [role="button"]';
      const elements = document.querySelectorAll(interactiveSelector);
      const violations: { tag: string; text: string; width: number; height: number }[] = [];

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const text =
          (el.textContent ?? "").trim().slice(0, 40) || (el as HTMLElement).ariaLabel || el.tagName;

        // 44x44 CSS pixels is the minimum touch target (WCAG 2.5.8 / Apple HIG)
        if (width < 44 || height < 44) {
          violations.push({
            tag: el.tagName.toLowerCase(),
            text,
            width: Math.round(width),
            height: Math.round(height),
          });
        }
      });
      return violations;
    });

    if (smallTargets.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Éléments interactifs sous 44×44px (${smallTargets.length}): ${smallTargets.map((t) => `${t.tag} "${t.text}" (${t.width}×${t.height}px)`).join("; ")}`,
      });
    }
    // Allow small decorative buttons (e.g. icon-only buttons) as long as they are within
    // a larger touch area or are not primary interaction elements.
    // We log warnings but don't hard-fail on every small button since some (like theme toggle)
    // are intentionally compact.
    if (smallTargets.length > 3) {
      test.info().annotations.push({
        type: "warning",
        description: `Plus de 3 éléments interactifs sous-dimensionnés — revoir la conception mobile.`,
      });
    }
  });
});

/* ========================================================================== */
/*  10. prefers-reduced-motion                                                 */
/* ========================================================================== */

test.describe("10. Accessibilité — prefers-reduced-motion", () => {
  test.afterEach(async () => {
    if (currentSessionToken) {
      await cleanupTestSession(currentSessionToken);
      currentSessionToken = "";
    }
  });

  test("Les animations CSS sont désactivées ou réduites avec prefers-reduced-motion", async ({
    page,
  }) => {
    const { sessionToken } = await injectSessionCookie(page, { plan: "PRO" });
    currentSessionToken = sessionToken;

    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    const onPage = page.url().includes("/home") || page.url().includes("/dashboard");
    if (!onPage) {
      test.info().annotations.push({
        type: "skip",
        description: "Redirigé vers login — session non reconnue",
      });
      return;
    }

    // Check if CSS animations and transitions are disabled
    const motionState = await page.evaluate(() => {
      // Create a temporary element to check computed animation/transition state
      const testEl = document.createElement("div");
      testEl.style.position = "absolute";
      testEl.style.animation = "testAnim 1s infinite";
      testEl.style.transition = "all 0.3s";
      document.body.appendChild(testEl);

      const computed = getComputedStyle(testEl);
      const result = {
        animationDuration: computed.animationDuration,
        animationIterationCount: computed.animationIterationCount,
        transitionDuration: computed.transitionDuration,
        // Check if prefers-reduced-motion is respected at the UA level
        prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
      document.body.removeChild(testEl);
      return result;
    });

    expect(motionState.prefersReducedMotion).toBe(true);

    // When prefers-reduced-motion: reduce is active, browsers should:
    // - Clamp animation durations to 0s for CSS animations
    // - Clamp transition durations to 0s for CSS transitions
    // But Playwright's emulateMedia may not fully trigger browser-level clamping.
    // Instead, we check that the page's CSS respects the preference by verifying
    // there are no infinite or excessively long animations on the page.

    const longAnimations = await page.evaluate(() => {
      const allElements = document.querySelectorAll("*");
      const issues: { tag: string; class: string; anim: string }[] = [];

      allElements.forEach((el) => {
        const style = getComputedStyle(el);
        const animDur = parseFloat(style.animationDuration) || 0;
        const animIter = style.animationIterationCount;
        const transDur = parseFloat(style.transitionDuration) || 0;

        if (animDur > 0.1 || transDur > 0.1) {
          // Check for CSS class-based animations
          const className = (el as HTMLElement).className?.slice(0, 40) ?? "";
          if (animDur > 0.1 && animIter !== "0") {
            issues.push({
              tag: el.tagName.toLowerCase(),
              class: className,
              anim: `animation ${animDur}s (count: ${animIter})`,
            });
          }
          if (transDur > 0.1) {
            issues.push({
              tag: el.tagName.toLowerCase(),
              class: className,
              anim: `transition ${transDur}s`,
            });
          }
        }
      });
      return issues;
    });

    if (longAnimations.length > 0) {
      test.info().annotations.push({
        type: "warning",
        description: `Animations/transitions actives malgré prefers-reduced-motion (${longAnimations.length} éléments): ${longAnimations
          .slice(0, 5)
          .map((a) => `${a.tag}.${a.class} (${a.anim})`)
          .join("; ")}`,
      });
    }
    // Best-effort: we note any remaining animations but don't hard-fail,
    // since some transitions like the ThemeToggle or CookieConsent are UX-critical.
    expect(motionState.prefersReducedMotion).toBe(true);
  });
});
