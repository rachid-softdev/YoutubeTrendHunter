import { type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

export interface TestUser {
  id: string;
  email: string;
  name: string;
  plan: "FREE" | "PRO" | "TEAM";
}

function makeSessionToken(): string {
  return `e2e-test-session-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export async function injectSessionCookie(
  page: Page,
  overrides?: Partial<TestUser>,
): Promise<{ user: TestUser; sessionToken: string }> {
  const email = overrides?.email ?? "e2e-test@trendhunter.app";
  const userId = overrides?.id ?? "e2e-test-user-id";
  const plan = overrides?.plan ?? "FREE";
  const name = overrides?.name ?? "E2E Test User";
  const sessionToken = makeSessionToken();

  await prisma.user.upsert({
    where: { email },
    create: { id: userId, email, name },
    update: { name },
  });

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan },
    update: { plan },
  });

  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId, expires },
  });

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

  return { user: { id: userId, email, name, plan }, sessionToken };
}

export async function cleanupTestSession(sessionToken: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { sessionToken },
  });
}

export async function cleanupUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });
}
