import { prisma } from "@/lib/prisma";

/**
 * Get all admin users (users with ADMIN role).
 */
export async function getAdminUsers() {
  return prisma.user.findMany({
    where: { role: "ADMIN" },
    include: { subscription: true },
  });
}

/**
 * Get the most recently registered users.
 */
export async function getRecentUsers(limit: number = 50) {
  return prisma.user.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      subscription: true,
      _count: { select: { alerts: true, apiTokens: true } },
    },
  });
}

/**
 * Get a user by their ID with subscription info.
 */
export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { subscription: true },
  });
}

/**
 * Get total number of registered users.
 */
export async function getUserCount() {
  return prisma.user.count();
}
