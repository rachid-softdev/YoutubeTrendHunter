/**
 * Cache utility — re-exports Redis helpers with typed key builders.
 */
import { getCached, setCached, invalidateCache } from "@/lib/redis";

// ── Key Builders ──

/** Cache key for trending data by niche slug. */
export function trendingKey(nicheSlug: string): string {
  return `trending:${nicheSlug}`;
}

/** Cache key for a user's subscription data. */
export function subscriptionKey(userId: string): string {
  return `sub:${userId}`;
}

/** Cache key for user profile data. */
export function userKey(userId: string): string {
  return `user:${userId}`;
}

/** Cache key for API rate-limit tracking. */
export function rateLimitKey(identifier: string): string {
  return `ratelimit:${identifier}`;
}

// ── Cache Key Builders ──

export const cacheKeys = {
  trends: (nicheSlug: string, plan: string) => `trends:list:${nicheSlug}:${plan}`,
  niches: (plan: string) => `niches:list:${plan}`,
  alerts: (userId: string) => `alerts:${userId}`,
};

// ── Cache TTL (seconds) ──

export const cacheTTL = {
  trends: 300,
  niches: 600,
  alerts: 120,
};

// ── Re-exported helpers ──

export { getCached, setCached, invalidateCache };
