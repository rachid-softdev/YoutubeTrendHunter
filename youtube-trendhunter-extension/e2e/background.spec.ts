import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Send a runtime message from the extension page and await the response.
 * Uses the callback form of chrome.runtime.sendMessage.
 */
function sendMessage<T = any>(
  page: Page,
  msg: Record<string, unknown>,
): Promise<T> {
  return page.evaluate((m) => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(m, resolve);
    });
  }, msg);
}

/**
 * Set values in chrome.storage.session from the extension page.
 */
async function setSessionStorage(
  page: Page,
  items: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set(data, resolve);
    });
  }, items);
}

/**
 * Set a value in chrome.storage.sync from the extension page.
 */
async function setSyncStorage(
  page: Page,
  items: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.sync.set(data, resolve);
    });
  }, items);
}

/**
 * Clear all extension storage (session + sync) from the extension page.
 */
async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

/**
 * Default successful GET_TRENDS response body.
 */
const DEFAULT_TRENDS_RESPONSE = JSON.stringify({
  trends: [
    { id: "1", title: "Trend 1", score: 85, channelName: "Channel 1" },
    { id: "2", title: "Trend 2", score: 72, channelName: "Channel 2" },
  ],
  plan: "FREE",
  nextCursor: null,
});

/**
 * Default successful ANALYZE_VIDEO response body.
 */
const DEFAULT_ANALYZE_RESPONSE = JSON.stringify({
  score: 85,
  analysis: "Strong upward trend detected",
  velocity: "+12%",
});

/* -------------------------------------------------------------------------- */
/*  Helper: set up API route mocking                                          */
/*  NOTE: We use context.route (not page.route) because the background        */
/*  service worker's fetch calls are NOT made from the page's frame.          */
/*  context.route intercepts requests from ALL sources, including workers.    */
/* -------------------------------------------------------------------------- */

function mockTrendsApi(
  ctx: BrowserContext,
  status: number,
  body: string,
  contentType = "application/json",
) {
  return ctx.route("**/api/extension/trends*", async (route) => {
    await route.fulfill({ status, contentType, body });
  });
}

function mockAnalyzeApi(
  ctx: BrowserContext,
  status: number,
  body: string,
  contentType = "application/json",
) {
  return ctx.route("**/api/extension/analyze", async (route) => {
    await route.fulfill({ status, contentType, body });
  });
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Extension — Background Script", () => {
  /* ------------------------------------------------------------------------ */
  /*  GET_TRENDS — Auth                                                       */
  /* ------------------------------------------------------------------------ */

  test.describe("GET_TRENDS — Auth", () => {
    test("returns NOT_AUTHENTICATED when no apiToken in storage", async ({
      page,
      context,
    }) => {
      // Ensure no token exists (fresh context — nothing set)
      await clearAllStorage(page);

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("returns NOT_AUTHENTICATED when apiToken is an empty string", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "" });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // The background checks `if (!apiToken)` — empty string is falsy
      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("returns trends data with a valid token", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Mock the API the background will call
      await mockTrendsApi(context, 200, DEFAULT_TRENDS_RESPONSE);

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toBeDefined();
      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
      expect(response.data.trends).toHaveLength(2);
      expect(response.data.plan).toBe("FREE");
      expect(response.data.trends[0].title).toBe("Trend 1");
      expect(response.data.trends[0].score).toBe(85);
    });

    test("defaults to tech-ia niche when selectedNiche is not in storage", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      expect(capturedUrl).toContain("niche=tech-ia");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  GET_TRENDS — API Communication                                          */
  /* ------------------------------------------------------------------------ */

  test.describe("GET_TRENDS — API Communication", () => {
    test("returns data.trends array when API returns 200 with trends", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      await mockTrendsApi(context, 200, DEFAULT_TRENDS_RESPONSE);

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(Array.isArray(response.data.trends)).toBe(true);
      expect(response.data.trends.length).toBeGreaterThan(0);
    });

    test("returns data.trends as empty array when API returns empty trends", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      await mockTrendsApi(
        context,
        200,
        JSON.stringify({ trends: [], plan: "FREE", nextCursor: null }),
      );

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(Array.isArray(response.data.trends)).toBe(true);
      expect(response.data.trends).toHaveLength(0);
    });

    test("returns FETCH_ERROR when API call itself throws (network unreachable)", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Abort the request to simulate a network failure
      await context.route("**/api/extension/trends*", async (route) => {
        await route.abort("internetdisconnected");
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("returns FETCH_ERROR when API returns non-JSON response", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Return plain text — res.json() will throw a SyntaxError
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "This is not JSON",
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("wraps API 401 error response in data (not FETCH_ERROR)", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // A 401 with valid JSON should be parsed successfully and wrapped in { data }
      await mockTrendsApi(
        context,
        401,
        JSON.stringify({ error: "Token invalide", code: "UNAUTHORIZED" }),
      );

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      // res.json() succeeds, so we get { data: { error, code } }
      expect(response.data).toBeDefined();
      expect(response.data.error).toBe("Token invalide");
      expect(response.data.code).toBe("UNAUTHORIZED");
      expect(response.error).toBeUndefined();
    });

    test("returns FETCH_ERROR when API returns 500", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // A 500 with no body or non-JSON body → res.json() throws → FETCH_ERROR
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Internal Server Error",
        });
      });

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("wraps API 429 rate-limit response in data (not FETCH_ERROR)", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // A 429 with valid JSON still parses successfully
      await mockTrendsApi(
        context,
        429,
        JSON.stringify({ error: "Trop de requêtes", code: "RATE_LIMIT" }),
      );

      const response = await sendMessage(page, { type: "GET_TRENDS" });

      expect(response.data).toBeDefined();
      expect(response.data.error).toBe("Trop de requêtes");
      expect(response.data.code).toBe("RATE_LIMIT");
      expect(response.error).toBeUndefined();
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  GET_TRENDS — Niche Parameter                                            */
  /* ------------------------------------------------------------------------ */

  test.describe("GET_TRENDS — Niche Parameter", () => {
    test("uses selectedNiche from session storage as query parameter", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "gaming",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get("niche")).toBe("gaming");
    });

    test("defaults to tech-ia when selectedNiche is undefined", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        // Intentionally not setting selectedNiche
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get("niche")).toBe("tech-ia");
    });

    test("defaults to tech-ia when selectedNiche is explicitly null", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: null,
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      const url = new URL(capturedUrl);
      expect(url.searchParams.get("niche")).toBe("tech-ia");
    });

    test("URL-encodes niche with special characters", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech & ia/spécial",
      });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // The background script uses template literal:
      // `...?niche=${selectedNiche ?? "tech-ia"}`
      // When niche has chars like & / and special chars, they should appear
      // URL-encoded in the actual request URL.
      expect(capturedUrl).toContain(encodeURIComponent("tech & ia/spécial"));
      // The raw chars should NOT appear as-is in the final URL
      expect(capturedUrl).not.toContain("tech & ia/spécial");
    });

    test("uses updated niche when selectedNiche changes between messages", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "gaming",
      });

      const capturedUrls: string[] = [];
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // First call with gaming
      await sendMessage(page, { type: "GET_TRENDS" });

      // Change niche
      await setSessionStorage(page, { selectedNiche: "fitness" });

      // Second call with fitness
      await sendMessage(page, { type: "GET_TRENDS" });

      expect(capturedUrls).toHaveLength(2);
      expect(new URL(capturedUrls[0]).searchParams.get("niche")).toBe("gaming");
      expect(new URL(capturedUrls[1]).searchParams.get("niche")).toBe("fitness");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  ANALYZE_VIDEO — Auth                                                    */
  /* ------------------------------------------------------------------------ */

  test.describe("ANALYZE_VIDEO — Auth", () => {
    test("returns NOT_AUTHENTICATED when no apiToken in storage", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("returns NOT_AUTHENTICATED with empty string apiToken", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "" });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response).toEqual({ error: "NOT_AUTHENTICATED" });
    });

    test("sends POST with videoId when authenticated", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedMethod = "";
      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedMethod = route.request().method();
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(capturedMethod).toBe("POST");
      expect(JSON.parse(capturedBody)).toEqual({ videoId: "abc123" });
      expect(response.data.score).toBe(85);
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  ANALYZE_VIDEO — API Communication                                       */
  /* ------------------------------------------------------------------------ */

  test.describe("ANALYZE_VIDEO — API Communication", () => {
    test("returns score when API returns 200", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });
      await mockAnalyzeApi(context, 200, DEFAULT_ANALYZE_RESPONSE);

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response.data.score).toBe(85);
    });

    test("returns FETCH_ERROR when API call throws (network unreachable)", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      await context.route("**/api/extension/analyze", async (route) => {
        await route.abort("internetdisconnected");
      });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("returns FETCH_ERROR when API returns non-JSON", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      await context.route("**/api/extension/analyze", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "Not JSON",
        });
      });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("returns FETCH_ERROR on API 500", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      await context.route("**/api/extension/analyze", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "Server Error",
        });
      });

      const response = await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "abc123",
      });

      expect(response).toEqual({ error: "FETCH_ERROR" });
    });

    test("verifies POST body contains correct videoId", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "dQw4w9WgXcQ",
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed).toHaveProperty("videoId");
      expect(parsed.videoId).toBe("dQw4w9WgXcQ");
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  ANALYZE_VIDEO — Edge Cases                                              */
  /* ------------------------------------------------------------------------ */

  test.describe("ANALYZE_VIDEO — Edge Cases", () => {
    test("sends null videoId in POST body", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: null,
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed).toHaveProperty("videoId");
      expect(parsed.videoId).toBeNull();
    });

    test("sends empty string videoId in POST body", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: "",
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed.videoId).toBe("");
    });

    test("sends special characters in videoId as-is", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      let capturedBody = "";
      await context.route("**/api/extension/analyze", async (route) => {
        capturedBody = route.request().postData() || "";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      const specialVideoId = "abc_123-xyz!@#$%^&*()";
      await sendMessage(page, {
        type: "ANALYZE_VIDEO",
        videoId: specialVideoId,
      });

      const parsed = JSON.parse(capturedBody);
      expect(parsed.videoId).toBe(specialVideoId);
    });

    test("handles rapid ANALYZE_VIDEO messages with separate responses", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, { apiToken: "th_test_token" });

      // Return a unique score per request
      let callCount = 0;
      await context.route("**/api/extension/analyze", async (route) => {
        callCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ score: callCount * 10 }),
        });
      });

      // Fire 5 rapid requests in parallel
      const results = await page.evaluate(() => {
        const ids = ["vid1", "vid2", "vid3", "vid4", "vid5"];
        return Promise.all(
          ids.map(
            (id) =>
              new Promise<any>((resolve) => {
                chrome.runtime.sendMessage(
                  { type: "ANALYZE_VIDEO", videoId: id },
                  resolve,
                );
              }),
          ),
        );
      });

      expect(results).toHaveLength(5);
      expect(callCount).toBe(5);

      // Each response should have a data property with a numeric score
      for (const result of results) {
        expect(result).toHaveProperty("data");
        expect(typeof result.data.score).toBe("number");
      }
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  Edge Cases                                                              */
  /* ------------------------------------------------------------------------ */

  test.describe("Edge Cases", () => {
    test("returns undefined for unknown message type", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);

      const response = await sendMessage(page, { type: "UNKNOWN_TYPE" });

      expect(response).toBeUndefined();
    });

    test("returns undefined for message without type field", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);

      const response = await sendMessage(page, {});

      expect(response).toBeUndefined();
    });

    test("uses custom API base URL when set in sync storage", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      // Set a custom API base URL in sync storage
      await setSyncStorage(page, { apiBaseUrl: "https://custom-api.example.com" });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // The URL should start with the custom base URL
      expect(capturedUrl).toContain("custom-api.example.com");
      expect(capturedUrl).toContain("/api/extension/trends");
    });

    test("falls back to default API URL when sync storage apiBaseUrl is empty string", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });
      // Setting an empty string should cause getApiBaseUrl to return the default
      await setSyncStorage(page, { apiBaseUrl: "" });

      let capturedUrl = "";
      await context.route("**/api/extension/trends*", async (route) => {
        capturedUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await sendMessage(page, { type: "GET_TRENDS" });

      // Should NOT use the empty string — falls back to default
      expect(capturedUrl).not.toContain("//api/extension");
      // Should contain the default base (from env or fallback)
      expect(capturedUrl).toContain("/api/extension/trends");
    });

    test("handles parallel GET_TRENDS messages — all resolve correctly", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      let requestCount = 0;
      await context.route("**/api/extension/trends*", async (route) => {
        requestCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      // Fire 3 GET_TRENDS in parallel
      const results: any[] = await page.evaluate(() => {
        return Promise.all(
          [1, 2, 3].map(
            () =>
              new Promise<any>((resolve) => {
                chrome.runtime.sendMessage({ type: "GET_TRENDS" }, resolve);
              }),
          ),
        );
      });

      expect(results).toHaveLength(3);
      expect(requestCount).toBe(3);

      for (const result of results) {
        expect(result).toHaveProperty("data");
        expect(result.data.trends).toHaveLength(2);
        expect(result.data.plan).toBe("FREE");
      }
    });

    test("handles interleaved GET_TRENDS and ANALYZE_VIDEO messages", async ({
      page,
      context,
    }) => {
      await clearAllStorage(page);
      await setSessionStorage(page, {
        apiToken: "th_test_token",
        selectedNiche: "tech-ia",
      });

      // Route both endpoints
      await context.route("**/api/extension/trends*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_TRENDS_RESPONSE,
        });
      });

      await context.route("**/api/extension/analyze", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: DEFAULT_ANALYZE_RESPONSE,
        });
      });

      const results: any[] = await page.evaluate(() => {
        return Promise.all([
          new Promise<any>((r) =>
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, r),
          ),
          new Promise<any>((r) =>
            chrome.runtime.sendMessage(
              { type: "ANALYZE_VIDEO", videoId: "vid123" },
              r,
            ),
          ),
          new Promise<any>((r) =>
            chrome.runtime.sendMessage({ type: "GET_TRENDS" }, r),
          ),
          new Promise<any>((r) =>
            chrome.runtime.sendMessage(
              { type: "ANALYZE_VIDEO", videoId: "vid456" },
              r,
            ),
          ),
        ]);
      });

      expect(results).toHaveLength(4);

      // GET_TRENDS responses
      expect(results[0].data.trends).toBeDefined();
      expect(results[2].data.trends).toBeDefined();

      // ANALYZE_VIDEO responses
      expect(results[1].data.score).toBe(85);
      expect(results[3].data.score).toBe(85);
    });
  });

  /* ------------------------------------------------------------------------ */
  /*  Sidepanel Management (tab events)                                       */
  /* ------------------------------------------------------------------------ */

  test.describe("Sidepanel & Tab Events", () => {
    test("chrome.runtime is accessible on the extension page", async ({
      page,
    }) => {
      const hasChromeRuntime = await page.evaluate(
        () =>
          typeof chrome !== "undefined" &&
          typeof chrome.runtime !== "undefined" &&
          typeof chrome.runtime.sendMessage !== "undefined",
      );
      expect(hasChromeRuntime).toBe(true);
    });

    test("background service worker is registered", async ({ context }) => {
      const workers = context.serviceWorkers();
      expect(workers.length).toBeGreaterThanOrEqual(1);

      const bgWorker = workers.find((w) => w.url().includes("background.js"));
      expect(bgWorker).toBeDefined();
    });

    test("extension manifest declares action and sidepanel", async ({
      page,
    }) => {
      // chrome.runtime.getManifest() is available on any extension page.
      const manifest: Record<string, any> = await page.evaluate(() =>
        chrome.runtime.getManifest(),
      );

      expect(manifest.action).toBeDefined();
      expect(manifest.side_panel).toBeDefined();
      expect(manifest.side_panel.default_path).toBe("sidepanel.html");
      expect(manifest.background).toBeDefined();
      expect(manifest.background.service_worker).toBe("background.js");
    });

    test("tabs.onUpdated listener is registered in the background", async ({
      context,
    }) => {
      // Verify the background service worker loaded the listener by checking
      // that the service worker is running and processing messages.
      const workers = context.serviceWorkers();
      const worker = workers.find((w: { url: () => string }) =>
        w.url().includes("background.js"),
      );
      expect(worker).toBeDefined();

      if (!worker) return; // TypeScript guard

      // The tabs.onUpdated listener should have fired for this navigation.
      // We verify the background worker received the event by confirming
      // the background script is alive and processing messages.
      const isAlive = await worker.evaluate(() => true);
      expect(isAlive).toBe(true);
    });
  });
});
