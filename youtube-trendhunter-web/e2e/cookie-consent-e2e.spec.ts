import { test, expect, type Page } from "@playwright/test";

/**
 * CookieConsent E2E tests for YouTube TrendHunter
 *
 * Tests the cookie consent banner behavior: display timing, user interactions,
 * localStorage persistence, PostHog integration, animation classes, and
 * edge cases (already consented, localStorage unavailable).
 *
 * The CookieConsent component is rendered in the root layout at src/app/layout.tsx,
 * so it appears on every page. All tests navigate to `/`.
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const COOKIE_CONSENT_KEY = "cookie_consent";
const CONSENT_DELAY = 2000;
const ANIMATION_DURATION = 300;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Injects a mock PostHog object on the window that tracks whether
 * opt_in_capturing() was called.
 */
async function injectPostHogMock(page: Page) {
  await page.addInitScript(() => {
    (window as any).__posthog_opt_in_called = false;
    (window as any).posthog = {
      opt_in_capturing: () => {
        (window as any).__posthog_opt_in_called = true;
      },
    };
  });
}

/**
 * Sets a localStorage value via addInitScript before navigation.
 */
async function setLocalStorageBeforeNavigation(page: Page, key: string, value: string) {
  await page.addInitScript(
    (args: { key: string; value: string }) => {
      localStorage.setItem(args.key, args.value);
    },
    { key, value },
  );
}

/**
 * Waits for the consent delay + animation to complete so the banner is visible.
 */
async function waitForBanner(page: Page) {
  await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);
}

/**
 * Navigate to the home page and wait for network idle.
 */
async function gotoHome(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

// ========================================================================== //
//  CookieConsent — Banner Display                                           //
//  Verifies the banner appears after the 2-second delay with all expected    //
//  content elements visible.                                                 //
// ========================================================================== //

test.describe("CookieConsent — Affichage de la bannière", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
  });

  test("la bannière n'est PAS visible immédiatement (avant les 2s de délai)", async ({ page }) => {
    // Immediately after page load, the banner should not be in the DOM
    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });

  test("après 2s de délai + animation → la bannière devient visible", async ({ page }) => {
    await waitForBanner(page);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });

  test("l'icône Cookie (lucide-cookie) est visible dans la bannière", async ({ page }) => {
    await waitForBanner(page);

    await expect(page.locator(".lucide-cookie")).toBeVisible();
  });

  test("le texte 'Nous utilisons des cookies pour analyser le trafic...' est visible", async ({
    page,
  }) => {
    await waitForBanner(page);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });

  test("le lien 'Politique de confidentialité' est visible", async ({ page }) => {
    await waitForBanner(page);

    await expect(page.getByText("Politique de confidentialité")).toBeVisible();
  });

  test("le bouton 'Essentiels seulement' est visible", async ({ page }) => {
    await waitForBanner(page);

    const btn = page.getByRole("button", { name: "Essentiels seulement" });
    await expect(btn).toBeVisible();
  });

  test("le bouton 'Tout accepter' est visible", async ({ page }) => {
    await waitForBanner(page);

    const btn = page.getByRole("button", { name: "Tout accepter" });
    await expect(btn).toBeVisible();
  });
});

// ========================================================================== //
//  CookieConsent — Accept All                                               //
//  Verifies that clicking "Tout accepter" persists the choice to localStorage//
//  and fires PostHog opt_in_capturing.                                      //
// ========================================================================== //

test.describe("CookieConsent — Tout accepter", () => {
  test.beforeEach(async ({ page }) => {
    await injectPostHogMock(page);
    await gotoHome(page);
    await waitForBanner(page);
  });

  test("clic sur 'Tout accepter' → localStorage 'cookie_consent' = 'accepted'", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Tout accepter" }).click();

    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("accepted");
  });

  test("après acceptation → la bannière disparaît (slide down + DOM retiré)", async ({ page }) => {
    await page.getByRole("button", { name: "Tout accepter" }).click();
    await page.waitForTimeout(ANIMATION_DURATION + 200);

    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });

  test("après 'Tout accepter' → posthog.opt_in_capturing() a été appelé", async ({ page }) => {
    await page.getByRole("button", { name: "Tout accepter" }).click();

    const called = await page.evaluate(() => (window as any).__posthog_opt_in_called);
    expect(called).toBe(true);
  });
});

// ========================================================================== //
//  CookieConsent — Essential Only                                            //
//  Verifies that clicking "Essentiels seulement" persists the choice and     //
//  does NOT fire PostHog opt_in_capturing.                                   //
// ========================================================================== //

test.describe("CookieConsent — Essentiels seulement", () => {
  test.beforeEach(async ({ page }) => {
    await injectPostHogMock(page);
    await gotoHome(page);
    await waitForBanner(page);
  });

  test("clic sur 'Essentiels seulement' → localStorage 'cookie_consent' = 'essential'", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Essentiels seulement" }).click();

    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("essential");
  });

  test("après 'Essentiels seulement' → la bannière disparaît", async ({ page }) => {
    await page.getByRole("button", { name: "Essentiels seulement" }).click();
    await page.waitForTimeout(ANIMATION_DURATION + 200);

    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });

  test("après 'Essentiels seulement' → posthog.opt_in_capturing() n'est PAS appelé", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Essentiels seulement" }).click();

    const called = await page.evaluate(() => (window as any).__posthog_opt_in_called);
    expect(called).toBe(false);
  });
});

// ========================================================================== //
//  CookieConsent — Backdrop Click                                           //
//  Verifies that clicking the backdrop overlay behaves like "Essentiels      //
//  seulement" (sets localStorage to "essential").                            //
// ========================================================================== //

test.describe("CookieConsent — Clic sur le fond (backdrop)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await waitForBanner(page);
  });

  test("clic sur le backdrop → localStorage 'cookie_consent' = 'essential'", async ({ page }) => {
    // The backdrop covers the full viewport at z-40. The banner is at z-50
    // at the bottom of the page. Clicking in the top-center area hits the
    // backdrop (not the banner), which triggers handleEssentialOnly.
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width / 2, 100);
    // Wait for the handler to execute
    await page.waitForTimeout(100);

    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("essential");
  });
});

// ========================================================================== //
//  CookieConsent — Already Consented                                        //
//  Verifies that if the user has already consented (localStorage value set), //
//  the banner never appears.                                                 //
// ========================================================================== //

test.describe("CookieConsent — Déjà consenti", () => {
  test("localStorage 'cookie_consent' = 'accepted' avant navigation → bannière jamais visible", async ({
    page,
  }) => {
    await setLocalStorageBeforeNavigation(page, COOKIE_CONSENT_KEY, "accepted");
    await gotoHome(page);

    // Wait longer than the consent delay to ensure the banner would have appeared
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 500);

    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });

  test("localStorage 'cookie_consent' = 'essential' avant navigation → bannière jamais visible", async ({
    page,
  }) => {
    await setLocalStorageBeforeNavigation(page, COOKIE_CONSENT_KEY, "essential");
    await gotoHome(page);

    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 500);

    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });
});

// ========================================================================== //
//  CookieConsent — Link Navigation                                          //
//  Verifies that the privacy policy link has the correct href.               //
// ========================================================================== //

test.describe("CookieConsent — Lien de confidentialité", () => {
  test("le lien 'Politique de confidentialité' pointe vers /privacy", async ({ page }) => {
    await gotoHome(page);
    await waitForBanner(page);

    const link = page.getByText("Politique de confidentialité");
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href).toBe("/privacy");
  });
});

// ========================================================================== //
//  CookieConsent — Animation                                                 //
//  Verifies the CSS transition classes on the banner and backdrop.           //
// ========================================================================== //

test.describe("CookieConsent — Animation", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await waitForBanner(page);
  });

  test("la bannière a les classes de transition (transition-transform, duration-300, ease-out, translate-y-0)", async ({
    page,
  }) => {
    // The banner div is the container with fixed bottom-0 left-0 right-0 z-50
    // It uses transition-transform duration-300 ease-out and translate-y-0 when visible
    const bannerContainer = page.locator(".fixed.bottom-0.left-0.right-0.z-50").first();

    await expect(bannerContainer).toHaveClass(/transition-transform/);
    await expect(bannerContainer).toHaveClass(/duration-300/);
    await expect(bannerContainer).toHaveClass(/ease-out/);
    // When isVisible is true, the banner has translate-y-0
    await expect(bannerContainer).toHaveClass(/translate-y-0/);
  });

  test("le backdrop a les classes de transition d'opacité (transition-opacity, duration-300)", async ({
    page,
  }) => {
    // The backdrop has fixed inset-0 bg-black/50 z-40 transition-opacity duration-300
    const backdrop = page.locator(".fixed.inset-0").first();

    await expect(backdrop).toHaveClass(/transition-opacity/);
    await expect(backdrop).toHaveClass(/duration-300/);
    // When isVisible is true, the backdrop has opacity-100
    await expect(backdrop).toHaveClass(/opacity-100/);
  });
});

// ========================================================================== //
//  CookieConsent — Edge Cases                                               //
//  Verifies graceful degradation when localStorage is unavailable.           //
// ========================================================================== //

test.describe("CookieConsent — Cas limites", () => {
  test("localStorage.setItem indisponible → l'erreur est capturée et la page ne crash pas", async ({
    page,
  }) => {
    // Track any unhandled page errors
    const errors: Error[] = [];
    page.on("pageerror", (err) => errors.push(err));

    await gotoHome(page);
    await waitForBanner(page);

    // Override localStorage.setItem to throw when called with "cookie_consent"
    await page.evaluate(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "cookie_consent") {
          throw new Error("localStorage is unavailable (test mock)");
        }
        return originalSetItem.call(this, key, value);
      };
    });

    // Click "Tout accepter" - this will try to call the now-throwing setItem
    await page.getByRole("button", { name: "Tout accepter" }).click();
    await page.waitForTimeout(ANIMATION_DURATION + 200);

    // Verify no unhandled page errors (React catches the error in the event handler)
    expect(errors).toHaveLength(0);

    // The page should still be interactive and not crashed
    await expect(page.locator("body")).toBeVisible();
  });
});

// ========================================================================== //
//  CookieConsent — Réapparition de la bannière                                //
//  Verifies that the banner reappears after the user clears localStorage,     //
//  as required for legal compliance (consent must be re-obtainable).          //
// ========================================================================== //

test.describe("CookieConsent — Réapparition de la bannière", () => {
  test("après acceptation et effacement localStorage → bannière réapparaît au prochain chargement", async ({
    page,
  }) => {
    // Step 1: Accept cookies
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);
    await page.getByRole("button", { name: "Tout accepter" }).click();
    await page.waitForTimeout(500);

    // Verify it was accepted
    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("accepted");

    // Step 2: Clear localStorage (simulate user clearing data)
    await page.evaluate(() => localStorage.removeItem("cookie_consent"));

    // Step 3: Reload the page — banner should reappear
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });

  test("après 'Essentiels seulement' et effacement → bannière réapparaît", async ({ page }) => {
    // Step 1: Choose essential only
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);
    await page.getByRole("button", { name: "Essentiels seulement" }).click();
    await page.waitForTimeout(500);

    // Verify it was set to essential
    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("essential");

    // Step 2: Clear localStorage
    await page.evaluate(() => localStorage.removeItem("cookie_consent"));

    // Step 3: Reload the page — banner should reappear
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });
});

// ========================================================================== //
//  CookieConsent — Valeurs localStorage invalides                             //
//  Verifies that unrecognized localStorage values are treated as "not         //
//  consented", so the banner appears.                                         //
// ========================================================================== //

test.describe("CookieConsent — Valeurs localStorage invalides", () => {
  test("localStorage avec valeur 'xyz' → bannière visible (traitée comme non consentie)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("cookie_consent", "xyz");
    });
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });

  test("localStorage avec valeur vide '' → bannière visible", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("cookie_consent", "");
    });
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    await expect(
      page.getByText("Nous utilisons des cookies pour analyser le trafic"),
    ).toBeVisible();
  });
});

// ========================================================================== //
//  CookieConsent — Navigation entre pages                                     //
//  Verifies that consent persists across navigations and the banner does not  //
//  reappear on subsequent pages once the user has consented.                  //
// ========================================================================== //

test.describe("CookieConsent — Navigation entre pages", () => {
  test("consentement persisté → bannière NON visible après navigation vers /pricing", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("cookie_consent", "accepted");
    });
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });

  test("navigation vers /features puis retour → bannière ne réapparaît pas si déjà consentie", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("cookie_consent", "essential");
    });
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    // Banner should NOT be visible
    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );

    // Navigate away and back
    await page.goto("/features");
    await page.waitForLoadState("networkidle");
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    // Still no banner
    await expect(page.getByText("Nous utilisons des cookies pour analyser le trafic")).toHaveCount(
      0,
    );
  });
});

// ========================================================================== //
//  CookieConsent — Clics multiples                                            //
//  Verifies that rapid or multiple clicks on accept buttons do not cause      //
//  inconsistent localStorage state.                                           //
// ========================================================================== //

test.describe("CookieConsent — Clics multiples", () => {
  test("double-clic rapide sur 'Tout accepter' → localStorage est 'accepted'", async ({ page }) => {
    await injectPostHogMock(page);
    await gotoHome(page);
    await page.waitForTimeout(CONSENT_DELAY + ANIMATION_DURATION + 200);

    const acceptBtn = page.getByRole("button", { name: "Tout accepter" });
    await acceptBtn.click();
    await acceptBtn.click({ force: true }); // second click (banner may be disappearing)

    const consent = await page.evaluate(() => localStorage.getItem("cookie_consent"));
    expect(consent).toBe("accepted");
  });
});
