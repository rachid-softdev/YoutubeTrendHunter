import type { Page } from "@playwright/test";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  plan: "FREE" | "PRO" | "TEAM";
  role?: "USER" | "ADMIN";
}

/**
 * Set a session cookie directly in the browser context.
 * This allows E2E tests to simulate an authenticated session without
 * requiring a real database — the /api/auth/session endpoint mock
 * must return matching session data.
 *
 * NOTE: Test files should import from "_e2e-helpers" (node_modules package)
 * instead of this file to avoid Playwright's transpiler bug (context.conditions?.includes).
 * This file is kept for TypeScript type reference.
 */
export async function injectSessionCookie(
  page: Page,
  overrides?: Partial<TestUser>,
): Promise<{ user: TestUser; sessionToken: string }> {
  const sessionToken = `e2e-test-session-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  const user: TestUser = {
    id: overrides?.id ?? "e2e-test-user-id",
    email: overrides?.email ?? "e2e-test@trendhunter.app",
    name: overrides?.name ?? "E2E Test User",
    plan: overrides?.plan ?? "FREE",
    role: overrides?.role ?? "USER",
  };

  await page.context().addCookies([
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

export async function cleanupTestSession(_sessionToken: string): Promise<void> {
  // No-op: session cleanup is handled by test lifecycle / mock reset
}

export async function cleanupUserSessions(_userId: string): Promise<void> {
  // No-op: session cleanup is handled by test lifecycle / mock reset
}
