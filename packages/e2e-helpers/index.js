/**
 * E2E test helpers ? placed in node_modules to bypass Playwright's internal
 * esbuild transpilation bug (context.conditions?.includes) that occurs when
 * test files import local modules and use the imported functions.
 *
 * @module _e2e-helpers
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {Object} [overrides]
 * @param {string} [overrides.id]
 * @param {string} [overrides.email]
 * @param {string} [overrides.name]
 * @param {'FREE'|'PRO'|'TEAM'} [overrides.plan]
 * @param {'USER'|'ADMIN'} [overrides.role]
 * @returns {Promise<{user: Object, sessionToken: string}>}
 */
async function injectSessionCookie(page, overrides) {
  const sessionToken =
    "e2e-test-session-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now();
  const user = {
    id: (overrides && overrides.id) || "e2e-test-user-id",
    email: (overrides && overrides.email) || "e2e-test@trendhunter.app",
    name: (overrides && overrides.name) || "E2E Test User",
    plan: (overrides && overrides.plan) || "FREE",
    role: (overrides && overrides.role) || "USER",
  };
  await page
    .context()
    .addCookies([
      {
        name: "authjs.session-token",
        value: sessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  return { user, sessionToken };
}

/** @param {string} _sessionToken */
async function cleanupTestSession(_sessionToken) {
  // No-op: session cleanup is handled by test lifecycle / mock reset
}

/** @param {string} _userId */
async function cleanupUserSessions(_userId) {
  // No-op: session cleanup is handled by test lifecycle / mock reset
}

module.exports = { injectSessionCookie, cleanupTestSession, cleanupUserSessions };
