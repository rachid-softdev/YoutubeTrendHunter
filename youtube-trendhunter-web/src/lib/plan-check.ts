import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

import type { SubscriptionPlan } from "@prisma/client";

export async function getUserPlan(
  userId: string,
  session?: Session | null,
): Promise<SubscriptionPlan> {
  // Use session data if available to avoid DB round-trip
  if (session?.user?.plan) {
    return session.user.plan;
  }

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
  if (!sub.stripeCurrentPeriodEnd || sub.stripeCurrentPeriodEnd < new Date()) return "FREE";

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

export async function activateTrial(userId: string, plan: SubscriptionPlan, days: number = 7) {
  // Guard: prevent activating trial if already on active trial or paid subscription
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { trialStart: true, trialEnd: true, status: true },
  });

  if (existing) {
    const now = new Date();
    if (existing.trialStart && existing.trialEnd && now >= existing.trialStart && now <= existing.trialEnd) {
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

export const PLAN_LIMITS = {
  FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
  PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
  TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
};
