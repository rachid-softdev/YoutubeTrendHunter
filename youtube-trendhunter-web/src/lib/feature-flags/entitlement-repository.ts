// ============================================
// PrismaEntitlementRepository — IEntitlementRepository impl
// ============================================

import {
  PrismaClient,
  Prisma,
  Plan,
  Feature,
  Organization,
  Subscription,
  EntitlementOverride,
  UsageTracking,
} from "@prisma/client";
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
  FeatureType,
  DowngradeStrategy,
} from "./types";

function jsonToRecord(json: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (json === null || json === undefined) return null;
  if (typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return null;
}

function toPlanRecord(p: Plan): PlanRecord {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    priceMonthly: p.priceMonthly,
    isActive: p.isActive,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toFeatureRecord(f: Feature): FeatureRecord {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    type: f.type as FeatureType,
    defaultConfig: jsonToRecord(f.defaultConfig),
    isActive: f.isActive,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

type PlanFeatureWithRelations = Prisma.PlanFeatureGetPayload<{
  include: { feature: true; plan: true };
}>;

function toPlanFeatureRecord(pf: PlanFeatureWithRelations): PlanFeatureRecord {
  return {
    id: pf.id,
    planId: pf.planId,
    featureId: pf.featureId,
    enabled: pf.enabled,
    limitValue: pf.limitValue,
    configJson: jsonToRecord(pf.configJson),
    downgradeStrategy: pf.downgradeStrategy as DowngradeStrategy,
    sortOrder: pf.sortOrder,
    plan: toPlanRecord(pf.plan),
    feature: toFeatureRecord(pf.feature),
  };
}

function toOrganizationRecord(o: Organization): OrganizationRecord {
  return {
    id: o.id,
    name: o.name,
    stripeCustomerId: o.stripeCustomerId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function mapSubscription(sub: Subscription): SubscriptionRecord {
  return {
    id: sub.id,
    userId: sub.userId,
    orgId: sub.orgId ?? null,
    planKey: sub.planKey ?? null,
    plan: sub.plan,
    status: sub.status as SubscriptionStatus,
    stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
    stripePriceId: sub.stripePriceId ?? null,
    currentPeriodStart: sub.currentPeriodStart ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    stripeCurrentPeriodEnd: sub.stripeCurrentPeriodEnd ?? null,
    trialEnd: sub.trialEnd ?? null,
    trialStart: sub.trialStart ?? null,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  };
}

function toOverrideRecord(o: EntitlementOverride): EntitlementOverrideRecord {
  return {
    id: o.id,
    scope: o.scope as OverrideScope,
    scopeId: o.scopeId,
    featureKey: o.featureKey,
    enabled: o.enabled,
    limitValue: o.limitValue,
    configJson: jsonToRecord(o.configJson),
    expiresAt: o.expiresAt ?? null,
    reason: o.reason,
    organizationId: o.organizationId ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function toUsageRecord(u: UsageTracking): UsageTrackingRecord {
  return {
    id: u.id,
    orgId: u.orgId,
    featureKey: u.featureKey,
    usageCount: u.usageCount,
    periodStart: u.periodStart,
    periodEnd: u.periodEnd,
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
    return plan ? toPlanRecord(plan) : null;
  }

  async getAllPlans(): Promise<PlanRecord[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
    return plans.map(toPlanRecord);
  }

  async getActivePlans(): Promise<PlanRecord[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return plans.map(toPlanRecord);
  }

  // ─── Features ───

  async getFeature(featureKey: string): Promise<FeatureRecord | null> {
    const feature = await this.prisma.feature.findUnique({ where: { key: featureKey } });
    return feature ? toFeatureRecord(feature) : null;
  }

  async getAllFeatures(): Promise<FeatureRecord[]> {
    const features = await this.prisma.feature.findMany();
    return features.map(toFeatureRecord);
  }

  async getActiveFeatures(): Promise<FeatureRecord[]> {
    const features = await this.prisma.feature.findMany({ where: { isActive: true } });
    return features.map(toFeatureRecord);
  }

  // ─── Plan Features ───

  async getPlanFeatures(planId: string): Promise<PlanFeatureRecord[]> {
    const pfs = await this.prisma.planFeature.findMany({
      where: { planId },
      include: { feature: true, plan: true },
      orderBy: { sortOrder: "asc" },
    });
    return pfs.map(toPlanFeatureRecord);
  }

  async getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureRecord | null> {
    const pf = await this.prisma.planFeature.findFirst({
      where: { planId, feature: { key: featureKey } },
      include: { feature: true, plan: true },
    });
    return pf ? toPlanFeatureRecord(pf) : null;
  }

  async getPlanFeaturesForPlan(planId: string): Promise<PlanFeatureRecord[]> {
    return this.getPlanFeatures(planId);
  }

  // ─── Organization ───

  async getOrganization(orgId: string): Promise<OrganizationRecord | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    return org ? toOrganizationRecord(org) : null;
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
    return sub ? mapSubscription(sub) : null;
  }

  async updateSubscription(
    orgId: string,
    data: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
    await this.prisma.subscription.updateMany({
      where: { orgId },
      data: data as Prisma.SubscriptionUpdateManyMutationInput,
    });
    // Fetch and return the updated subscription
    const updated = await this.prisma.subscription.findFirst({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
    });
    if (!updated) throw new Error(`No subscription found for org ${orgId}`);
    return mapSubscription(updated);
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
        currentPeriodEnd: data?.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return mapSubscription(sub);
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
    return override ? toOverrideRecord(override) : null;
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
    return overrides.map(toOverrideRecord);
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
    return overrides.map(toOverrideRecord);
  }

  async createOverride(data: CreateOverrideInput): Promise<EntitlementOverrideRecord> {
    const override = await this.prisma.entitlementOverride.create({
      data: {
        scope: data.scope,
        scopeId: data.scopeId,
        featureKey: data.featureKey,
        enabled: data.enabled,
        limitValue: data.limitValue ?? null,
        configJson:
          (data.configJson as Prisma.InputJsonValue) ?? Prisma.NullableJsonNullValueInput.DbNull,
        expiresAt: data.expiresAt ?? null,
        reason: data.reason,
        organizationId: data.organizationId ?? null,
      },
    });
    return toOverrideRecord(override);
  }

  async updateOverride(
    id: string,
    data: Partial<EntitlementOverrideRecord>,
  ): Promise<EntitlementOverrideRecord> {
    const override = await this.prisma.entitlementOverride.update({
      where: { id },
      data: data as Prisma.EntitlementOverrideUpdateInput,
    });
    return toOverrideRecord(override);
  }

  async deleteOverride(id: string): Promise<void> {
    await this.prisma.entitlementOverride.delete({ where: { id } });
  }

  // ─── Usage ───

  async getCurrentUsage(orgId: string, featureKey: string): Promise<UsageTrackingRecord | null> {
    const usage = await this.prisma.usageTracking.findFirst({
      where: {
        orgId,
        featureKey,
        periodEnd: { gte: new Date() },
      },
      orderBy: { periodEnd: "desc" },
    });
    return usage ? toUsageRecord(usage) : null;
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
    return usage ? toUsageRecord(usage) : null;
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
    return toUsageRecord(usage);
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
        const updated = await this.prisma.$queryRawUnsafe<Array<{ usageCount: number }>>(
          `SELECT "usageCount" FROM "UsageTracking"
           WHERE "orgId" = $1 AND "featureKey" = $2 AND "periodEnd" > NOW()
           ORDER BY "periodEnd" DESC LIMIT 1`,
          orgId,
          featureKey,
        );

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
      await this.createUsage(orgId, featureKey, now, periodEnd);
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
