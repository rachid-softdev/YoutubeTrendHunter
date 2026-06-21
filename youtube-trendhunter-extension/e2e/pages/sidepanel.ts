import type { Page, Locator } from "@playwright/test";

// ── Storage helpers ───────────────────────────────────────────────

/**
 * Storage keys used by the extension's authentication flow.
 * The sidepanel reads apiToken from chrome.storage.session on mount.
 */
const STORAGE_KEYS = {
  API_TOKEN: "apiToken",
  SELECTED_NICHE: "selectedNiche",
} as const;

/**
 * Pre-fill the extension's session storage with a mock API token.
 * Must be called from a page that has extension API access
 * (e.g., after navigating to chrome-extension://<id>/sidepanel.html).
 */
export async function setStorageToken(page: Page, token: string) {
  await page.evaluate((t: string) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set({ apiToken: t }, resolve);
    });
  }, token);
}

/**
 * Remove the API token from session storage (simulate logout).
 */
export async function clearStorage(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.remove("apiToken", resolve);
    });
  });
}

/**
 * Get the currently stored token from session storage.
 * Returns null if no token is stored.
 */
export async function getStorageToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      chrome.storage.session.get("apiToken", (result) => {
        resolve(result.apiToken ?? null);
      });
    });
  });
}

// ── API mock helpers ──────────────────────────────────────────────

/**
 * Default successful niches response matching the shape used by the app.
 */
export const MOCK_NICHES = [
  { slug: "tech-ia", name: "Tech & IA" },
  { slug: "finance-personnelle", name: "Finance" },
  { slug: "fitness", name: "Fitness" },
  { slug: "cuisine", name: "Cuisine" },
  { slug: "business-en-ligne", name: "Business en ligne" },
];

/**
 * Default successful trends response matching the shape used by the app.
 */
export const MOCK_TRENDS = [
  {
    id: "1",
    title: "Comment l'IA transforme le marketing en 2026",
    keyword: "IA marketing 2026",
    score: 92,
    velocity: 145.5,
    videoCount: 1287,
    contentAngles: ["Tutoriel pratique", "Analyse comparative", "Cas client"],
  },
  {
    id: "2",
    title: "Les meilleurs outils no-code pour entrepreneurs",
    keyword: "outils no-code",
    score: 78,
    velocity: 89.2,
    videoCount: 654,
    contentAngles: ["Liste comparative", "Tutoriel débutant"],
  },
  {
    id: "3",
    title: "Pourquoi votre stratégie SEO est obsolète",
    keyword: "SEO 2026",
    score: 45,
    velocity: 23.1,
    videoCount: 312,
  },
];

// ── Page Object Model ─────────────────────────────────────────────

/**
 * Page Object Model for the sidepanel app.
 *
 * The sidepanel is served at chrome-extension://<extensionId>/sidepanel.html
 * and renders a React app with three screens: loading, auth, and main.
 *
 * Usage:
 * ```ts
 * const sidepanel = await openSidepanel(page, extensionId);
 * await expect(sidepanel.getAuthScreen()).toBeVisible();
 * ```
 */
export async function openSidepanel(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  // Wait for React to mount (app renders into #root)
  await page.waitForSelector("#root");

  // ── Page Object ──────────────────────────────────────────────────
  const sidepanel = {
    // ── Screen locators ────────────────────────────────────────────

    /** Auth screen container (.auth-screen) */
    getAuthScreen: (): Locator => page.locator(".auth-screen"),
    /** Main screen indicator: app-header is always present on main */
    getMainScreen: (): Locator => page.locator(".app-header"),
    /** Loading screen container (.loading-screen) */
    getLoadingScreen: (): Locator => page.locator(".loading-screen"),

    // ── Auth Screen elements ───────────────────────────────────────

    /** Auth screen title <h2> */
    getAuthTitle: (): Locator => page.locator(".auth-box h2"),
    /** Auth screen description <p> */
    getAuthDescription: (): Locator => page.locator(".auth-box > p"),
    /** Token input field */
    getTokenInput: (): Locator => page.locator(".input-field"),
    /** Connect / submit button */
    getConnectButton: (): Locator =>
      page.locator("button.btn.btn-primary", { hasText: "SE CONNECTER" }),
    /** "OBTENIR UN TOKEN →" link */
    getObtainTokenLink: (): Locator =>
      page.locator("a.btn.btn-ghost", { hasText: "OBTENIR UN TOKEN" }),
    /** "ou" divider */
    getDivider: (): Locator => page.locator(".auth-box .divider"),
    /** Logo container */
    getLogo: (): Locator => page.locator(".auth-box .logo"),
    /** Logo icon (SVG) */
    getLogoIcon: (): Locator => page.locator(".auth-box .logo-icon svg"),
    /** Logo text "TrendHunter" */
    getLogoText: (): Locator => page.locator(".auth-box .logo-text"),

    // ── Main Screen elements ───────────────────────────────────────

    /** Header bar (contains logo + plan badge) */
    getHeader: (): Locator => page.locator(".app-header"),
    /** Main screen logo */
    getMainLogo: (): Locator => page.locator(".app-header .logo"),
    /** Main screen logo icon SVG */
    getMainLogoIcon: (): Locator =>
      page.locator(".app-header .logo-icon svg"),
    /** Main screen logo text */
    getMainLogoText: (): Locator => page.locator(".app-header .logo-text"),
    /** Plan badge (e.g. "Plan FREE", "Plan PRO") */
    getPlanBadge: (): Locator => page.locator(".plan-badge"),
    /** Niche dropdown select */
    getNicheSelect: (): Locator => page.locator(".niche-select"),
    /** Trends list container */
    getTrendsList: (): Locator => page.locator("#trends-list"),
    /** All trend cards */
    getTrendCards: (): Locator => page.locator(".trend-card"),
    /** Empty state (shown when no trends) */
    getEmptyState: (): Locator => page.locator(".empty-state"),
    /** Upgrade banner (shown for FREE plan) */
    getUpgradeBanner: (): Locator => page.locator(".upgrade-banner"),
    /** Upgrade banner link */
    getUpgradeLink: (): Locator => page.locator(".btn-upgrade"),
    /** Logout button */
    getLogoutButton: (): Locator =>
      page.locator(".logout-btn", { hasText: "SE DÉCONNECTER" }),
    /** Content angle toggle button within a trend card */
    getContentAngleToggle: (): Locator => page.locator(".angle-toggle"),

    // ── Loading Screen elements ────────────────────────────────────

    /** Spinner element */
    getSpinner: (): Locator => page.locator(".loading-screen .spinner"),
    /** Loading text */
    getLoadingText: (): Locator =>
      page.locator(".loading-screen span"),

    // ── Actions ────────────────────────────────────────────────────

    /** Type a token and click the connect button */
    connect: async (token: string) => {
      await page.locator(".input-field").fill(token);
      await page.locator("button.btn.btn-primary", { hasText: "SE CONNECTER" }).click();
    },

    /** Click the logout button */
    logout: async () => {
      await page.locator(".logout-btn", { hasText: "SE DÉCONNECTER" }).click();
    },

    /** Select a niche by its slug value */
    selectNiche: async (slug: string) => {
      await page.locator(".niche-select").selectOption(slug);
    },
  };

  return sidepanel;
}
