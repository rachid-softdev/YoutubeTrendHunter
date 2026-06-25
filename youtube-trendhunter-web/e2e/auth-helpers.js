export async function injectSessionCookie(page, overrides) {
  const sessionToken = e2e - test - session--;
  const user = {
    id: overrides?.id ?? "e2e-test-user-id",
    email: overrides?.email ?? "e2e-test@trendhunter.app",
    name: overrides?.name ?? "E2E Test User",
    plan: overrides?.plan ?? "FREE",
    role: overrides?.role ?? "USER",
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
export async function cleanupTestSession(_sessionToken) {}
export async function cleanupUserSessions(_userId) {}
