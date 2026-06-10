import { prisma } from "@/lib/prisma";

/**
 * Fetch trends for a specific niche with cursor-based pagination.
 * Respects plan limits: FREE → 5, paid → requested limit (default 20).
 */
export async function getTrendsByNiche(
  nicheId: string,
  options?: { limit?: number; cursor?: string; plan?: string },
) {
  const planLimit = options?.plan === "FREE" ? 5 : (options?.limit ?? 20);
  const take = planLimit + 1; // +1 to detect next page

  const trends = await prisma.trend.findMany({
    where: { nicheId, expiresAt: { gte: new Date() } },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    take,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = trends.length > take - 1;
  const results = hasMore ? trends.slice(0, take - 1) : trends;
  const nextCursor: string | null = hasMore ? results[results.length - 1].id : null;

  return { trends: results, nextCursor };
}

/**
 * Get trends for the dashboard page — resolves niche by slug, applies plan limit.
 */
export async function getTrendsForDashboard(nicheSlug: string, plan: string, limit?: number) {
  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } });
  if (!niche) return [];

  const take = limit ?? (plan === "FREE" ? 5 : 20);

  return prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take,
  });
}

/**
 * Get trends for the Chrome extension with cursor-based pagination.
 * FREE → 5 trends, paid → up to 20.
 */
export async function getTrendsForExtension(nicheSlug: string, plan: string) {
  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } });
  if (!niche) return { trends: [], nextCursor: null };

  const planLimit = plan === "FREE" ? 5 : 20;
  const take = planLimit + 1;

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    take,
  });

  const hasMore = trends.length > take - 1;
  const results = hasMore ? trends.slice(0, take - 1) : trends;
  const nextCursor: string | null = hasMore ? results[results.length - 1].id : null;

  return { trends: results, nextCursor };
}

/**
 * Delete all trends that have expired.
 * Returns the number of deleted rows.
 */
export async function purgeExpiredTrends() {
  const result = await prisma.trend.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/**
 * Count active (non-expired) trends.
 */
export async function getActiveTrendCount() {
  return prisma.trend.count({ where: { expiresAt: { gt: new Date() } } });
}
