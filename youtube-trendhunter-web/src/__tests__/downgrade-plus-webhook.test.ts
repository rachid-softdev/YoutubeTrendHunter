// ============================================
// DowngradeService + Webhook Integration Tests
// ============================================
// Covers:
//   - DowngradeService.previewDowngrade
//   - DowngradeService.applyDowngradeStrategy
//   - DowngradeService.processGracefulDowngrades
//   - Webhook → DowngradeService integration
// ============================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// ─── Module-level mocks (shared across all sections) ───

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    subscription: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock("@/lib/retry", () => ({
  withRetry: async <T>(fn: () => Promise<T>, _options?: unknown) => fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  getFeatureGateService: vi.fn(),
  getDowngradeService: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// ─── Set env vars needed by stripe-config ───

process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
process.env.STRIPE_PRO_PRICE_ID = "price_pro";
process.env.STRIPE_TEAM_PRICE_ID = "price_team";

// ═══════════════════════════════════════════════
// Helper factories for mock data
// ═══════════════════════════════════════════════

import type {
  IEntitlementRepository,
  ICacheService,
  PlanRecord,
  PlanFeatureRecord,
  FeatureRecord,
  SubscriptionRecord,
  UsageTrackingRecord,
  CreateOverrideInput,
  EntitlementOverrideRecord,
  DowngradeStrategy,
  FeatureType,
} from "@/lib/feature-flags/types";
import type { FeatureGateService } from "@/lib/feature-flags";

// ─── Plan factory ───

function makePlan(overrides: Partial<PlanRecord> & { id: string; key: string }): PlanRecord {
  return {
    name: overrides.key.toUpperCase(),
    priceMonthly: 0,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ─── Feature factory ───

function makeFeature(
  id: string,
  key: string,
  type: FeatureType = "BOOLEAN",
  name?: string,
): FeatureRecord {
  return {
    id,
    key,
    name: name ?? key,
    description: null,
    type,
    defaultConfig: null,
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  };
}

// ─── PlanFeature factory ───

function makePlanFeature(overrides: Partial<PlanFeatureRecord> & { featureKey?: string }): PlanFeatureRecord {
  const feature: FeatureRecord = overrides.feature as FeatureRecord ?? makeFeature(
    `feat_${overrides.featureKey ?? "unknown"}`,
    overrides.featureKey ?? "unknown",
    "BOOLEAN",
  );
  return {
    id: `pf_${feature.key}_${Date.now()}`,
    planId: "plan_mock",
    featureId: feature.id,
    enabled: true,
    limitValue: null,
    configJson: null,
    downgradeStrategy: "IMMEDIATE" as DowngradeStrategy,
    sortOrder: 0,
    feature,
    ...overrides,
  } as PlanFeatureRecord;
}

// ─── Subscription factory ───

function makeSubscription(overrides: Partial<SubscriptionRecord> & { planKey: string }): SubscriptionRecord {
  return {
    id: "sub_mock",
    userId: "user_mock",
    orgId: "org_1",
    plan: overrides.planKey.toUpperCase(),
    status: "ACTIVE",
    stripeSubscriptionId: "sub_stripe_mock",
    stripePriceId: "price_pro",
    currentPeriodStart: new Date("2025-01-01"),
    currentPeriodEnd: new Date("2025-02-01"),
    stripeCurrentPeriodEnd: new Date("2025-02-01"),
    trialEnd: null,
    trialStart: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ─── Usage factory ───

function makeUsage(overrides: Partial<UsageTrackingRecord> & { featureKey: string }): UsageTrackingRecord {
  return {
    id: `usage_${overrides.featureKey}`,
    orgId: "org_1",
    featureKey: overrides.featureKey,
    usageCount: 42,
    periodStart: new Date("2025-01-01"),
    periodEnd: new Date("2025-02-01"),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// SECTION 1: DowngradeService Unit Tests
// ═══════════════════════════════════════════════

describe("DowngradeService", () => {
  // We import the real class (bypasses barrel mock)
  let DowngradeService: typeof import("@/lib/feature-flags/downgrade.service")["DowngradeService"];
  let mockRepo: jest.Mocked<IEntitlementRepository>;
  let mockGate: jest.Mocked<FeatureGateService>;
  let mockCache: jest.Mocked<ICacheService>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import("@/lib/feature-flags/downgrade.service");
    DowngradeService = mod.DowngradeService;

    // Build mock repository
    mockRepo = {
      getActiveSubscription: vi.fn(),
      getPlan: vi.fn(),
      getPlanFeatures: vi.fn(),
      getPlanFeature: vi.fn(),
      getCurrentUsage: vi.fn(),
      createOverride: vi.fn(),
      getAllPlans: vi.fn(),
      // Unused stubs
      getFeature: vi.fn(),
      getAllFeatures: vi.fn(),
      getActiveFeatures: vi.fn(),
      getOrganization: vi.fn(),
      updateSubscription: vi.fn(),
      createSubscription: vi.fn(),
      getOverride: vi.fn(),
      getOverridesForOrg: vi.fn(),
      getOverridesForUser: vi.fn(),
      updateOverride: vi.fn(),
      deleteOverride: vi.fn(),
      getUsageForPeriod: vi.fn(),
      createUsage: vi.fn(),
      consumeUsage: vi.fn(),
      hasStripeEventBeenProcessed: vi.fn(),
      markStripeEventProcessed: vi.fn(),
      getPlanFeaturesForPlan: vi.fn(),
      getActivePlans: vi.fn(),
    } as unknown as jest.Mocked<IEntitlementRepository>;

    // Mock gate service (needs invalidateCache)
    mockGate = {
      invalidateCache: vi.fn(),
    } as unknown as jest.Mocked<FeatureGateService>;

    // Mock cache service
    mockCache = {
      publishInvalidation: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      delPattern: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as jest.Mocked<ICacheService>;
  });

  // ============================================
  // previewDowngrade
  // ============================================

  describe("previewDowngrade", () => {
    it("returns impacted features when downgrading from PRO to FREE", async () => {
      // Arrange
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      const proFeatures = [
        makePlanFeature({ featureKey: "analytics", feature: makeFeature("f1", "analytics", "BOOLEAN"), enabled: true }),
        makePlanFeature({ featureKey: "api_access", feature: makeFeature("f2", "api_access", "BOOLEAN"), enabled: true, downgradeStrategy: "GRACEFUL" }),
        makePlanFeature({ featureKey: "seats", feature: makeFeature("f3", "seats", "LIMIT"), limitValue: 10, downgradeStrategy: "FREEZE" }),
      ];

      const freeFeatures = [
        makePlanFeature({ featureKey: "analytics", feature: makeFeature("f1", "analytics", "BOOLEAN"), enabled: true }),
        // api_access NOT in free plan → full_loss
        // seats NOT in free plan → full_loss
      ];

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) =>
        planId === "plan_pro" ? proFeatures : freeFeatures,
      );

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      // Act
      const result = await service.previewDowngrade("org_1", "free");

      // Assert
      expect(result.fromPlan).toBe("pro");
      expect(result.toPlan).toBe("free");
      expect(result.totalFeatures).toBe(3);
      expect(result.affectedCount).toBe(2); // api_access + seats

      // api_access not in free → full_loss
      expect(result.impactedFeatures.find((f) => f.featureKey === "api_access")).toMatchObject({
        impact: "full_loss",
        currentValue: true,
        newValue: null,
        strategy: "GRACEFUL",
      });

      // seats not in free → full_loss
      expect(result.impactedFeatures.find((f) => f.featureKey === "seats")).toMatchObject({
        impact: "full_loss",
        currentValue: 10,
        newValue: null,
        strategy: "FREEZE",
      });

      // analytics still in free, enabled → not impacted
      expect(result.impactedFeatures.find((f) => f.featureKey === "analytics")).toBeUndefined();
    });

    it("returns empty list when fromPlan equals toPlan (same plan)", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      mockRepo.getActiveSubscription.mockResolvedValue(sub);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "pro");

      expect(result.fromPlan).toBe("pro");
      expect(result.toPlan).toBe("pro");
      expect(result.impactedFeatures).toHaveLength(0);
      expect(result.affectedCount).toBe(0);
      expect(result.totalFeatures).toBe(0);
    });

    it("defaults to free plan when no active subscription exists", async () => {
      mockRepo.getActiveSubscription.mockResolvedValue(null);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.fromPlan).toBe("free");
      expect(result.toPlan).toBe("free");
      expect(result.impactedFeatures).toHaveLength(0);
    });

    it("throws if current plan does not exist in the database", async () => {
      const sub = makeSubscription({ planKey: "nonexistent", orgId: "org_1" });
      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockResolvedValue(null); // No plan found

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      await expect(service.previewDowngrade("org_1", "free")).rejects.toThrow(
        "Plan not found: nonexistent",
      );
    });

    it("throws if target plan does not exist in the database", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : null);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      await expect(service.previewDowngrade("org_1", "nonexistent")).rejects.toThrow(
        "Plan not found: nonexistent",
      );
    });

    it("detects full_loss when feature is not present in target plan", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) =>
        planId === "plan_pro"
          ? [makePlanFeature({ featureKey: "premium_feature", feature: makeFeature("f1", "premium_feature", "BOOLEAN"), enabled: true })]
          : [], // free plan has no features
      );

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.impactedFeatures).toHaveLength(1);
      expect(result.impactedFeatures[0]).toMatchObject({
        featureKey: "premium_feature",
        impact: "full_loss",
        currentValue: true,
        newValue: null,
      });
    });

    it("detects full_loss when feature is disabled in target plan", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "analytics", "BOOLEAN");
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "analytics", feature, enabled: true })];
        }
        return [makePlanFeature({ featureKey: "analytics", feature, enabled: false })]; // disabled in free
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.impactedFeatures).toHaveLength(1);
      expect(result.impactedFeatures[0]).toMatchObject({
        featureKey: "analytics",
        impact: "full_loss",
        currentValue: true,
        newValue: false,
      });
    });

    it("detects limited when limit reduces from null (unlimited) to 500", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "seats", "LIMIT");
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "seats", feature, limitValue: null, enabled: true })]; // unlimited
        }
        return [makePlanFeature({ featureKey: "seats", feature, limitValue: 500, enabled: true })]; // limited to 500
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.impactedFeatures).toHaveLength(1);
      expect(result.impactedFeatures[0]).toMatchObject({
        featureKey: "seats",
        impact: "limited",
        currentValue: null,
        newValue: 500,
      });
    });

    it("detects limited when limit reduces from 1000 to 100", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "seats", "LIMIT");
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "seats", feature, limitValue: 1000, enabled: true })];
        }
        return [makePlanFeature({ featureKey: "seats", feature, limitValue: 100, enabled: true })];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.impactedFeatures).toHaveLength(1);
      expect(result.impactedFeatures[0]).toMatchObject({
        featureKey: "seats",
        impact: "limited",
        currentValue: 1000,
        newValue: 100,
      });
    });

    it("does not include feature when limit stays the same (no impact)", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "seats", "LIMIT");
        return [
          makePlanFeature({ featureKey: "seats", feature, limitValue: 100, enabled: true }),
        ];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      // Same limit → not impacted
      expect(result.impactedFeatures).toHaveLength(0);
    });

    it("does not include feature when target limit is larger (not a reduction)", async () => {
      const sub = makeSubscription({ planKey: "starter", orgId: "org_1" });
      const starterPlan = makePlan({ id: "plan_starter", key: "starter" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "starter" ? starterPlan : proPlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "seats", "LIMIT");
        if (planId === "plan_starter") {
          return [makePlanFeature({ featureKey: "seats", feature, limitValue: 5, enabled: true })];
        }
        return [makePlanFeature({ featureKey: "seats", feature, limitValue: 100, enabled: true })];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "pro");

      // 5 → 100 is an increase, not a reduction
      expect(result.impactedFeatures).toHaveLength(0);
    });

    it("handles ORG override existing before downgrade (override doesn't affect preview)", async () => {
      // The override only affects the gate service, not the plan comparison in previewDowngrade
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const feature = makeFeature("f1", "analytics", "BOOLEAN");
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "analytics", feature, enabled: true })];
        }
        return [makePlanFeature({ featureKey: "analytics", feature, enabled: false })];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      // Even if there is an override (mockRepo.getOverride), preview only compares plan features
      expect(result.impactedFeatures).toHaveLength(1);
      expect(result.impactedFeatures[0].impact).toBe("full_loss");
    });

    it("handles multiple features with different downgrade strategies", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      const analyticsFeature = makeFeature("f1", "analytics", "BOOLEAN");
      const apiFeature = makeFeature("f2", "api_access", "BOOLEAN");
      const storageFeature = makeFeature("f3", "storage", "LIMIT");
      const seatsFeature = makeFeature("f4", "seats", "LIMIT");

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [
            makePlanFeature({ featureKey: "analytics", feature: analyticsFeature, enabled: true, downgradeStrategy: "IMMEDIATE" }),
            makePlanFeature({ featureKey: "api_access", feature: apiFeature, enabled: true, downgradeStrategy: "GRACEFUL" }),
            makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 1000, downgradeStrategy: "FREEZE" }),
            makePlanFeature({ featureKey: "seats", feature: seatsFeature, limitValue: 50, downgradeStrategy: "IMMEDIATE" }),
          ];
        }
        return [
          makePlanFeature({ featureKey: "analytics", feature: analyticsFeature, enabled: true, downgradeStrategy: "IMMEDIATE" }),
          // api_access missing → full_loss GRACEFUL
          // storage → limited to 100 FREEZE
          // seats missing → full_loss IMMEDIATE
          makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 100, downgradeStrategy: "FREEZE" }),
        ];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      expect(result.affectedCount).toBe(3);

      expect(result.impactedFeatures.find((f) => f.featureKey === "api_access")).toMatchObject({
        impact: "full_loss",
        strategy: "GRACEFUL",
      });
      expect(result.impactedFeatures.find((f) => f.featureKey === "storage")).toMatchObject({
        impact: "limited",
        strategy: "FREEZE",
        currentValue: 1000,
        newValue: 100,
      });
      expect(result.impactedFeatures.find((f) => f.featureKey === "seats")).toMatchObject({
        impact: "full_loss",
        strategy: "IMMEDIATE",
      });
      // analytics still enabled → not impacted
      expect(result.impactedFeatures.find((f) => f.featureKey === "analytics")).toBeUndefined();
    });

    it("handles EXPERIMENT type features without crashing", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        const experimentFeature = makeFeature("f1", "new_dashboard", "EXPERIMENT");
        if (planId === "plan_pro") {
          return [
            makePlanFeature({ featureKey: "new_dashboard", feature: experimentFeature, enabled: true, downgradeStrategy: "IMMEDIATE" }),
            makePlanFeature({ featureKey: "analytics", feature: makeFeature("f2", "analytics", "BOOLEAN"), enabled: true }),
          ];
        }
        return [
          // new_dashboard NOT in free → full_loss
          makePlanFeature({ featureKey: "analytics", feature: makeFeature("f2", "analytics", "BOOLEAN"), enabled: false }),
        ];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      // Should not crash, should produce valid impact
      expect(result.impactedFeatures).toHaveLength(2); // new_dashboard lost + analytics disabled
      const expImpact = result.impactedFeatures.find((f) => f.featureKey === "new_dashboard");
      expect(expImpact).toMatchObject({
        impact: "full_loss",
        featureType: "EXPERIMENT",
      });
    });

    it("handles feature with null/undefined feature object gracefully", async () => {
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [
            // Feature with null feature object
            { id: "pf_orphan", planId: "plan_pro", featureId: "f_orphan", enabled: true, limitValue: null, configJson: null, downgradeStrategy: "IMMEDIATE", sortOrder: 0, feature: null },
          ] as PlanFeatureRecord[];
        }
        return [];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "free");

      // Orphan feature has no featureKey → skipped
      expect(result.impactedFeatures).toHaveLength(0);
      // But still counted in totalFeatures
      expect(result.totalFeatures).toBe(1);
    });

    it("returns impacted features even when target plan has more features than current", async () => {
      // Current: pro, Target: enterprise (which has MORE features)
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1" });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const entPlan = makePlan({ id: "plan_ent", key: "enterprise" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : entPlan);

      const storageFeature = makeFeature("f1", "storage", "LIMIT");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [
            makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 100, enabled: true }),
          ];
        }
        // Enterprise has storage + extra features
        return [
          makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 500, enabled: true }),
          makePlanFeature({ featureKey: "analytics", feature: makeFeature("f2", "analytics", "BOOLEAN"), enabled: true }),
        ];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const result = await service.previewDowngrade("org_1", "enterprise");

      // Not really a downgrade (going from pro to enterprise), but it still works
      expect(result.fromPlan).toBe("pro");
      expect(result.toPlan).toBe("enterprise");
      // storage limit increases 100 → 500, so no impact
      expect(result.impactedFeatures).toHaveLength(0);
    });
  });

  // ============================================
  // applyDowngradeStrategy
  // ============================================

  describe("applyDowngradeStrategy", () => {
    const NOW = Math.floor(Date.now() / 1000);
    const PERIOD_END = NOW + 30 * 24 * 60 * 60; // 30 days

    beforeEach(() => {
      // Common setup for applyDowngradeStrategy tests:
      // The subscription currently has the OLD plan (pro) in DB
      const sub = makeSubscription({ planKey: "pro", orgId: "org_1", currentPeriodEnd: new Date(PERIOD_END * 1000) });
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });

      mockRepo.getActiveSubscription.mockResolvedValue(sub);
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
    });

    it("GRACEFUL strategy logs and returns impact", async () => {
      const graceFeature = makeFeature("f1", "api_access", "BOOLEAN");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "api_access", feature: graceFeature, enabled: true, downgradeStrategy: "GRACEFUL" })];
        }
        return [];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        featureKey: "api_access",
        strategy: "GRACEFUL",
        impact: "full_loss",
      });

      // Should log a graceful downgrade notice
      const { log } = await import("@/lib/logger");
      expect(log).toHaveBeenCalledWith("info", "[Downgrade] Graceful downgrade scheduled", expect.objectContaining({
        orgId: "org_1",
        feature: "api_access",
      }));

      // Cache should be invalidated
      expect(mockCache.publishInvalidation).toHaveBeenCalledWith("org_1");
    });

    it("IMMEDIATE strategy returns impact", async () => {
      const immediateFeature = makeFeature("f1", "analytics", "BOOLEAN");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "analytics", feature: immediateFeature, enabled: true, downgradeStrategy: "IMMEDIATE" })];
        }
        return [];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      expect(results).toHaveLength(1);
      expect(results[0].strategy).toBe("IMMEDIATE");
      expect(mockCache.publishInvalidation).toHaveBeenCalledWith("org_1");
    });

    it("FREEZE strategy creates override at current usage level", async () => {
      const storageFeature = makeFeature("f1", "storage", "LIMIT");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 1000, enabled: true, downgradeStrategy: "FREEZE" })];
        }
        // LIMIT reduction path uses targetPf.downgradeStrategy (line 97)
        return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 100, enabled: true, downgradeStrategy: "FREEZE" })];
      });

      // Current usage is 350
      mockRepo.getCurrentUsage.mockResolvedValue(makeUsage({ featureKey: "storage", usageCount: 350 }));

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      expect(results).toHaveLength(1);
      expect(results[0].strategy).toBe("FREEZE");

      // Should create an override at current usage
      expect(mockRepo.createOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "ORG",
          scopeId: "org_1",
          featureKey: "storage",
          enabled: true,
          limitValue: 350,
          organizationId: "org_1",
        }),
      );
      expect(mockCache.publishInvalidation).toHaveBeenCalledWith("org_1");
    });

    it("FREEZE strategy with no usage yet (usageCount=0)", async () => {
      const storageFeature = makeFeature("f1", "storage", "LIMIT");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 1000, enabled: true, downgradeStrategy: "FREEZE" })];
        }
        // LIMIT reduction uses targetPf.downgradeStrategy (line 97)
        return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 100, enabled: true, downgradeStrategy: "FREEZE" })];
      });

      // No usage record exists
      mockRepo.getCurrentUsage.mockResolvedValue(null);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      expect(results).toHaveLength(1);

      // Override created with limit 0 (no usage)
      expect(mockRepo.createOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "ORG",
          scopeId: "org_1",
          featureKey: "storage",
          limitValue: 0,
        }),
      );
    });

    it("FREEZE strategy after previous freeze override creates new override (overwrite)", async () => {
      const storageFeature = makeFeature("f1", "storage", "LIMIT");
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 1000, enabled: true, downgradeStrategy: "FREEZE" })];
        }
        // LIMIT reduction uses targetPf.downgradeStrategy (line 97)
        return [makePlanFeature({ featureKey: "storage", feature: storageFeature, limitValue: 100, enabled: true, downgradeStrategy: "FREEZE" })];
      });

      // Usage has grown to 500
      mockRepo.getCurrentUsage.mockResolvedValue(makeUsage({ featureKey: "storage", usageCount: 500 }));

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      await service.applyDowngradeStrategy("org_1", "pro", "free");

      // Create a new override each time (no update check)
      expect(mockRepo.createOverride).toHaveBeenCalledTimes(1);
      expect(mockRepo.createOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          featureKey: "storage",
          limitValue: 500,
          reason: expect.stringContaining("500"),
        }),
      );
    });

    it("multiple features with mixed strategies all applied", async () => {
      const aFeature = makeFeature("f1", "feature_a", "BOOLEAN");
      const bFeature = makeFeature("f2", "feature_b", "LIMIT");
      const cFeature = makeFeature("f3", "feature_c", "BOOLEAN");

      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_pro") {
          return [
            makePlanFeature({ featureKey: "feature_a", feature: aFeature, enabled: true, downgradeStrategy: "IMMEDIATE" }),
            makePlanFeature({ featureKey: "feature_b", feature: bFeature, limitValue: 500, enabled: true, downgradeStrategy: "FREEZE" }),
            makePlanFeature({ featureKey: "feature_c", feature: cFeature, enabled: true, downgradeStrategy: "GRACEFUL" }),
          ];
        }
        return [
          // feature_b still in free but at limit 50 — LIMIT reduction uses targetPf.downgradeStrategy
          makePlanFeature({ featureKey: "feature_b", feature: bFeature, limitValue: 50, enabled: true, downgradeStrategy: "FREEZE" }),
        ];
      });

      mockRepo.getCurrentUsage.mockResolvedValue(makeUsage({ featureKey: "feature_b", usageCount: 30 }));

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      // feature_a → full_loss IMMEDIATE
      // feature_b → limited FREEZE (1000→50)
      // feature_c → full_loss GRACEFUL
      expect(results).toHaveLength(3);

      const strategies = results.map((r) => r.strategy);
      expect(strategies).toContain("IMMEDIATE");
      expect(strategies).toContain("FREEZE");
      expect(strategies).toContain("GRACEFUL");

      // Only feature_b calls createOverride (FREEZE)
      expect(mockRepo.createOverride).toHaveBeenCalledTimes(1);
      expect(mockRepo.createOverride).toHaveBeenCalledWith(
        expect.objectContaining({ featureKey: "feature_b" }),
      );

      // Cache invalidated once at the end
      expect(mockCache.publishInvalidation).toHaveBeenCalledTimes(1);
    });

    it("already at target plan → no-op (empty impactedFeatures)", async () => {
      // Subscription is on "free" already
      mockRepo.getActiveSubscription.mockResolvedValue(makeSubscription({ planKey: "free", orgId: "org_1" }));
      mockRepo.getPlan.mockImplementation(async (key: string) =>
        makePlan({ id: `plan_${key}`, key }),
      );
      mockRepo.getPlanFeatures.mockResolvedValue([]);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "free", "free");

      expect(results).toHaveLength(0);
      // No cache invalidation since no impacted features... wait, the code invalidates cache
      // regardless at line 162. Let's verify:
      expect(mockCache.publishInvalidation).toHaveBeenCalledWith("org_1");
    });

    it("invalidates cache even when no features are impacted", async () => {
      mockRepo.getActiveSubscription.mockResolvedValue(makeSubscription({ planKey: "pro", orgId: "org_1" }));
      const proPlan = makePlan({ id: "plan_pro", key: "pro" });
      const freePlan = makePlan({ id: "plan_free", key: "free" });
      mockRepo.getPlan.mockImplementation(async (key: string) => key === "pro" ? proPlan : freePlan);
      // Same features in both plans → no impact
      const feature = makeFeature("f1", "analytics", "BOOLEAN");
      mockRepo.getPlanFeatures.mockResolvedValue([
        makePlanFeature({ featureKey: "analytics", feature, enabled: true }),
      ]);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const results = await service.applyDowngradeStrategy("org_1", "pro", "free");

      expect(results).toHaveLength(0);
      // Cache still invalidated
      expect(mockCache.publishInvalidation).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // processGracefulDowngrades
  // ============================================

  describe("processGracefulDowngrades", () => {
    it("returns count of affected features", async () => {
      const planA = makePlan({ id: "plan_a", key: "plan_a" });
      mockRepo.getAllPlans.mockResolvedValue([planA]);
      mockRepo.getPlanFeatures.mockResolvedValue([
        makePlanFeature({ featureKey: "feature_grace", feature: makeFeature("f1", "feature_grace", "BOOLEAN"), enabled: false, downgradeStrategy: "GRACEFUL" }),
        makePlanFeature({ featureKey: "feature_imm", feature: makeFeature("f2", "feature_imm", "BOOLEAN"), enabled: false, downgradeStrategy: "IMMEDIATE" }),
      ]);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const count = await service.processGracefulDowngrades();

      // Only count GRACEFUL + disabled
      expect(count).toBe(1);
    });

    it("handles empty DB (no plans)", async () => {
      mockRepo.getAllPlans.mockResolvedValue([]);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const count = await service.processGracefulDowngrades();

      expect(count).toBe(0);
    });

    it("handles multiple plans with graceful features", async () => {
      const planA = makePlan({ id: "plan_a", key: "plan_a" });
      const planB = makePlan({ id: "plan_b", key: "plan_b" });
      mockRepo.getAllPlans.mockResolvedValue([planA, planB]);
      mockRepo.getPlanFeatures.mockImplementation(async (planId: string) => {
        if (planId === "plan_a") {
          return [
            makePlanFeature({ featureKey: "f1", feature: makeFeature("f1", "f1", "BOOLEAN"), enabled: false, downgradeStrategy: "GRACEFUL" }),
          ];
        }
        // plan_b
        return [
          makePlanFeature({ featureKey: "f2", feature: makeFeature("f2", "f2", "BOOLEAN"), enabled: false, downgradeStrategy: "GRACEFUL" }),
          makePlanFeature({ featureKey: "f3", feature: makeFeature("f3", "f3", "BOOLEAN"), enabled: false, downgradeStrategy: "GRACEFUL" }),
        ];
      });

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const count = await service.processGracefulDowngrades();

      expect(count).toBe(3);
    });

    it("skips plans with no graceful features", async () => {
      const planA = makePlan({ id: "plan_a", key: "plan_a" });
      mockRepo.getAllPlans.mockResolvedValue([planA]);
      mockRepo.getPlanFeatures.mockResolvedValue([
        // Only non-graceful, disabled
        makePlanFeature({ featureKey: "f1", feature: makeFeature("f1", "f1", "BOOLEAN"), enabled: false, downgradeStrategy: "IMMEDIATE" }),
        // Graceful but enabled → not counted
        makePlanFeature({ featureKey: "f2", feature: makeFeature("f2", "f2", "BOOLEAN"), enabled: true, downgradeStrategy: "GRACEFUL" }),
      ]);

      const service = new DowngradeService(mockRepo, mockGate, mockCache);

      const count = await service.processGracefulDowngrades();

      expect(count).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════
// SECTION 2: Webhook → DowngradeService Integration
// ═══════════════════════════════════════════════

const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 24 * 60 * 60; // 30 days from now

function createEvent(
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): Stripe.Event {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: { object: data },
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    api_version: "2026-04-22",
    request: null,
  } as unknown as Stripe.Event;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSubscription(overrides: any = {}): Stripe.Subscription {
  return {
    id: "sub_mock_123",
    object: "subscription",
    metadata: {} as Stripe.Metadata,
    items: { data: [{ price: { id: "price_pro" } }] },
    status: "active",
    current_period_end: PERIOD_END,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInvoice(overrides: any = {}): Stripe.Invoice {
  return {
    id: "in_mock_123",
    object: "invoice",
    subscription: "sub_mock_123",
    ...overrides,
  } as unknown as Stripe.Invoice;
}

describe("Webhook → DowngradeService integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getFeatureGate: any;
  let getDowngrade: any;
  let mockGate: { invalidateCache: ReturnType<typeof vi.fn> };
  let mockDowngradeService: { applyDowngradeStrategy: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import("@/lib/prisma");
    prisma = prismaModule.prisma;
    const ffModule = await import("@/lib/feature-flags");
    getFeatureGate = ffModule.getFeatureGateService;
    getDowngrade = ffModule.getDowngradeService;

    // Default: no user found
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    // Default: current subscription exists on "pro"
    prisma.subscription.findFirst.mockResolvedValue({ planKey: "pro" });
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.update.mockResolvedValue({});

    // Default: stripe retrieve returns a subscription
    const stripeModule = await import("@/lib/stripe");
    stripeModule.stripe.subscriptions.retrieve.mockResolvedValue(
      createSubscription({ metadata: { orgId: "org_1" } }),
    );

    // Feature gate mock
    mockGate = { invalidateCache: vi.fn().mockResolvedValue(undefined) };
    getFeatureGate.mockReturnValue(mockGate);

    // Downgrade service mock
    mockDowngradeService = { applyDowngradeStrategy: vi.fn().mockResolvedValue([]) };
    getDowngrade.mockReturnValue(mockDowngradeService);
  });

  // ============================================
  // customer.subscription.updated
  // ============================================

  describe("customer.subscription.updated", () => {
    it("detects plan change and calls applyDowngradeStrategy", async () => {
      // Current subscription is on "pro", new subscription is "free"
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        items: { data: [{ price: { id: "price_team" } }] }, // price_team maps to a different plan
        status: "active",
      });
      const event = createEvent("customer.subscription.updated", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });

      // It should call applyDowngradeStrategy because plan changed (pro → different)
      expect(mockDowngradeService.applyDowngradeStrategy).toHaveBeenCalledWith(
        "org_1",
        "pro",
        expect.any(String),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("does NOT call applyDowngradeStrategy when plan is the same", async () => {
      // Current subscription already on "pro" and new subscription is also "pro"
      prisma.subscription.findFirst.mockResolvedValue({ planKey: "pro" });

      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        items: { data: [{ price: { id: "price_pro" } }] }, // same price → same plan
        status: "active",
      });
      const event = createEvent("customer.subscription.updated", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("skips downgrade when oldPlanKey is null (no existing subscription)", async () => {
      // No existing subscription found in DB
      prisma.subscription.findFirst.mockResolvedValue(null);

      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        status: "active",
      });
      const event = createEvent("customer.subscription.updated", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });
      // oldPlanKey is null → condition fails
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("skips downgrade when only userId is present (no orgId)", async () => {
      const sub = createSubscription({
        metadata: { userId: "user_1" },
        status: "active",
      });
      const event = createEvent("customer.subscription.updated", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });
      // No orgId → no downgrade call
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      // No orgId → no cache invalidation
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // customer.subscription.deleted
  // ============================================

  describe("customer.subscription.deleted", () => {
    it("calls applyDowngradeStrategy with target='free'", async () => {
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
      });
      const event = createEvent("customer.subscription.deleted", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.deleted");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.deleted" });

      // Should call downgrade with target "free"
      expect(mockDowngradeService.applyDowngradeStrategy).toHaveBeenCalledWith(
        "org_1",
        "pro",
        "free",
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("does NOT call applyDowngradeStrategy when already on 'free'", async () => {
      // Current subscription is already on "free"
      prisma.subscription.findFirst.mockResolvedValue({ planKey: "free" });

      const sub = createSubscription({
        metadata: { orgId: "org_1" },
      });
      const event = createEvent("customer.subscription.deleted", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.deleted");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.deleted" });
      // Condition: oldPlanKey !== "free" → false for free
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("does NOT call downgrade when no existing subscription (oldPlanKey=null)", async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      const sub = createSubscription({
        metadata: { orgId: "org_1" },
      });
      const event = createEvent("customer.subscription.deleted", sub as unknown as Record<string, unknown>);

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.deleted");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.deleted" });
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // customer.subscription.created
  // ============================================

  describe("customer.subscription.created does NOT call downgrade", () => {
    it("does not call applyDowngradeStrategy on new subscription creation", async () => {
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        status: "active",
      });
      const event = createEvent("customer.subscription.created", sub as unknown as Record<string, unknown>);

      prisma.user.findFirst.mockResolvedValue({ id: "user_in_org" });

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.created");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.created" });
      // Created is a new subscription, no previous plan to downgrade from
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // invoice.payment_succeeded
  // ============================================

  describe("invoice.payment_succeeded does NOT call downgrade", () => {
    it("does not call applyDowngradeStrategy on payment success", async () => {
      const invoice = createInvoice({ subscription: "sub_mock_123" });
      const event = createEvent("invoice.payment_succeeded", invoice as unknown as Record<string, unknown>);

      const stripeModule = await import("@/lib/stripe");
      stripeModule.stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({ metadata: { orgId: "org_1" }, status: "active" }),
      );

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("invoice.payment_succeeded");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "invoice.payment_succeeded" });
      // Payment success is just a renewal, not a plan change
      expect(mockDowngradeService.applyDowngradeStrategy).not.toHaveBeenCalled();
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // Error handling
  // ============================================

  describe("error handling during downgrade", () => {
    it("catches downgrade error and still invalidates cache (BUG FIXED)", async () => {
      // Set up subscription.updated event
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        items: { data: [{ price: { id: "price_team" } }] },
        status: "active",
      });
      const event = createEvent("customer.subscription.updated", sub as unknown as Record<string, unknown>);

      // Downgrade throws
      mockDowngradeService.applyDowngradeStrategy.mockRejectedValue(
        new Error("Downgrade internal failure"),
      );

      const { getWebhookHandler } = await import(
        "@/lib/payment/stripe-webhook-handler"
      );
      const handler = getWebhookHandler("customer.subscription.updated");

      // FIXED: Error is caught by try-catch, handler completes normally
      const result = await handler!(event);
      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });

      // FIXED: Cache invalidation always runs even when downgrade fails
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });
});
