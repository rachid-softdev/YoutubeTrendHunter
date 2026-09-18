/**
 * Type declarations for _e2e-helpers
 */

import { Page } from "@playwright/test";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  plan: "FREE" | "PRO" | "TEAM";
  role?: "USER" | "ADMIN";
}

export function injectSessionCookie(
  page: Page,
  overrides?: Partial<TestUser>,
): Promise<{ user: TestUser; sessionToken: string }>;

export function cleanupTestSession(sessionToken: string): Promise<void>;
export function cleanupUserSessions(userId: string): Promise<void>;
