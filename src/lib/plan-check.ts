import { prisma } from "@/lib/prisma"

export async function getUserPlan(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, stripeCurrentPeriodEnd: true },
  })

  if (!sub || sub.status === "CANCELED" || sub.status === "INCOMPLETE") return "FREE"
  if (sub.stripeCurrentPeriodEnd < new Date()) return "FREE"
  return sub.plan
}

export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false },
  PRO:  { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
}