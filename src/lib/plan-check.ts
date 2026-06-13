import { prisma } from "@/lib/prisma"

export async function getUserPlan(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, stripeCurrentPeriodEnd: true },
  })

  if (!sub || sub.status === "CANCELED") return "FREE"
  if (sub.stripeCurrentPeriodEnd < new Date()) return "FREE"
  return sub.plan
}

export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false },
  PRO:  { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

export function getTrendsTake(plan: PlanTier): number | undefined {
  const limit = PLAN_LIMITS[plan].trendsPerNiche
  return limit === -1 ? undefined : limit
}