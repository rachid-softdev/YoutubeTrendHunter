import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan } from "@prisma/client";

/**
 * Determine the effective plan for a user.
 * Considers active trials, expired subscriptions, and cancelled status.
 */
export async function getUserPlan(userId: string): Promise<SubscriptionPlan> {
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
      // Trial gives PRO benefits (or TEAM if the plan is TEAM)
      return sub.plan === "TEAM" ? "TEAM" : "PRO";
    }
  }

  // Subscription expired or canceled
  if (sub.status === "CANCELED" || sub.status === "INCOMPLETE") return "FREE";
  if (!sub.stripeCurrentPeriodEnd || sub.stripeCurrentPeriodEnd < new Date()) return "FREE";

  return sub.plan;
}

/**
 * Get the full subscription status for a user.
 */
export async function getSubscriptionStatus(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    select: {
      plan: true,
      status: true,
      trialEnd: true,
      trialStart: true,
      stripeCurrentPeriodEnd: true,
      createdAt: true,
    },
  });
}

/**
 * Check if a user is currently on a trial.
 */
export async function isOnTrial(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { trialEnd: true, trialStart: true },
  });

  if (!sub?.trialEnd || !sub?.trialStart) return false;

  const now = new Date();
  return now >= sub.trialStart && now <= sub.trialEnd;
}

/**
 * Get the number of trial days remaining for a user.
 */
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

/**
 * Activate a trial subscription for a user.
 * Throws if an active trial or paid subscription already exists.
 */
export async function activateTrial(userId: string, plan: SubscriptionPlan, days: number = 7) {
  // Guard: prevent activating trial if already on active trial or paid subscription
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { trialStart: true, trialEnd: true, status: true },
  });

  if (existing) {
    const now = new Date();
    if (
      existing.trialStart &&
      existing.trialEnd &&
      now >= existing.trialStart &&
      now <= existing.trialEnd
    ) {
      throw new Error("Trial already active");
    }
    if (existing.status === "ACTIVE") {
      throw new Error("Paid subscription already exists");
    }
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return prisma.subscription.upsert({
    where: { userId },
    update: {
      trialStart: now,
      trialEnd,
      plan,
      status: "TRIALING",
      stripeSubscriptionId: `trial_${crypto.randomUUID()}`,
      stripePriceId: null,
      stripeCurrentPeriodEnd: trialEnd,
    },
    create: {
      userId,
      plan,
      status: "TRIALING",
      trialStart: now,
      trialEnd,
      stripeSubscriptionId: `trial_${crypto.randomUUID()}`,
      stripePriceId: null,
      stripeCurrentPeriodEnd: trialEnd,
    },
  });
}

/**
 * Plan feature limits for each tier.
 * -1 means unlimited.
 */
export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
  PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
} as const;

/**
 * Count total subscriptions.
 */
export async function getSubscriptionCount() {
  return prisma.subscription.count();
}

/**
 * Count subscriptions by plan.
 */
export async function countByPlan(plan: SubscriptionPlan) {
  return prisma.subscription.count({ where: { plan } });
}
