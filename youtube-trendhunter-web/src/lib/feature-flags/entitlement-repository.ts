// ============================================
// PrismaEntitlementRepository — IEntitlementRepository impl
// ============================================

import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import type {
  IEntitlementRepository,
  PlanRecord,
  FeatureRecord,
  PlanFeatureRecord,
  OrganizationRecord,
  SubscriptionRecord,
  EntitlementOverrideRecord,
  UsageTrackingRecord,
  OverrideScope,
  CreateOverrideInput,
  SubscriptionStatus,
} from "./types";

/**
 * Maps Prisma Subscription fields to our domain interface.
 */
function mapSubscription(sub: Record<string, unknown>): SubscriptionRecord {
  return {
    id: sub.id as string,
    userId: sub.userId as string,
    orgId: (sub.orgId as string) ?? null,
    planKey: (sub.planKey as string) ?? null,
    plan: sub.plan as string,
    status: sub.status as SubscriptionStatus,
    stripeSubscriptionId: (sub.stripeSubscriptionId as string) ?? null,
    stripePriceId: (sub.stripePriceId as string) ?? null,
    currentPeriodStart: (sub.currentPeriodStart as Date) ?? null,
    currentPeriodEnd: (sub.currentPeriodEnd as Date) ?? null,
    stripeCurrentPeriodEnd: (sub.stripeCurrentPeriodEnd as Date) ?? null,
    trialEnd: (sub.trialEnd as Date) ?? null,
    trialStart: (sub.trialStart as Date) ?? null,
    createdAt: sub.createdAt as Date,
    updatedAt: sub.updatedAt as Date,
  };
}

export class PrismaEntitlementRepository implements IEntitlementRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  // ─── Plans ───

  async getPlan(planKey: string): Promise<PlanRecord | null> {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    return plan as unknown as PlanRecord | null;
  }

  async getAllPlans(): Promise<PlanRecord[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    return plans as unknown as PlanRecord[];
  }

  async getActivePlans(): Promise<PlanRecord[]> {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    return plans as unknown as PlanRecord[];
  }

  // ─── Features ───

  async getFeature(featureKey: string): Promise<FeatureRecord | null> {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    return feature as unknown as FeatureRecord | null;
  }

  async getAllFeatures(): Promise<FeatureRecord[]> {
    const features = await this.prisma.feature.findMany();
    return features as unknown as FeatureRecord[];
  }

  async getActiveFeatures(): Promise<FeatureRecord[]> {
    const features = await this.prisma.feature.findMany({ where: { isActive: true } });
    return features as unknown as FeatureRecord[];
  }

  // ─── Plan Features ───

  async getPlanFeatures(planId: string): Promise<PlanFeatureRecord[]> {
    const pfs = await this.prisma.planFeature.findMany({
      where: { planId },
      include: { feature: true, plan: true },
      orderBy: { sortOrder: "asc" },
    });
    return pfs as unknown as PlanFeatureRecord[];
  }

  async getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureRecord | null> {
    const pf = await this.prisma.planFeature.findFirst({
      where: { planId, feature: { key: featureKey } },
      include: { feature: true, plan: true },
    });
    return pf as unknown as PlanFeatureRecord | null;
  }

  async getPlanFeaturesForPlan(planId: string): Promise<PlanFeatureRecord[]> {
    return this.getPlanFeatures(planId);
  }

  // ─── Organization ───

  async getOrganization(orgId: string): Promise<OrganizationRecord | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return org as unknown as OrganizationRecord | null;
  }

  // ─── Subscription ───

  async getActiveSubscription(orgId: string): Promise<SubscriptionRecord | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        orgId,
        status: { in: ["ACTIVE", "TRIALING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return sub ? mapSubscription(sub as unknown as Record<string, unknown>) : null;
  }

  async updateSubscription(
    orgId: string,
    data: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
    const sub = await this.prisma.subscription.updateMany({
      where: { orgId },
      data: data as Record<string, unknown>,
    });
    // Fetch and return the updated subscription
    const updated = await this.prisma.subscription.findFirst({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
    });
    if (!updated) throw new Error(`No subscription found for org ${orgId}`);
    return mapSubscription(updated as unknown as Record<string, unknown>);
  }

  async createSubscription(
    orgId: string,
    planKey: string,
    data?: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
    // Find a user for this org to link the subscription
    const user = await this.prisma.user.findFirst({ where: { orgId } });
    if (!user) throw new Error(`No user found for org ${orgId}`);

    const sub = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        orgId,
        planKey,
        plan: planKey.toUpperCase() as "FREE" | "PRO" | "TEAM",
        status: "ACTIVE",
        stripeSubscriptionId: data?.stripeSubscriptionId ?? null,
        stripePriceId: data?.stripePriceId ?? null,
        currentPeriodStart: data?.currentPeriodStart ?? new Date(),
        currentPeriodEnd:
          data?.currentPeriodEnd ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return mapSubscription(sub as unknown as Record<string, unknown>);
  }

  // ─── Overrides ───

  async getOverride(
    scope: OverrideScope,
    scopeId: string,
    featureKey: string,
  ): Promise<EntitlementOverrideRecord | null> {
    const now = new Date();
    const override = await this.prisma.entitlementOverride.findFirst({
      where: {
        scope,
        scopeId,
        featureKey,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    });
    return override as unknown as EntitlementOverrideRecord | null;
  }

  async getOverridesForOrg(orgId: string): Promise<EntitlementOverrideRecord[]> {
    const now = new Date();
    const overrides = await this.prisma.entitlementOverride.findMany({
      where: {
        scope: "ORG",
        scopeId: orgId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    });
    return overrides as unknown as EntitlementOverrideRecord[];
  }

  async getOverridesForUser(userId: string): Promise<EntitlementOverrideRecord[]> {
    const now = new Date();
    const overrides = await this.prisma.entitlementOverride.findMany({
      where: {
        scope: "USER",
        scopeId: userId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    });
    return overrides as unknown as EntitlementOverrideRecord[];
  }

  async createOverride(data: CreateOverrideInput): Promise<EntitlementOverrideRecord> {
    const override = await this.prisma.entitlementOverride.create({
      data: {
        scope: data.scope,
        scopeId: data.scopeId,
        featureKey: data.featureKey,
        enabled: data.enabled,
        limitValue: data.limitValue ?? null,
        configJson: (data.configJson ?? null) as any,
        expiresAt: data.expiresAt ?? null,
        reason: data.reason,
        organizationId: data.organizationId ?? null,
      },
    });
    return override as unknown as EntitlementOverrideRecord;
  }

  async updateOverride(
    id: string,
    data: Partial<EntitlementOverrideRecord>,
  ): Promise<EntitlementOverrideRecord> {
    const override = await this.prisma.entitlementOverride.update({
      where: { id },
      data: data as Record<string, unknown>,
    });
    return override as unknown as EntitlementOverrideRecord;
  }

  async deleteOverride(id: string): Promise<void> {
    await this.prisma.entitlementOverride.delete({ where: { id } });
  }

  // ─── Usage ───

  async getCurrentUsage(
    orgId: string,
    featureKey: string,
  ): Promise<UsageTrackingRecord | null> {
    const usage = await this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodEnd: { gte: new Date() },
      },
      orderBy: { periodEnd: "desc" },
    });
    return usage as unknown as UsageTrackingRecord | null;
  }

  async getUsageForPeriod(
    orgId: string,
    featureKey: string,
    periodStart: Date,
  ): Promise<UsageTrackingRecord | null> {
    const usage = await this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodStart,
      },
    });
    return usage as unknown as UsageTrackingRecord | null;
  }

  async createUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageTrackingRecord> {
    const usage = await this.prisma.usageTracking.create({
      data: {
        orgId,
        featureKey,
        usageCount: 0,
        periodStart,
        periodEnd,
      },
    });
    return usage as unknown as UsageTrackingRecord;
  }

  /**
   * Atomic consume: uses a raw UPDATE ... RETURNING to avoid race conditions.
   * Falls back to non-atomic if the DB doesn't support RETURNING.
   */
  async consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
    maxAllowed?: number,
  ): Promise<{ success: boolean; usageCount: number } | null> {
    // Defense-in-depth: reject non-positive amounts
    if (amount <= 0) {
      return null;
    }

    try {
      // Build the WHERE clause with an optional limit guard to prevent TOCTOU races
      // NOTE: PostgreSQL double-quoting preserves case-sensitive table/column names
      // matching Prisma's generated schema (@@map not used on UsageTracking model).
      let whereClause = `WHERE "orgId" = $2 AND "featureKey" = $3 AND "periodEnd" > NOW()`;
      const params: unknown[] = [amount, orgId, featureKey];
      if (maxAllowed !== undefined) {
        whereClause += ` AND "usageCount" + $1 <= $4`;
        params.push(maxAllowed);
      }

      // Try atomic update
      const result = await this.prisma.$executeRawUnsafe(
        `UPDATE "UsageTracking"
         SET "usageCount" = "usageCount" + $1
         ${whereClause}
         RETURNING "usageCount"`,
        ...params,
      );

      if (result > 0) {
        const updated = (await this.prisma.$queryRawUnsafe<
          Array<{ usageCount: number }>
        >(
          `SELECT "usageCount" FROM "UsageTracking"
           WHERE "orgId" = $1 AND "featureKey" = $2 AND "periodEnd" > NOW()
           ORDER BY "periodEnd" DESC LIMIT 1`,
          orgId,
          featureKey,
        )) as unknown as Array<{ usageCount: number }>;

        const usageCount = updated[0]?.usageCount ?? 0;
        return { success: true, usageCount };
      }

      // UPDATE returned 0 rows — could be TOCTOU guard or no active period
      // Check if an active period exists to distinguish the two cases.
      const existingPeriod = await this.getCurrentUsage(orgId, featureKey);
      if (existingPeriod) {
        // Active period exists but UPDATE didn't match → TOCTOU guard prevented it
        return null;
      }

      // No active period — create one
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await this.createUsage(orgId, featureKey, now, periodEnd);
      return { success: true, usageCount: amount };
    } catch (err) {
      log("warn", "[EntitlementRepo] consumeUsage atomic failed, trying non-atomic", {
        error: String(err),
        orgId,
        featureKey,
      });

      // Non-atomic fallback (still enforces limit for defense-in-depth)
      const existing = await this.getCurrentUsage(orgId, featureKey);
      if (existing) {
        if (maxAllowed !== undefined && existing.usageCount + amount > maxAllowed) {
          return null;
        }
        const updated = await this.prisma.usageTracking.update({
          where: { id: existing.id },
          data: { usageCount: existing.usageCount + amount },
        });
        return { success: true, usageCount: updated.usageCount };
      }

      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const created = await this.createUsage(orgId, featureKey, now, periodEnd);
      return { success: true, usageCount: amount };
    }
  }

  // ─── Stripe Events ───

  async hasStripeEventBeenProcessed(eventId: string): Promise<boolean> {
    const event = await this.prisma.stripeEvent.findUnique({
      where: { eventId },
    });
    return event?.processed ?? false;
  }

  async markStripeEventProcessed(eventId: string, type: string): Promise<void> {
    await this.prisma.stripeEvent.upsert({
      where: { eventId },
      create: { eventId, type, processed: true },
      update: { processed: true },
    });
  }
}
