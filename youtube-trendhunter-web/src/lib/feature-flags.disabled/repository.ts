// ============================================
// Entitlement Repository - Prisma Implementation
// ============================================

import {
  PrismaClient,
  type Plan,
  type Feature,
  type PlanFeature,
  type Organization,
  type Subscription,
  type EntitlementOverride,
  type UsageTracking,
  type OverrideScope,
  type SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  IEntitlementRepository,
  PlanFeatureWithFeature,
  OrganizationWithSubscription,
} from "./types";

export class EntitlementRepository implements IEntitlementRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  // ========== PLAN ==========

  async getPlan(planKey: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({
      where: { key: planKey },
    });
  }

  async getAllPlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  async getActivePlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  // ========== FEATURE ==========

  async getFeature(featureKey: string): Promise<Feature | null> {
    return this.prisma.feature.findUnique({
      where: { key: featureKey },
    });
  }

  async getAllFeatures(): Promise<Feature[]> {
    return this.prisma.feature.findMany({
      orderBy: { key: "asc" },
    });
  }

  async getActiveFeatures(): Promise<Feature[]> {
    return this.prisma.feature.findMany({
      where: { isActive: true },
      orderBy: { key: "asc" },
    });
  }

  // ========== PLAN FEATURES ==========

  async getPlanFeatures(planId: string): Promise<PlanFeatureWithFeature[]> {
    return this.prisma.planFeature.findMany({
      where: { planId },
      include: { feature: true },
    }) as Promise<PlanFeatureWithFeature[]>;
  }

  async getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureWithFeature | null> {
    const feature = await this.prisma.feature.findUnique({
      where: { key: featureKey },
    });
    if (!feature) return null;

    return this.prisma.planFeature.findFirst({
      where: {
        planId,
        featureId: feature.id,
      },
      include: { feature: true },
    }) as Promise<PlanFeatureWithFeature | null>;
  }

  // ========== ORGANIZATION ==========

  async getOrganization(orgId: string): Promise<OrganizationWithSubscription | null> {
    return this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        subscriptions: {
          where: {
            status: { in: ["ACTIVE", "TRIALING"] },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }) as Promise<OrganizationWithSubscription | null>;
  }

  // ========== SUBSCRIPTION ==========

  async getActiveSubscription(orgId: string): Promise<Subscription | null> {
    return this.prisma.subscription.findFirst({
      where: {
        orgId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateSubscription(orgId: string, data: Partial<Subscription>): Promise<Subscription> {
    const existing = await this.getActiveSubscription(orgId);
    if (!existing) {
      throw new Error(`No active subscription found for org ${orgId}`);
    }
    return this.prisma.subscription.update({
      where: { id: existing.id },
      data,
    });
  }

  async createSubscription(
    orgId: string,
    planKey: string,
    data?: Partial<Subscription>,
  ): Promise<Subscription> {
    // Désactiver les autres subscriptions actives
    await this.prisma.subscription.updateMany({
      where: {
        orgId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      data: { status: "CANCELED" },
    });

    return this.prisma.subscription.create({
      data: {
        orgId,
        planKey,
        status: data?.status || "ACTIVE",
        stripeSubscriptionId: data?.stripeSubscriptionId,
        stripePriceId: data?.stripePriceId,
        currentPeriodStart: data?.currentPeriodStart || new Date(),
        currentPeriodEnd: data?.currentPeriodEnd,
        trialEnd: data?.trialEnd,
        trialStart: data?.trialStart,
      },
    });
  }

  // ========== ENTITLEMENT OVERRIDES ==========

  async getOverride(
    scope: OverrideScope,
    scopeId: string,
    featureKey: string,
  ): Promise<EntitlementOverride | null> {
    // Check pour override non expirée
    return this.prisma.entitlementOverride.findFirst({
      where: {
        scope,
        scopeId,
        featureKey,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  async getOverridesForOrg(orgId: string): Promise<EntitlementOverride[]> {
    return this.prisma.entitlementOverride.findMany({
      where: {
        scope: "ORG",
        scopeId: orgId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  async getOverridesForUser(userId: string): Promise<EntitlementOverride[]> {
    return this.prisma.entitlementOverride.findMany({
      where: {
        scope: "USER",
        scopeId: userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  async createOverride(
    data: Omit<EntitlementOverride, "id" | "createdAt" | "updatedAt">,
  ): Promise<EntitlementOverride> {
    return this.prisma.entitlementOverride.create({
      data,
    });
  }

  async updateOverride(
    id: string,
    data: Partial<EntitlementOverride>,
  ): Promise<EntitlementOverride> {
    return this.prisma.entitlementOverride.update({
      where: { id },
      data,
    });
  }

  async deleteOverride(id: string): Promise<void> {
    await this.prisma.entitlementOverride.delete({
      where: { id },
    });
  }

  // ========== USAGE TRACKING ==========

  async getCurrentUsage(orgId: string, featureKey: string): Promise<UsageTracking | null> {
    const now = new Date();
    return this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodEnd: { gt: now },
      },
      orderBy: { periodStart: "desc" },
    });
  }

  async getUsageForPeriod(
    orgId: string,
    featureKey: string,
    periodStart: Date,
  ): Promise<UsageTracking | null> {
    return this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodStart,
      },
    });
  }

  async createUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageTracking> {
    return this.prisma.usageTracking.create({
      data: {
        orgId,
        featureKey,
        usageCount: 0,
        periodStart,
        periodEnd,
      },
    });
  }

  async consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
  ): Promise<UsageTracking | null> {
    const now = new Date();

    // Trouver ou créer la période de tracking courante
    let usage = await this.getCurrentUsage(orgId, featureKey);

    if (!usage) {
      // Créer une nouvelle période mensuelle
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      usage = await this.createUsage(orgId, featureKey, periodStart, periodEnd);
    }

    // Mise à jour atomique
    const updated = await this.prisma.usageTracking.updateMany({
      where: {
        id: usage.id,
        periodEnd: { gt: now },
      },
      data: {
        usageCount: { increment: amount },
      },
    });

    if (updated.count === 0) {
      // La période a expiré entre-temps, réessayer
      return this.consumeUsage(orgId, featureKey, amount);
    }

    return this.prisma.usageTracking.findUnique({
      where: { id: usage.id },
    });
  }

  // ========== STRIPE EVENTS (Idempotency) ==========

  async hasStripeEventBeenProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.stripeEvent.findUnique({
      where: { eventId },
    });
    return event?.processed ?? false;
  }

  async markStripeEventProcessed(eventId: string, type: string): Promise<void> {
    await this.prisma.stripeEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        type,
        processed: true,
      },
      update: {
        processed: true,
        type,
      },
    });
  }
}

// Export singleton
export const entitlementRepository = new EntitlementRepository();
