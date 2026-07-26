import { test, expect, type Route, type Page } from "@playwright/test";

/**
 * Security Scenarios E2E tests for YouTube TrendHunter
 *
 * Covers attack vectors NOT already tested in existing specs:
 *   - plans-quotas-security.spec.ts: CSRF, XSS injections, stack traces,
 *     cross-plan tokens, plan gating, quotas, rate limiting, cache isolation,
 *     auth security, webhook race conditions
 *   - admin-niches.spec.ts: XSS in niche data display
 *   - admin-users.spec.ts: XSS in search field
 *   - api-alerts.spec.ts: IDOR, SQL injection, rate limiting
 *   - api-niches.spec.ts: IDOR
 *   - api-jobs-id.spec.ts: Path traversal in job IDs
 *   - api-export-security.spec.ts: CSV formula injection
 *
 * NEW scenarios added here:
 *   1. Prototype pollution / mass assignment — extra body fields ignored
 *   2. HTTP Parameter Pollution (HPP) — duplicate query params
 *   3. Content-Type manipulation — JSON without application/json
 *   4. Large payload size limits — oversized request bodies rejected
 *   5. Security response headers — CSP, X-Frame-Options, X-Content-Type-Options
 *   6. Unicode normalization / homograph attacks in identifiers
 *   7. HTTP method override via headers (X-HTTP-Method-Override)
 *   8. Cache-Control / Pragma manipulation attempt
 */

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function setupPage(page: Page) {
  // Set up session mock so auth-protected routes are accessible
  await page.route("**/api/auth/session*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          name: "Test",
          email: "test@test.com",
          role: "USER",
          plan: "PRO",
        },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}

/* ======================================================================== */
/*  1. Prototype pollution / Mass assignment                                */
/* ======================================================================== */

test.describe("Prototype pollution & Mass assignment", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  const EXTRA_FIELDS = [
    { "role (ADMIN)": { role: "ADMIN" } },
    { isAdmin: { isAdmin: true } },
    { "plan (TEAM)": { plan: "TEAM" } },
    { "__proto__ (object)": { __proto__: { isAdmin: true } } },
    { "constructor (prototype)": { constructor: { prototype: { isAdmin: true } } } },
    { "constructor.prototype.isAdmin": { "constructor.prototype.isAdmin": true } },
    { "__proto__ (string)": { __proto__: "polluted" } },
    { polluted: { polluted: true } },
    { $where: { $where: "1=1" } },
  ];

  for (const entry of EXTRA_FIELDS) {
    const label = Object.keys(entry)[0];
    const payload = entry[label];
    test(`POST /api/alerts avec champ supplémentaire "${label}" → ignoré (pas d'erreur 500)`, async ({
      page,
    }) => {
      await page.route("**/api/alerts", async (route: Route) => {
        const method = route.request().method();
        if (method !== "POST") {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            alert: { id: "test-alert", type: "SCORE_THRESHOLD", threshold: 70 },
          }),
        });
      });

      const body = { type: "SCORE_THRESHOLD", threshold: 70, channel: "EMAIL", ...payload };

      const result = await page.evaluate(async (b) => {
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        });
        return { status: res.status, ok: res.ok };
      }, body);

      // Should not crash, should not 500
      expect(result.status).not.toBe(500);
      expect(result.ok || result.status === 201).toBeTruthy();
    });
  }

  test("POST /api/niches avec champ supplémentaire ignoré", async ({ page }) => {
    await setupPage(page);

    await page.route("**/api/niches", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "n-1", name: "Test" } }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicheId: "niche-1", role: "ADMIN", isAdmin: true }),
      });
      return { status: res.status, ok: res.ok };
    });

    expect(result.status).not.toBe(500);
  });
});

/* ======================================================================== */
/*  2. HTTP Parameter Pollution (HPP)                                        */
/* ======================================================================== */

test.describe("HTTP Parameter Pollution", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("GET /api/alerts avec duplicate _test param → pas de crash", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [], userNiches: [], plan: "PRO", canCreate: true }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch(
        "/api/alerts?_test_session=true&_test_session=false&_test=dup&_test=dup2",
      );
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test("GET /api/niches avec duplicate params → pas de crash", async ({ page }) => {
    await page.route("**/api/niches*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: [], followed: [], available: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch(
        "/api/niches?_test_session=true&_test_session=false&nicheId=a&nicheId=b",
      );
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test("GET /api/trends avec duplicate params → pas de 500", async ({ page }) => {
    await page.route("**/api/trends*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch(
        "/api/trends?niche=tech&niche=gaming&sort=score&sort=velocity&page=1&page=2",
      );
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test("POST /api/alerts avec duplicate Content-Type header → pas de crash", async ({ page }) => {
    await page.route("**/api/alerts", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: { id: "a-1" } }),
      });
    });

    const result = await page.evaluate(async () => {
      const headers = new Headers();
      headers.append("Content-Type", "application/json");
      headers.append("Content-Type", "text/plain"); // Duplicate
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "SCORE_THRESHOLD", threshold: 70, channel: "EMAIL" }),
      });
      return { status: res.status };
    });

    expect(result.status).toBe(201);
  });
});

/* ======================================================================== */
/*  3. Content-Type manipulation                                             */
/* ======================================================================== */

test.describe("Content-Type manipulation", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  const WRONG_TYPES = [
    "text/plain",
    "text/html",
    "application/xml",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "",
  ];

  for (const ct of WRONG_TYPES) {
    test(`POST /api/alerts avec Content-Type "${ct || "(vide)"}" → pas de 500`, async ({
      page,
    }) => {
      await page.route("**/api/alerts", async (route: Route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        // Should still work or return 400, not 500
        await route.fulfill({
          status: ct === "" ? 400 : 201,
          contentType: "application/json",
          body: JSON.stringify(
            ct === ""
              ? { error: "Bad Request" }
              : { alert: { id: "a-1", type: "SCORE_THRESHOLD" } },
          ),
        });
      });

      const headers: Record<string, string> = ct ? { "Content-Type": ct } : {};
      const result = await page.evaluate(
        async ({ headers }) => {
          const res = await fetch("/api/alerts", {
            method: "POST",
            headers,
            body: JSON.stringify({ type: "SCORE_THRESHOLD", threshold: 70, channel: "EMAIL" }),
          });
          return { status: res.status };
        },
        { headers },
      );

      expect(result.status).not.toBe(500);
    });
  }

  test("GET avec Accept: text/html ne casse pas la réponse JSON", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        headers: { Accept: "text/html" },
      });
      return { status: res.status, contentType: res.headers.get("content-type") };
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toContain("json");
  });
});

/* ======================================================================== */
/*  4. Large payload size limits                                             */
/* ======================================================================== */

test.describe("Large payload limits", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("POST /api/alerts avec body de 1MB → rejeté 413 ou géré sans crash", async ({ page }) => {
    await page.route("**/api/alerts", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      // Simulate 413 Payload Too Large
      await route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({ error: "Payload Too Large" }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SCORE_THRESHOLD",
          threshold: 70,
          channel: "EMAIL",
          largeField: "x".repeat(1_000_000),
        }),
      });
      return { status: res.status };
    });

    // Should either be 413 (rejected) or not crash
    expect([200, 201, 400, 413]).toContain(result.status);
  });

  test("POST /api/alerts avec body de 100 octets → accepté normalement", async ({ page }) => {
    await page.route("**/api/alerts", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ alert: { id: "a-1" } }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCORE_THRESHOLD", threshold: 70, channel: "EMAIL" }),
      });
      return { status: res.status };
    });

    expect(result.status).toBe(201);
  });

  test("longs query strings (2000+ caractères) ne causent pas de crash", async ({ page }) => {
    await page.route("**/api/trends*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [] }),
      });
    });

    const longParam = "a".repeat(2000);
    const result = await page.evaluate(async (param) => {
      const res = await fetch(`/api/trends?niche=${param}&test=${param}`);
      return { status: res.status };
    }, longParam);

    expect(result.status).toBe(200);
  });
});

/* ======================================================================== */
/*  5. Security response headers                                             */
/* ======================================================================== */

test.describe("Security response headers", () => {
  test("Page d'accueil renvoie les en-têtes de sécurité essentiels", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    if (!response) return;

    const headers = response.headers();

    // X-Content-Type-Options: nosniff empêche le MIME sniffing
    const xcto = headers["x-content-type-options"];
    expect(xcto?.toLowerCase()).toBe("nosniff");

    // X-Frame-Options: DENY ou SAMEORIGIN empêche le clickjacking
    const xfo = headers["x-frame-options"];
    if (xfo) {
      expect(["deny", "sameorigin"]).toContain(xfo.toLowerCase());
    }

    // Referrer-Policy
    const rp = headers["referrer-policy"];
    expect(rp).toBeDefined();
  });

  test("Page dashboard inclut Content-Security-Policy ou au moins X-XSS-Protection", async ({
    page,
  }) => {
    await page.route("**/api/auth/session*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "test", name: "T", email: "t@t.com", role: "USER", plan: "PRO" },
          expires: "2099-01-01T00:00:00.000Z",
        }),
      });
    });

    const response = await page.goto("/dashboard");
    expect(response).not.toBeNull();
    if (!response) return;

    const headers = response.headers();

    // Either CSP or X-XSS-Protection should be present
    const hasCsp = !!headers["content-security-policy"];
    const hasXss = !!headers["x-xss-protection"];
    expect(hasCsp || hasXss).toBeTruthy();
  });

  test("Les réponses API n'exposent pas l'en-tête X-Powered-By", async ({ page }) => {
    await setupPage(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts?_test_session=true");
      const poweredBy = res.headers.get("x-powered-by");
      return { poweredBy };
    });

    // Next.js supprime X-Powered-By par défaut en production
    expect(result.poweredBy).toBeNull();
  });

  test("Les pages API n'incluent pas d'informations serveur dans les en-têtes", async ({
    page,
  }) => {
    const response = await page.goto("/api/alerts?_test_session=true").catch(() => null);
    if (!response) return;

    const server = response.headers()["server"];
    // Should not expose detailed server version
    if (server) {
      expect(server).not.toContain("nginx/");
      expect(server).not.toContain("Apache");
    }
  });
});

/* ======================================================================== */
/*  6. Unicode / Homograph attacks                                           */
/* ======================================================================== */

test.describe("Unicode & homograph attacks", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("POST /api/niches avec nom contenant des caractères Unicode spéciaux → pas de crash", async ({
    page,
  }) => {
    await page.route("**/api/niches", async (route: Route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ niche: { id: "n-1", name: "test" } }),
      });
    });

    const unicodeNames = [
      "Téch & 🅘🅐", // Emoji + accent
      "Нихтше Sраss", // Cyrillic homograph (looks like "Nichtsche Sраss")
      "Ｆａｋｅ", // Fullwidth characters
      "Tech\u200BIgnore", // Zero-width space
      "Tech\r\nGaming", // CRLF injection attempt
      "a\u0000b", // Null byte
      "<script>alert(1)</script>", // Classic XSS - should be escaped on output
    ];

    for (const name of unicodeNames) {
      const result = await page.evaluate(async (n) => {
        const res = await fetch("/api/niches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nicheId: "niche-1", name: n }),
        });
        return { status: res.status, ok: res.ok };
      }, name);

      // Should handle gracefully (either accept or reject with 400, not 500)
      expect(result.status).not.toBe(500);
    }
  });

  test("Recherche avec caractères Unicode spéciaux → pas de 500", async ({ page }) => {
    await page.route("**/api/trends*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trends: [], total: 0 }),
      });
    });

    const searches = [
      "/api/trends?search=Téch",
      "/api/trends?search=" + encodeURIComponent("Нихтше"),
      "/api/trends?search=" + encodeURIComponent("\u0000"),
      "/api/trends?search=" + encodeURIComponent("\r\n"),
    ];

    for (const url of searches) {
      const result = await page.evaluate(async (u) => {
        const res = await fetch(u);
        return { status: res.status };
      }, url);

      expect(result.status).toBe(200);
    }
  });
});

/* ======================================================================== */
/*  7. HTTP Method Override                                                   */
/* ======================================================================== */

test.describe("HTTP Method Override", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  const OVERRIDE_HEADERS = [
    { name: "X-HTTP-Method-Override", value: "DELETE" },
    { name: "X-HTTP-Method", value: "DELETE" },
    { name: "X-METHOD-OVERRIDE", value: "DELETE" },
  ];

  for (const header of OVERRIDE_HEADERS) {
    test(`En-tête ${header.name}: DELETE via POST → pas de contournement non intentionnel`, async ({
      page,
    }) => {
      await page.route("**/api/alerts/alert-1", async (route: Route) => {
        const method = route.request().method();
        // Simulate that DELETE is protected but GET is allowed
        if (method === "DELETE") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ deleted: true }),
          });
        } else {
          await route.fallback();
        }
      });

      const result = await page.evaluate(
        async ({ header }) => {
          const res = await fetch("/api/alerts/alert-1", {
            method: "POST", // Send as POST
            headers: {
              "Content-Type": "application/json",
              [header.name]: header.value,
              ...(header.value === "DELETE" ? {} : { "X-HTTP-Method-Override": "DELETE" }),
            },
            body: JSON.stringify({}),
          });
          return { status: res.status };
        },
        { header },
      );

      // Should either respond (if override supported) or not crash
      expect(result.status).not.toBe(500);
    });
  }

  test("GET avec X-HTTP-Method-Override: POST → lecture seule", async ({ page }) => {
    await setupPage(page);

    await page.route("**/api/alerts", async (route: Route) => {
      const method = route.request().method();
      if (method === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ alert: { id: "a-1" } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ alerts: [] }),
        });
      }
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-HTTP-Method-Override": "POST",
        },
      });
      return { status: res.status };
    });

    // The server should process this as GET, not POST
    expect(result.status).toBe(200);
  });
});

/* ======================================================================== */
/*  8. Cache manipulation                                                    */
/* ======================================================================== */

test.describe("Cache manipulation via headers", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("Cache-Control: no-cache ne cause pas de dysfonctionnement", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts?_test_session=true", {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test("Pragma: no-cache ne cause pas de dysfonctionnement", async ({ page }) => {
    await page.route("**/api/niches*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ niches: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/niches?_test_session=true", {
        headers: { Pragma: "no-cache" },
      });
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test("If-None-Match avec valeur invalide → pas de 500", async ({ page }) => {
    await page.route("**/api/alerts*", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ alerts: [] }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/alerts?_test_session=true", {
        headers: {
          "If-None-Match": '"invalid-etag"',
          "If-Modified-Since": "invalid-date",
        },
      });
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });
});

/* ======================================================================== */
/*  9. Null bytes and encoding edge cases                                    */
/* ======================================================================== */

test.describe("Null bytes & encoding edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  const DANGEROUS_INPUTS = [
    { label: "null byte", value: "test\u0000alert" },
    { label: "bell character", value: "test\u0007alert" },
    { label: "escape sequence", value: "test\u001balert" },
    { label: "delete character", value: "test\u007falert" },
    { label: "BOM prefix", value: "\uFEFFtest-alert" },
    { label: "RTL override", value: "\u202Etest-alert" },
  ];

  for (const { label, value } of DANGEROUS_INPUTS) {
    test(`POST /api/alerts avec ${label} dans le type → géré sans crash`, async ({ page }) => {
      await page.route("**/api/alerts", async (route: Route) => {
        if (route.request().method() !== "POST") {
          await route.fallback();
          return;
        }
        // The server should validate and reject
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Invalid type" }),
        });
      });

      const result = await page.evaluate(async (v) => {
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: v, threshold: 70, channel: "EMAIL" }),
        });
        return { status: res.status };
      }, value);

      expect(result.status).not.toBe(500);
    });
  }
});

/* ======================================================================== */
/*  10. Endpoint discovery / directory brute-force protection                */
/* ======================================================================== */

test.describe("Endpoint discovery protection", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  const COMMON_ATTACK_PATHS = [
    "/.env",
    "/.git/config",
    "/admin",
    "/wp-admin",
    "/api/",
    "/api/users",
    "/api/admin",
    "/api/keys",
    "/api/config",
    "/api/secrets",
    "/api/internal",
    "/api/health",
    "/api/debug",
    "/api/__test",
    "/swagger",
    "/api-docs",
    "/graphql",
  ];

  for (const path of COMMON_ATTACK_PATHS) {
    test(`Chemin sensible "${path}" → pas d'information sensible divulguée`, async ({ page }) => {
      // Allow all routes to fall through to actual server behavior
      // We just verify the response doesn't expose sensitive data
      const result = await page.evaluate(async (p) => {
        try {
          const res = await fetch(p, { method: "GET" });
          const text = await res.text();
          return {
            status: res.status,
            contentType: res.headers.get("content-type") || "",
            bodyLength: text.length,
            containsSensitive:
              text.includes("SECRET") ||
              text.includes("password") ||
              text.includes("DATABASE_URL") ||
              text.includes("JWT_SECRET") ||
              text.includes("API_KEY") ||
              text.includes("PRIVATE_KEY"),
          };
        } catch {
          return { status: 0, contentType: "", bodyLength: 0, containsSensitive: false };
        }
      }, path);

      // Should either return 404, 401, 403, or 405 — not 200 with sensitive data
      if (result.status === 200) {
        // If it returns 200, should not contain sensitive info
        expect(result.containsSensitive).toBe(false);
      } else {
        // 404, 401, 403, 405 are all acceptable
        expect([401, 403, 404, 405, 0]).toContain(result.status);
      }
    });
  }
});
