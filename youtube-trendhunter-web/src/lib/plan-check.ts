import { prisma } from "@/lib/prisma";

// @ts-ignore - Old Plan enum type
import type { Plan } from "@prisma/client";

export async function getUserPlan(userId: string): Promise<Plan> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      stripeCurrentPeriodEnd: true,
      trialEnd: true,
      trialStart: true,
    },
  });

  // No subscription = FREE
  if (!sub) return "FREE";

  // Check for active trial
  if (sub.trialEnd && sub.trialStart) {
    const now = new Date();
    const trialActive = now >= sub.trialStart && now <= sub.trialEnd;
    if (trialActive) {
      // Trial gives PRO benefits
      return sub.plan === "TEAM" ? "TEAM" : "PRO";
    }
  }

  // Subscription expired or canceled
  if (sub.status === "CANCELED" || sub.status === "INCOMPLETE") return "FREE";
  if (sub.stripeCurrentPeriodEnd < new Date()) return "FREE";

  return sub.plan;
}

export async function isOnTrial(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { trialEnd: true, trialStart: true },
  });

  if (!sub?.trialEnd || !sub?.trialStart) return false;

  const now = new Date();
  return now >= sub.trialStart && now <= sub.trialEnd;
}

export async function getTrialDaysRemaining(userId: string): Promise<number> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { trialEnd: true },
  });

  if (!sub?.trialEnd) return 0;

  const now = new Date();
  const diff = sub.trialEnd.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function activateTrial(userId: string, plan: Plan, days: number = 7) {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return prisma.subscription.upsert({
    where: { userId },
    update: {
      trialStart: now,
      trialEnd,
      plan,
      status: "TRIALING",
    },
    create: {
      userId,
      plan,
      status: "TRIALING",
      trialStart: now,
      trialEnd,
      stripeSubscriptionId: `trial_${Date.now()}`,
      stripePriceId: plan === "TEAM" ? "team_trial" : "pro_trial",
      stripeCurrentPeriodEnd: trialEnd,
    },
  });
}

export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
  PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
};
