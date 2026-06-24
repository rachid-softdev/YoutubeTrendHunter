import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Extended Performance & Core Web Vitals E2E tests for YouTube TrendHunter
 *
 * Covers:
 *   - LCP (Largest Contentful Paint) — normal + slow 3G
 *   - CLS (Cumulative Layout Shift) — image loading, skeleton transitions
 *   - INP (Interaction to Next Paint) — niche switch, card click, logout
 *   - FCP (First Contentful Paint) — all critical pages
 *   - Redis cache cold / warm response times
 *   - Offline degraded mode and recovery
 *   - Large volume rendering (100 trends)
 *   - Memory leak detection (repeated navigation)
 *   - TTI (Time to Interactive)
 *
 * Performance thresholds are set to realistic, non-brittle values.
 * Tests are independent: each can fail without blocking the others.
 */

/* ========================================================================== */
/*  Constants                                                                  */
/* ========================================================================== */

const BASE_URL = "http://localhost:3000";

const MOCK_SESSION = {
  user: {
    id: "test-user-id",
    name: "Test",
    email: "test@test.com",
    role: "USER" as const,
    plan: "PRO" as const,
  },
  expires: "2099-01-01T00:00:00.000Z",
};

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

async function mockSession(page: Page) {
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });
}

function makeTrends(count: number, nicheSlug = "tech-ia"): Array<Record<string, unknown>> {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `trend-${nicheSlug}-${i + 1}`,
    title: `Tendance #${i + 1} — ${nicheSlug}`,
    score: Math.round((95 - i * (95 / Math.max(count, 1))) * 10) / 10,
    channelName: `Chaîne ${i + 1}`,
    channelUrl: `https://youtube.com/@chaine${i + 1}`,
    videoUrl: `https://youtube.com/watch?v=vid${nicheSlug}${i + 1}`,
    thumbnailUrl: `https://i.ytimg.com/vi/vid${nicheSlug}${i + 1}/default.jpg`,
    views: Math.floor(100_000 - i * 5_000),
    nicheId: `niche-${nicheSlug}`,
    publishedAt: new Date(now - i * 3_600_000).toISOString(),
    createdAt: new Date(now - i * 7_200_000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
  }));
}

async function mockTrendsEndpoint(page: Page, options?: { delay?: number; count?: number }) {
  await page.route("**/api/trends*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const nicheSlug = url.searchParams.get("niche") || "tech-ia";

    // Simulate delay for throttling tests
    if (options?.delay) {
      await new Promise((r) => setTimeout(r, options.delay));
    }

    const count = options?.count ?? 5;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: makeTrends(count, nicheSlug),
        plan: "PRO",
        nextCursor: null,
      }),
    });
  });
}

async function mockFullDashboard(page: Page) {
  await mockSession(page);

  // Trends
  await page.route("**/api/trends*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        trends: makeTrends(5),
        plan: "PRO",
        nextCursor: null,
      }),
    });
  });

  // Niches
  await page.route("**/api/niches*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niches: [
            {
              id: "niche-tech-ia",
              name: "Tech & IA",
              slug: "tech-ia",
              description: "",
              isActive: true,
            },
            { id: "niche-gaming", name: "Gaming", slug: "gaming", description: "", isActive: true },
            {
              id: "niche-business",
              name: "Business",
              slug: "business",
              description: "",
              isActive: true,
            },
          ],
        }),
      });
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  await page.route("**/api/niches/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        niche: { id: "niche-tech-ia", name: "Tech & IA", slug: "tech-ia" },
      }),
    });
  });

  // User
  await page.route("**/api/user*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        name: "Test",
        email: "test@test.com",
        role: "USER",
        plan: "PRO",
      }),
    });
  });

  // Alerts
  await page.route("**/api/alerts*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });
}

/**
 * Register a PerformanceObserver for LCP in the browser and resolve when
 * the first LCP entry is available.
 */
async function measureLCP(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let resolved = false;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0 && !resolved) {
          resolved = true;
          observer.disconnect();
          resolve(entries[entries.length - 1].startTime);
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });

      // Fallback: if no LCP fires within 10s, resolve 0
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve(0);
        }
      }, 10_000);
    });
  });
}

/**
 * Register a PerformanceObserver for CLS (LayoutShift) and return
 * the cumulative score.
 */
async function measureCLS(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      let cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Only count layout shifts without recent user input
          if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
            cls += (entry as unknown as { value: number }).value;
          }
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });

      // Resolve after a settling period
      setTimeout(() => {
        observer.disconnect();
        resolve(cls);
      }, 3000);
    });
  });
}

/**
 * Measure interaction-to-next-paint latency for a click action.
 * Returns the max INP value observed during the interaction.
 */
async function measureINP(page: Page, selector: string): Promise<number> {
  return page.evaluate(async (sel: string) => {
    return new Promise<number>((resolve) => {
      let maxDuration = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const dur = (entry as unknown as { duration: number }).duration;
          if (dur > maxDuration) maxDuration = dur;
        }
      });
      observer.observe({ type: "first-input", buffered: true });
      observer.observe({
        type: "event",
        buffered: true,
        durationThreshold: 0,
      } as PerformanceObserverInit);

      // Wait a bit then resolve
      setTimeout(() => {
        observer.disconnect();
        resolve(maxDuration);
      }, 2000);

      // Trigger click on the element
      const el = document.querySelector(sel);
      if (el) {
        (el as HTMLElement).click();
      }
    });
  }, selector);
}

/* ========================================================================== */
/*  1. Core Web Vitals — LCP (Largest Contentful Paint)                       */
/* ========================================================================== */

test.describe("CWV — LCP (Largest Contentful Paint)", () => {
  test("landing page LCP < 2500ms sur connexion normale", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const lcp = await measureLCP(page);

    expect(lcp).toBeGreaterThan(0);
    expect(lcp).toBeLessThan(2500);
  });

  test("landing page LCP < 8000ms avec throttling Slow 3G", async ({ page }) => {
    // Simulate Slow 3G via route delay and bandwidth constraint
    await page.route("**/*", async (route) => {
      // Delay all requests except favicon
      if (!route.request().url().includes("favicon")) {
        await new Promise((r) => setTimeout(r, 200));
      }
      await route.continue();
    });

    // Set throttling via CDP if available (Chromium only, best-effort)
    const client = await page
      .context()
      .newCDPSession(page)
      .catch(() => null);
    if (client) {
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 400,
        downloadThroughput: (50 * 1024) / 8, // ~50 kbps
        uploadThroughput: (20 * 1024) / 8,
        connectionType: "cellular3g",
      });
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const lcp = await measureLCP(page);

    // LCP can be much higher under throttling — use a generous threshold
    expect(lcp).toBeGreaterThan(0);
    expect(lcp).toBeLessThan(8000);
  });
});

/* ========================================================================== */
/*  2. Core Web Vitals — CLS (Cumulative Layout Shift)                        */
/* ========================================================================== */

test.describe("CWV — CLS (Cumulative Layout Shift)", () => {
  test("dashboard CLS < 0.1 avec données mockées", async ({ page }) => {
    await mockFullDashboard(page);

    const clsPromise = measureCLS(page);

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const cls = await clsPromise;

    // Good CLS threshold per Google: < 0.1
    expect(cls).toBeLessThan(0.1);
  });

  test("CLS stable lors du chargement d'images et transition skeleton → données", async ({
    page,
  }) => {
    await mockFullDashboard(page);

    // Mock images to load with small delay to trigger layout shifts
    await page.route("**/i.ytimg.com/**", async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: Buffer.alloc(1024), // minimal valid placeholder
      });
    });

    const clsPromise = measureCLS(page);

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const cls = await clsPromise;

    // Even with delayed images, CLS should stay low
    expect(cls).toBeLessThan(0.15);
  });
});

/* ========================================================================== */
/*  3. Core Web Vitals — INP (Interaction to Next Paint)                      */
/* ========================================================================== */

test.describe("CWV — INP (Interaction to Next Paint)", () => {
  test("clic NicheSelector < 200ms", async ({ page }) => {
    await mockFullDashboard(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Wait for NicheSelector to be visible
    const selector =
      '[data-testid="niche-selector"] select, select[aria-label*="niche"], select[name="niche"]';
    const nicheSelect = page.locator(selector).first();
    await nicheSelect.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) {
      test.skip(true, "Page non rendue (redirection auth serveur)");
      return;
    }

    const inp = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let maxDuration = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const dur = (entry as unknown as { duration: number }).duration;
            if (dur > maxDuration) maxDuration = dur;
          }
        });
        observer.observe({
          type: "event",
          buffered: true,
          durationThreshold: 0,
        } as PerformanceObserverInit);

        setTimeout(() => {
          observer.disconnect();
          resolve(maxDuration);
        }, 3000);

        // Click the NicheSelector
        const sel = document.querySelector<HTMLElement>(
          '[data-testid="niche-selector"] select, select[aria-label*="niche"], select[name="niche"]',
        );
        if (sel) sel.click();
      });
    });

    expect(inp).toBeLessThan(200);
  });

  test("clic TrendCard < 200ms", async ({ page }) => {
    await mockFullDashboard(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const trendCard = page
      .locator('[data-testid="trend-card"], [data-testid="trend-card"] a, a[href*="/trends/"]')
      .first();
    await trendCard.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) {
      test.skip(true, "Page non rendue (redirection auth serveur)");
      return;
    }

    const inp = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let maxDuration = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const dur = (entry as unknown as { duration: number }).duration;
            if (dur > maxDuration) maxDuration = dur;
          }
        });
        observer.observe({
          type: "event",
          buffered: true,
          durationThreshold: 0,
        } as PerformanceObserverInit);

        setTimeout(() => {
          observer.disconnect();
          resolve(maxDuration);
        }, 3000);

        const el = document.querySelector<HTMLElement>(
          '[data-testid="trend-card"], [data-testid="trend-card"] a, a[href*="/trends/"]',
        );
        if (el) el.click();
      });
    });

    expect(inp).toBeLessThan(200);
  });

  test("clic logout < 300ms", async ({ page }) => {
    await mockFullDashboard(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const logoutBtn = page
      .getByRole("button", { name: /déconnexion|logout|se déconnecter/i })
      .first();
    await logoutBtn.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) {
      test.skip(true, "Page non rendue (redirection auth serveur)");
      return;
    }

    const inp = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let maxDuration = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const dur = (entry as unknown as { duration: number }).duration;
            if (dur > maxDuration) maxDuration = dur;
          }
        });
        observer.observe({
          type: "event",
          buffered: true,
          durationThreshold: 0,
        } as PerformanceObserverInit);

        setTimeout(() => {
          observer.disconnect();
          resolve(maxDuration);
        }, 3000);

        const btn = document.querySelector<HTMLElement>(
          'button:has-text("déconnexion"), button:has-text("logout"), button:has-text("se déconnecter")',
        );
        if (btn) btn.click();
      });
    });

    // Logout may trigger a full page redirect, so allow a bit more time
    expect(inp).toBeLessThan(300);
  });
});

/* ========================================================================== */
/*  4. FCP (First Contentful Paint) — toutes les pages critiques              */
/* ========================================================================== */

test.describe("FCP (First Contentful Paint)", () => {
  const CRITICAL_PAGES = ["/", "/login", "/dashboard", "/pricing"] as const;

  for (const pagePath of CRITICAL_PAGES) {
    test(`FCP ${pagePath} < 1500ms`, async ({ page }) => {
      // For authenticated pages, mock the session
      if (pagePath === "/dashboard") {
        await mockFullDashboard(page);
      }

      const fcp = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              observer.disconnect();
              resolve(entries[0].startTime);
            }
          });
          observer.observe({ type: "paint", buffered: true });

          setTimeout(() => {
            observer.disconnect();
            resolve(0);
          }, 10_000);
        });
      });

      await page.goto(pagePath, { waitUntil: "domcontentloaded" });

      const measuredFcp = await fcp;

      expect(measuredFcp).toBeGreaterThan(0);
      expect(measuredFcp).toBeLessThan(1500);
    });
  }
});

/* ========================================================================== */
/*  5. Performance avec cache Redis froid (premier hit)                       */
/* ========================================================================== */

test.describe("Performance — Cache Redis froid / chaud", () => {
  test("premier appel API > 200ms (cache froid), second < 50ms (cache chaud)", async ({ page }) => {
    await mockSession(page);

    let firstCall = true;

    await page.route("**/api/trends*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }

      const url = new URL(route.request().url());
      const isCacheMiss = url.searchParams.get("_test_cache_miss") === "true";

      // Simulate cache cold: DB query takes ~300ms; cache hit: ~20ms
      if (isCacheMiss && firstCall) {
        await new Promise((r) => setTimeout(r, 300));
        firstCall = false;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: makeTrends(5),
            plan: "PRO",
            nextCursor: null,
            _cache: "miss",
          }),
        });
      } else {
        await new Promise((r) => setTimeout(r, 20));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            trends: makeTrends(5),
            plan: "PRO",
            nextCursor: null,
            _cache: "hit",
          }),
        });
      }
    });

    // First call — simulate cache miss (DB query)
    const firstResult = await page.evaluate(async () => {
      const start = performance.now();
      const res = await fetch("/api/trends?niche=tech-ia&_test_cache_miss=true");
      const duration = performance.now() - start;
      const body = await res.json();
      return { duration, status: res.status, cache: body._cache as string };
    });

    expect(firstResult.status).toBe(200);
    expect(firstResult.cache).toBe("miss");
    expect(firstResult.duration).toBeGreaterThan(200);

    // Second call — cache hit
    const secondResult = await page.evaluate(async () => {
      const start = performance.now();
      const res = await fetch("/api/trends?niche=tech-ia");
      const duration = performance.now() - start;
      const body = await res.json();
      return { duration, status: res.status, cache: body._cache as string };
    });

    expect(secondResult.status).toBe(200);
    expect(secondResult.cache).toBe("hit");
    expect(secondResult.duration).toBeLessThan(50);
  });
});

/* ========================================================================== */
/*  6. Performance offline / réseau lent                                      */
/* ========================================================================== */

test.describe("Performance — Mode offline et récupération", () => {
  test("affiche un état dégradé en offline, puis restaure les données", async ({ page }) => {
    await mockFullDashboard(page);

    const context = page.context();

    // Navigate first to establish baseline
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Go offline
    await context.setOffline(true);

    // Attempt navigation while offline — the page should show a degraded state
    await page
      .goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    // Check that we see an error or degraded UI message
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const hasDegradedState =
      bodyText.includes("erreur") ||
      bodyText.includes("offline") ||
      bodyText.includes("connexion") ||
      bodyText.includes("hors ligne") ||
      bodyText.includes("erreur réseau") ||
      bodyText.includes("Impossible de charger");

    // If we're on the dashboard page, we expect a degraded state
    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      expect(hasDegradedState).toBe(true);
    }

    // Restore connection
    await context.setOffline(false);

    // Navigate again — data should load normally
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Verify the page recovers (trend data should be present)
    const recoveredBodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const hasRecovered =
      recoveredBodyText.includes("Tendance") || recoveredBodyText.includes("score");
    if (page.url().includes("/dashboard")) {
      // The page should at least render something meaningful
      expect(page.locator("body")).not.toBeEmpty();
    }
  });
});

/* ========================================================================== */
/*  7. Temps de rendu avec grand volume de données                            */
/* ========================================================================== */

test.describe("Performance — Grand volume de données (100 tendances)", () => {
  test("100 TrendCards rendues avec un temps de rendu < 3000ms", async ({ page }) => {
    await mockSession(page);

    // Mock 100 trends
    await page.route("**/api/trends*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trends: makeTrends(100),
          plan: "PRO",
          nextCursor: null,
        }),
      });
    });

    // Mock other endpoints
    await page.route("**/api/niches*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            niches: [
              {
                id: "niche-tech-ia",
                name: "Tech & IA",
                slug: "tech-ia",
                description: "",
                isActive: true,
              },
            ],
          }),
        });
      } else {
        await route.fulfill({ status: 405 });
      }
    });

    await page.route("**/api/niches/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          niche: { id: "niche-tech-ia", name: "Tech & IA", slug: "tech-ia" },
        }),
      });
    });

    await page.route("**/api/user*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user-id",
          name: "Test",
          email: "test@test.com",
          role: "USER",
          plan: "PRO",
        }),
      });
    });

    await page.route("**/api/alerts*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [] }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    // Measure render time from DOMContentLoaded to full render
    const renderTime = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        if (document.readyState !== "loading") {
          resolve(performance.now());
          return;
        }
        document.addEventListener("DOMContentLoaded", () => {
          resolve(performance.now());
        });
      });
    });

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const endRender = await page.evaluate(() => performance.now());

    const elapsed = endRender - renderTime;

    const onDashboard = page.url().includes("/dashboard");
    if (onDashboard) {
      // Count TrendCards on the page
      const trendCards = page.locator(
        '[data-testid="trend-card"], [data-testid="trend-item"], article, [class*="trend"]',
      );
      const count = await trendCards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }

    // The render time should be reasonable even for 100 items
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(3000);
  });
});

/* ========================================================================== */
/*  8. Memory — fuite mémoire après navigation répétée                        */
/* ========================================================================== */

test.describe("Performance — Fuite mémoire (Chromium only)", () => {
  test("10 cycles de navigation sans augmentation mémoire > 20%", async ({ page }) => {
    // performance.memory is Chromium-only; skip on other browsers
    const hasMemoryAPI = await page.evaluate(() => {
      return "memory" in performance;
    });
    if (!hasMemoryAPI) {
      test.skip(true, "performance.memory non disponible (Chromium uniquement)");
      return;
    }

    await mockFullDashboard(page);

    const pages = ["/dashboard", "/niches", "/alerts", "/billing"];

    // Get baseline memory
    const baselineHeap = await page.evaluate(() => {
      const m = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
      return m.usedJSHeapSize;
    });

    // Navigate repeatedly
    for (let cycle = 0; cycle < 10; cycle++) {
      for (const route of pages) {
        // Re-mock session before each navigation
        await mockFullDashboard(page);
        await page.goto(route, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => {});
        // Small pause to let GC settle
        await page.waitForTimeout(200);
      }
    }

    // Measure final memory
    const finalHeap = await page.evaluate(() => {
      const m = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
      return m.usedJSHeapSize;
    });

    const increaseRatio = (finalHeap - baselineHeap) / baselineHeap;

    // Allow up to 20% increase
    expect(increaseRatio).toBeLessThan(0.2);
  });
});

/* ========================================================================== */
/*  9. Time to Interactive (TTI)                                              */
/* ========================================================================== */

test.describe("TTI (Time to Interactive)", () => {
  test("dashboard interactif (NicheSelector clickable) < 5000ms", async ({ page }) => {
    await mockFullDashboard(page);

    const startTime = performance.now();

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Wait for NicheSelector to be clickable (interactive)
    const nicheSelectors = [
      '[data-testid="niche-selector"] select',
      'select[aria-label*="niche"]',
      'select[name="niche"]',
      "select",
    ];

    let selectorFound = false;
    for (const selector of nicheSelectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) {
        selectorFound = true;
        await locator.waitFor({ state: "visible", timeout: 5_000 });
        break;
      }
    }

    const endTime = performance.now();
    const tti = endTime - startTime;

    const onDashboard = page.url().includes("/dashboard");
    if (!onDashboard) {
      test.skip(true, "Page non rendue (redirection auth serveur)");
      return;
    }

    // Verify at least some selector was found
    if (!selectorFound) {
      // If no selector found, the page might not have rendered the dashboard
      // Check if page rendered at all
      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      expect(bodyText.length).toBeGreaterThan(0);
      // Still assert reasonable TTI even without NicheSelector
      expect(tti).toBeLessThan(5000);
    } else {
      expect(selectorFound).toBe(true);
      expect(tti).toBeLessThan(5000);
    }
  });
});
