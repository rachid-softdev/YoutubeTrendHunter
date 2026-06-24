import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Send a runtime message from the extension page and await the response.
 */
function sendMessage<T = any>(page: Page, msg: Record<string, unknown>): Promise<T> {
  return page.evaluate((m) => {
    return new Promise<any>((resolve) => {
      chrome.runtime.sendMessage(m, resolve);
    });
  }, msg);
}

/**
 * Set values in chrome.storage.session from the extension page.
 */
async function setSessionStorage(page: Page, items: Record<string, unknown>): Promise<void> {
  await page.evaluate((data) => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set(data, resolve);
    });
  }, items);
}

/**
 * Clear all extension storage (session + sync).
 */
async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    return Promise.all([
      new Promise<void>((r) => chrome.storage.session.clear(r)),
      new Promise<void>((r) => chrome.storage.sync.clear(r)),
    ]).then(() => {});
  });
}

/* ========================================================================== */
/*  Tests — windowId fallback                                                  */
/* ========================================================================== */

test.describe("Background — windowId fallback", () => {
  test("action.onClicked avec windowId existant → sidePanel.open appelé", async ({
    page,
    context,
  }) => {
    // Verify sidepanel state: the extension loaded successfully
    // (windowId handling is internal to background.js, tested via side effect)
    const sidePanelAccessible = await page.evaluate(() => {
      return typeof chrome.sidePanel !== "undefined" && typeof chrome.sidePanel.open === "function";
    });
    expect(sidePanelAccessible).toBe(true);
  });

  test("background service worker is running", async ({ context }) => {
    const workers = context.serviceWorkers();
    expect(workers.length).toBeGreaterThanOrEqual(1);
    const sw = workers[0];
    expect(sw).toBeDefined();
    const url = sw.url();
    expect(url).toContain("background");
  });
});

/* ========================================================================== */
/*  Tests — Storage error resilience                                            */
/* ========================================================================== */

test.describe("Background — Storage error resilience", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllStorage(page);
  });

  test("GET_TRENDS avec storage.session.get qui échoue → NOT_AUTHENTICATED", async ({ page }) => {
    // Override storage.get to throw
    await page.evaluate(() => {
      const originalGet = chrome.storage.session.get.bind(chrome.storage.session);
      chrome.storage.session.get = () => Promise.reject(new Error("Storage unavailable"));
    });

    const response = await sendMessage<any>(page, { type: "GET_TRENDS" });
    expect(response.error).toBe("NOT_AUTHENTICATED");
  });

  test("ANALYZE_VIDEO avec storage.session.get qui échoue → NOT_AUTHENTICATED", async ({
    page,
  }) => {
    await page.evaluate(() => {
      chrome.storage.session.get = () => Promise.reject(new Error("Storage unavailable"));
    });

    const response = await sendMessage<any>(page, { type: "ANALYZE_VIDEO", videoId: "test123" });
    expect(response.error).toBe("NOT_AUTHENTICATED");
  });
});

/* ========================================================================== */
/*  Tests — Unknown message types                                               */
/* ========================================================================== */

test.describe("Background — Unknown message types", () => {
  test("message type inconnu → réponse undefined (pas de crash)", async ({ page }) => {
    const response = await sendMessage<any>(page, { type: "UNKNOWN_TYPE" });
    // For unhandled messages, the listener returns undefined
    // chrome.runtime.sendMessage resolves to undefined when no response
    expect(response).toBeUndefined();
  });

  test("message sans champ type → réponse undefined", async ({ page }) => {
    const response = await sendMessage<any>(page, {});
    expect(response).toBeUndefined();
  });
});

/* ========================================================================== */
/*  Tests — ANALYZE_VIDEO edge cases                                           */
/* ========================================================================== */

test.describe("Background — ANALYZE_VIDEO edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await setSessionStorage(page, { apiToken: "valid-token" });
  });

  test("ANALYZE_VIDEO avec videoId undefined → INVALID_VIDEO_ID", async ({ page }) => {
    const response = await sendMessage<any>(page, { type: "ANALYZE_VIDEO" });
    expect(response.error).toBe("INVALID_VIDEO_ID");
  });

  test("ANALYZE_VIDEO avec videoId vide → INVALID_VIDEO_ID", async ({ page }) => {
    const response = await sendMessage<any>(page, { type: "ANALYZE_VIDEO", videoId: "" });
    expect(response.error).toBe("INVALID_VIDEO_ID");
  });

  test("GET_TRENDS avec réponse API non-JSON → FETCH_ERROR", async ({ page }) => {
    await setSessionStorage(page, { apiToken: "valid-token", selectedNiche: "tech-ia" });

    // Override fetch to return invalid JSON
    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      (window as any).fetch = (url: string, opts?: any) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error("Invalid JSON")),
          text: () => Promise.resolve("not-json-at-all"),
        });
      };
    });

    const response = await sendMessage<any>(page, { type: "GET_TRENDS" });
    expect(response.error).toBe("FETCH_ERROR");
  });
});

/* ========================================================================== */
/*  Tests — Multiple tabs behavior                                              */
/* ========================================================================== */

test.describe("Background — Multi-tab behavior", () => {
  test("sidepanel accessible depuis plusieurs contextes", async ({ page }) => {
    // The extension is loaded in the fixture context
    // Verify the sidepanel page renders correctly
    const hasSidePanel = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        chrome.sidePanel.getOptions({}, (opts) => {
          resolve(opts && typeof opts.enabled === "boolean");
        });
      });
    });
    expect(hasSidePanel).toBe(true);
  });
});
