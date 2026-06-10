import { prisma } from "@/lib/prisma";

/**
 * Get all active niches sorted alphabetically by name.
 */
export async function getAllActiveNiches() {
  return prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all user's followed niches with full niche data.
 */
export async function getUserNiches(userId: string) {
  return prisma.userNiche.findMany({
    where: { userId },
    include: { niche: true },
  });
}

/**
 * Get a niche by its slug.
 */
export async function getNicheBySlug(slug: string) {
  return prisma.niche.findUnique({ where: { slug } });
}

/**
 * Get a niche by its ID.
 */
export async function getNicheById(id: string) {
  return prisma.niche.findUnique({ where: { id } });
}

/**
 * Follow a niche (create a UserNiche record).
 */
export async function followNiche(userId: string, nicheId: string) {
  return prisma.userNiche.create({
    data: { userId, nicheId },
    include: { niche: true },
  });
}

/**
 * Unfollow a niche (delete the UserNiche record).
 */
export async function unfollowNiche(userId: string, nicheId: string) {
  await prisma.userNiche.delete({
    where: { userId_nicheId: { userId, nicheId } },
  });
}

/**
 * Check if a user is already following a niche.
 */
export async function isFollowingNiche(userId: string, nicheId: string) {
  const existing = await prisma.userNiche.findUnique({
    where: { userId_nicheId: { userId, nicheId } },
  });
  return existing !== null;
}

/**
 * Count how many niches a user follows.
 */
export async function countUserNiches(userId: string) {
  return prisma.userNiche.count({ where: { userId } });
}

/**
 * Get all niches (including inactive) with trend and alert counts — for admin.
 */
export async function getAllNichesWithCounts() {
  return prisma.niche.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { trends: true, alerts: true } },
    },
  });
}

/**
 * Count total niches.
 */
export async function getNicheCount() {
  return prisma.niche.count();
}

/**
 * Get user niches with pagination (cursor-based) — for the niches API.
 */
export async function getUserNichesPaginated(
  userId: string,
  options?: { limit?: number; cursor?: string },
) {
  const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
  const take = limit + 1;

  const userNiches = await prisma.userNiche.findMany({
    where: { userId },
    include: {
      niche: {
        include: {
          _count: { select: { trends: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = userNiches.length > limit;
  const paginatedNiches = hasMore ? userNiches.slice(0, limit) : userNiches;
  const nextCursor: string | null = hasMore ? paginatedNiches[paginatedNiches.length - 1].id : null;

  return { userNiches: paginatedNiches, nextCursor };
}

/**
 * Get all active niches with user-follow status and trend counts — for the my-niches dashboard.
 * Includes which niches the given user follows and how many trends each niche has.
 */
export async function getAllActiveNichesWithUserStatus(userId: string) {
  return prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      userNiches: {
        where: { userId },
      },
      _count: {
        select: { trends: true },
      },
    },
  });
}

/**
 * Get all followed niche IDs for a user.
 */
export async function getAllFollowedNicheIds(userId: string) {
  const records = await prisma.userNiche.findMany({
    where: { userId },
    select: { nicheId: true },
  });
  return records.map((r) => r.nicheId);
}
