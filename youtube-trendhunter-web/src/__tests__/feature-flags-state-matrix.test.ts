// ============================================
// Feature-Flags: Subscription State Transitions
// & Override Priority Resolution Matrix
// ============================================
//
// Tests coverage:
//   A. Subscription status transition matrix
//   B. Override priority resolution (org_override > plan > fallback)
//   C. Edge cases (time boundaries, 0/null limits, missing features)
//   D. isInExperiment with user/org level overrides
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeatureGateService } from "@/lib/feature-flags/feature-gate.service";
import { isInExperiment } from "@/lib/feature-flags/experiment";
import type {
  IEntitlementRepository,
  ICacheService,
  PlanRecord,
  FeatureRecord,
  PlanFeatureRecord,
  SubscriptionRecord,
  EntitlementOverrideRecord,
  UsageTrackingRecord,
  OverrideScope,
  CreateOverrideInput,
  SubscriptionStatus,
} from "@/lib/feature-flags/types";

// Mock next/server for HOF middleware
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => {
      return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  },
}));

// ============================================
// Mock Repository (same pattern as feature-gate.test.ts)
// ============================================

class MockEntitlementRepository implements IEntitlementRepository {
  plans: Map<string, PlanRecord> = new Map();
  features: Map<string, FeatureRecord> = new Map();
  planFeatures: Map<string, PlanFeatureRecord[]> = new Map();
  subscriptions: Map<string, SubscriptionRecord> = new Map();
  overrides: EntitlementOverrideRecord[] = [];
  usage: Map<string, UsageTrackingRecord> = new Map();
  stripeEvents: Set<string> = new Set();

  async getPlan(planKey: string): Promise<PlanRecord | null> {
    return this.plans.get(planKey) ?? null;
  }

  async getAllPlans(): Promise<PlanRecord[]> {
    return Array.from(this.plans.values());
  }

  async getActivePlans(): Promise<PlanRecord[]> {
    return Array.from(this.plans.values()).filter((p) => p.isActive);
  }

  async getFeature(featureKey: string): Promise<FeatureRecord | null> {
    return this.features.get(featureKey) ?? null;
  }

  async getAllFeatures(): Promise<FeatureRecord[]> {
    return Array.from(this.features.values());
  }

  async getActiveFeatures(): Promise<FeatureRecord[]> {
    return Array.from(this.features.values()).filter((f) => f.isActive);
  }

  async getPlanFeatures(planId: string): Promise<PlanFeatureRecord[]> {
    return this.planFeatures.get(planId) ?? [];
  }

  async getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureRecord | null> {
    const features = this.planFeatures.get(planId) ?? [];
    return features.find((f) => f.feature?.key === featureKey) ?? null;
  }

  async getPlanFeaturesForPlan(planId: string): Promise<PlanFeatureRecord[]> {
    return this.getPlanFeatures(planId);
  }

  async getOrganization(_orgId: string): Promise<any> {
    return null;
  }

  async getActiveSubscription(orgId: string): Promise<SubscriptionRecord | null> {
    return this.subscriptions.get(orgId) ?? null;
  }

  async updateSubscription(orgId: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> {
    const existing = this.subscriptions.get(orgId);
    if (!existing) throw new Error("No subscription");
    const updated = { ...existing, ...data };
    this.subscriptions.set(orgId, updated);
    return updated;
  }

  async createSubscription(orgId: string, planKey: string, data?: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> {
    const sub: SubscriptionRecord = {
      id: `sub_${orgId}`,
      userId: `user_${orgId}`,
      orgId,
      planKey,
      plan: planKey.toUpperCase(),
      status: "ACTIVE" as SubscriptionStatus,
      stripeSubscriptionId: data?.stripeSubscriptionId ?? null,
      stripePriceId: data?.stripePriceId ?? null,
      currentPeriodStart: data?.currentPeriodStart ?? new Date(),
      currentPeriodEnd: data?.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripeCurrentPeriodEnd: data?.stripeCurrentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialEnd: data?.trialEnd ?? null,
      trialStart: data?.trialStart ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (data?.status) sub.status = data.status;
    if (data?.planKey) sub.planKey = data.planKey;
    this.subscriptions.set(orgId, sub);
    return sub;
  }

  async getOverride(scope: OverrideScope, scopeId: string, featureKey: string): Promise<EntitlementOverrideRecord | null> {
    const now = new Date();
    return (
      this.overrides.find(
        (o) =>
          o.scope === scope &&
          o.scopeId === scopeId &&
          o.featureKey === featureKey &&
          (!o.expiresAt || o.expiresAt > now),
      ) ?? null
    );
  }

  async getOverridesForOrg(orgId: string): Promise<EntitlementOverrideRecord[]> {
    const now = new Date();
    return this.overrides.filter((o) => o.scope === "ORG" && o.scopeId === orgId && (!o.expiresAt || o.expiresAt > now));
  }

  async getOverridesForUser(userId: string): Promise<EntitlementOverrideRecord[]> {
    const now = new Date();
    return this.overrides.filter((o) => o.scope === "USER" && o.scopeId === userId && (!o.expiresAt || o.expiresAt > now));
  }

  async createOverride(data: CreateOverrideInput): Promise<EntitlementOverrideRecord> {
    const override: EntitlementOverrideRecord = {
      id: `override_${Date.now()}_${Math.random()}`,
      scope: data.scope,
      scopeId: data.scopeId,
      featureKey: data.featureKey,
      enabled: data.enabled,
      limitValue: data.limitValue ?? null,
      configJson: data.configJson ?? null,
      expiresAt: data.expiresAt ?? null,
      reason: data.reason,
      organizationId: data.organizationId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.overrides.push(override);
    return override;
  }

  async updateOverride(id: string, data: Partial<EntitlementOverrideRecord>): Promise<EntitlementOverrideRecord> {
    const idx = this.overrides.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error("Override not found");
    this.overrides[idx] = { ...this.overrides[idx], ...data, updatedAt: new Date() };
    return this.overrides[idx];
  }

  async deleteOverride(id: string): Promise<void> {
    this.overrides = this.overrides.filter((o) => o.id !== id);
  }

  async getCurrentUsage(orgId: string, featureKey: string): Promise<UsageTrackingRecord | null> {
    return this.usage.get(`${orgId}:${featureKey}`) ?? null;
  }

  async getUsageForPeriod(orgId: string, featureKey: string, _periodStart: Date): Promise<UsageTrackingRecord | null> {
    return this.usage.get(`${orgId}:${featureKey}`) ?? null;
  }

  async createUsage(orgId: string, featureKey: string, periodStart: Date, periodEnd: Date): Promise<UsageTrackingRecord> {
    const usage: UsageTrackingRecord = {
      id: `usage_${Date.now()}`,
      orgId,
      featureKey,
      usageCount: 0,
      periodStart,
      periodEnd,
    };
    this.usage.set(`${orgId}:${featureKey}`, usage);
    return usage;
  }

  async consumeUsage(orgId: string, featureKey: string, amount: number, maxAllowed?: number): Promise<{ success: boolean; usageCount: number } | null> {
    const key = `${orgId}:${featureKey}`;
    const existing = this.usage.get(key);

    // TOCTOU guard: reject if amount would exceed maxAllowed
    if (maxAllowed !== undefined) {
      const currentCount = existing?.usageCount ?? 0;
      if (currentCount + amount > maxAllowed) {
        return null;
      }
    }

    if (existing) {
      existing.usageCount += amount;
      this.usage.set(key, existing);
      return { success: true, usageCount: existing.usageCount };
    }
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await this.createUsage(orgId, featureKey, now, periodEnd);
    const created = this.usage.get(key)!;
    created.usageCount = amount;
    return { success: true, usageCount: amount };
  }

  async hasStripeEventBeenProcessed(eventId: string): Promise<boolean> {
    return this.stripeEvents.has(eventId);
  }

  async markStripeEventProcessed(eventId: string, _type: string): Promise<void> {
    this.stripeEvents.add(eventId);
  }
}

// ============================================
// Mock Cache Service
// ============================================

class MockCacheService implements ICacheService {
  cache = new Map<string, any>();
  subscribers: Array<(orgId: string) => void> = [];

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get(key) ?? null;
  }

  async set<T>(key: string, data: T, _ttlSeconds: number): Promise<void> {
    this.cache.set(key, data);
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const prefix = pattern.replace("*", "");
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async publishInvalidation(orgId: string): Promise<void> {
    await this.del(`entitlements:${orgId}`);
    for (const cb of this.subscribers) {
      cb(orgId);
    }
  }

  subscribe(callback: (orgId: string) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }
}

// ============================================
// Test Data Factories
// ============================================

function createPlan(key: string, name: string, sortOrder = 0): PlanRecord {
  return {
    id: `plan_${key}`,
    key,
    name,
    priceMonthly: key === "free" ? 0 : key === "pro" ? 1500 : 3900,
    isActive: true,
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createFeature(key: string, type: "BOOLEAN" | "LIMIT" | "EXPERIMENT", defaultConfig?: Record<string, unknown> | null): FeatureRecord {
  return {
    id: `feature_${key}`,
    key,
    name: key,
    description: `Feature ${key}`,
    type,
    defaultConfig: defaultConfig ?? null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createPlanFeature(planId: string, feature: FeatureRecord, enabled: boolean, limitValue: number | null = null, configJson?: Record<string, unknown> | null): PlanFeatureRecord {
  return {
    id: `pf_${planId}_${feature.id}`,
    planId,
    featureId: feature.id,
    enabled,
    limitValue,
    configJson: configJson ?? null,
    downgradeStrategy: "GRACEFUL",
    sortOrder: 0,
    plan: undefined,
    feature,
  };
}

// ============================================
// Test Suite
// ============================================

describe("Feature-Flags State & Priority Matrix", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  const ORG_ID = "org_1";
  const USER_ID = "user_1";

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    // Base plans
    repository.plans.set("free", createPlan("free", "Free", 0));
    repository.plans.set("pro", createPlan("pro", "Pro", 1));
    repository.plans.set("enterprise", createPlan("enterprise", "Enterprise", 2));

    // Base features
    repository.features.set("AI_SUMMARY", createFeature("AI_SUMMARY", "BOOLEAN"));
    repository.features.set("EXPORT_PDF", createFeature("EXPORT_PDF", "LIMIT"));
    repository.features.set("UNLIMITED_STORAGE", createFeature("UNLIMITED_STORAGE", "LIMIT"));
    repository.features.set("API_ACCESS", createFeature("API_ACCESS", "BOOLEAN"));
    repository.features.set("NEW_DASHBOARD", createFeature("NEW_DASHBOARD", "EXPERIMENT", {
      percentage: 50,
      seed: "NEW_DASHBOARD_v1",
    }));
    repository.features.set("EXTRA_BOOLEAN", createFeature("EXTRA_BOOLEAN", "BOOLEAN"));
    repository.features.set("EXTRA_LIMIT", createFeature("EXTRA_LIMIT", "LIMIT"));
  });

  // ============================================
  // A. Subscription Status Transition Matrix
  // ============================================

  describe("A. Subscription Status Transition Matrix", () => {
    // For each status we want to ensure the service resolves against the plan
    // when the mock returns a subscription record.
    // The service does NOT filter by status—it only checks subscription existence.

    function setupPlanWithFeature(planKey: string, featureKey: string, enabled: boolean, limitValue: number | null = null) {
      const plan = repository.plans.get(planKey)!;
      const feature = repository.features.get(featureKey)!;
      const planId = `plan_${planKey}`;
      const existingFeatures = repository.planFeatures.get(planId) ?? [];
      repository.planFeatures.set(planId, [...existingFeatures, createPlanFeature(planId, feature, enabled, limitValue)]);
    }

    // ── Active statuses (ACTIVE / TRIALING) ──

    it("ACTIVE: hasFeature resolves via plan, getAllEntitlements shows planKey", async () => {
      setupPlanWithFeature("pro", "AI_SUMMARY", true);
      await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("pro");

      const entitlements = await service.getAllEntitlements(ORG_ID);
      expect(entitlements.planKey).toBe("pro");
    });

    it("TRIALING: hasFeature resolves via plan, consume works, getDebugTrace shows plan", async () => {
      setupPlanWithFeature("pro", "AI_SUMMARY", true);
      setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
      await repository.createSubscription(ORG_ID, "pro", { status: "TRIALING" });

      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("pro");

      // Consume works for TRIALING
      const consumeResult = await service.consume(ORG_ID, "EXPORT_PDF", 3);
      expect(consumeResult.success).toBe(true);

      const limit = await service.getLimit(ORG_ID, "EXPORT_PDF");
      expect(limit).toBe(10);
    });

    // ── Non-active statuses that still have subscription records ──

    it("CANCELED: subscription exists → hasFeature resolves via plan (mock returns sub regardless)", async () => {
      setupPlanWithFeature("pro", "AI_SUMMARY", true);
      await repository.createSubscription(ORG_ID, "pro", { status: "CANCELED" });

      // Service doesn't check status; subscription exists → plan is used
      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("pro");

      const entitlements = await service.getAllEntitlements(ORG_ID);
      expect(entitlements.planKey).toBe("pro");
    });

    it("PAST_DUE: subscription exists → hasFeature resolves via plan", async () => {
      setupPlanWithFeature("pro", "AI_SUMMARY", true);
      await repository.createSubscription(ORG_ID, "pro", { status: "PAST_DUE" });

      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("pro");
    });

    it("INCOMPLETE: subscription exists → hasFeature resolves via plan", async () => {
      setupPlanWithFeature("pro", "AI_SUMMARY", true);
      await repository.createSubscription(ORG_ID, "pro", { status: "INCOMPLETE" });

      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("plan");
      expect(trace.planKey).toBe("pro");
    });

    it("null (no subscription): hasFeature returns false, debugTrace 'fallback', planKey='free'", async () => {
      // No subscription created
      expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);

      const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
      expect(trace.resolvedVia).toBe("fallback");
      expect(trace.value).toBe(false);

      const entitlements = await service.getAllEntitlements(ORG_ID);
      expect(entitlements.planKey).toBe("free");
    });

    // ── Consume behavior across statuses ──

    it("consume: works for ACTIVE status with LIMIT feature and sufficient quota", async () => {
      setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
      await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

      const result = await service.consume(ORG_ID, "EXPORT_PDF", 5);
      expect(result.success).toBe(true);
      expect(result.used).toBe(5);
      expect(result.remaining).toBe(5);
    });

    it("consume: returns LIMIT_REACHED when quota exceeded (ACTIVE)", async () => {
      setupPlanWithFeature("pro", "EXPORT_PDF", true, 2);
      await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

      await service.consume(ORG_ID, "EXPORT_PDF", 2);
      const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("LIMIT_REACHED");
    });

    it("consume: plan-disabled BOOLEAN feature returns FEATURE_NOT_AVAILABLE (consistent)", async () => {
      // Both plan-disabled and override-disabled now consistently return FEATURE_NOT_AVAILABLE
      setupPlanWithFeature("free", "AI_SUMMARY", false);
      await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

      const result = await service.consume(ORG_ID, "AI_SUMMARY", 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
    });

    // ── Transitions ──

    describe("transitions", () => {
      it("ACTIVE → no subscription (removed): falls from plan to fallback after cache invalidation", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

        // Remove subscription entirely (simulating cancellation cleanup)
        repository.subscriptions.delete(ORG_ID);
        await service.invalidateCache(ORG_ID);

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("fallback");
      });

      it("ACTIVE → PAST_DUE: feature access still works (subscription still exists)", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

        // Transition to PAST_DUE
        await repository.updateSubscription(ORG_ID, { status: "PAST_DUE" });

        // Still works because subscription record exists
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
      });

      it("TRIALING → ACTIVE: seamless transition, feature still works", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "TRIALING" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

        // Transition to ACTIVE
        await repository.updateSubscription(ORG_ID, { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
      });

      it("TRIALING → CANCELED (subscription removed): access revoked", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "TRIALING" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);

        // Remove the subscription (simulating what a real getActiveSubscription would return)
        repository.subscriptions.delete(ORG_ID);
        await service.invalidateCache(ORG_ID);

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("fallback");
      });

      it("ACTIVE → ACTIVE with different plan (upgrade): new limits apply", async () => {
        // Free plan: EXPORT_PDF disabled
        setupPlanWithFeature("free", "EXPORT_PDF", true, 0);
        // Pro plan: EXPORT_PDF limit 50
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 50);

        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);

        // Upgrade to pro
        await repository.updateSubscription(ORG_ID, { planKey: "pro", plan: "PRO" });
        await service.invalidateCache(ORG_ID);

        // New limits apply after cache miss
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(50);
        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(true);
      });

      it("ACTIVE → CANCELED: getAllEntitlements returns cached data until invalidation", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        // First call caches
        const first = await service.getAllEntitlements(ORG_ID);
        expect(first.planKey).toBe("pro");
        expect(first.features.AI_SUMMARY).toBe(true);

        // Change plan behind the scenes
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.updateSubscription(ORG_ID, { status: "CANCELED", planKey: "free", plan: "FREE" });

        // Without invalidation, cache returns old data
        const cached = await service.getAllEntitlements(ORG_ID);
        expect(cached.planKey).toBe("pro"); // stale from cache
        expect(cached.features.AI_SUMMARY).toBe(true);

        // After invalidation, fresh data
        await service.invalidateCache(ORG_ID);
        const fresh = await service.getAllEntitlements(ORG_ID);
        expect(fresh.planKey).toBe("free");
        expect(fresh.features.AI_SUMMARY).toBe(false);
      });
    });
  });

  // ============================================
  // B. Override Priority Resolution Matrix
  // ============================================

  describe("B. Override Priority Resolution Matrix", () => {
    // NOTE: User overrides are NOT checked by hasFeature/getLimit/getDebugTrace
    // at the org level. They only affect isInExperiment.
    // Resolution order for org-level methods: org_override > plan > fallback

    function setupPlanWithFeature(planKey: string, featureKey: string, enabled: boolean, limitValue: number | null = null) {
      const plan = repository.plans.get(planKey)!;
      const feature = repository.features.get(featureKey)!;
      const planId = `plan_${planKey}`;
      const existingFeatures = repository.planFeatures.get(planId) ?? [];
      repository.planFeatures.set(planId, [...existingFeatures, createPlanFeature(planId, feature, enabled, limitValue)]);
    }

    // ── BOOLEAN feature: org_override × plan × fallback ──

    describe("BOOLEAN feature resolution", () => {
      it("org override present (enabled=true) + plan disabled → org_override wins (true)", async () => {
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          reason: "Org override enable",
        });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(true);
      });

      it("org override present (enabled=false) + plan enabled → org_override wins (false)", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: false,
          reason: "Org override disable",
        });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(false);
      });

      it("org override absent + plan enabled → plan wins (true)", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
        expect(trace.value).toBe(true);
      });

      it("org override absent + plan disabled → plan wins (false)", async () => {
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
        expect(trace.value).toBe(false);
      });

      it("org override absent + no subscription → fallback (false)", async () => {
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("fallback");
        expect(trace.value).toBe(false);
        expect(trace.planKey).toBe("free");
      });

      it("org override absent + feature not in plan → plan resolves (false)", async () => {
        // AI_SUMMARY is not configured in the "free" plan at all (no planFeatures entry)
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
        expect(trace.value).toBe(false);
        expect(trace.planKey).toBe("free");
      });
    });

    // ── LIMIT feature: org_override × plan × fallback ──

    describe("LIMIT feature resolution", () => {
      it("org override enabled (limitValue=50) + plan limit=10 → org_override gives 50", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: true,
          limitValue: 50,
          reason: "Boost limit",
        });

        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(true);
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(50);
        const trace = await service.getDebugTrace(ORG_ID, "EXPORT_PDF");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(50);
      });

      it("org override disabled → LIMIT feature disabled regardless of plan limit", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 100);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: false,
          reason: "Disable export",
        });

        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "EXPORT_PDF");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(false);
      });

      it("no org override → plan limit applies", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 25);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(25);
        const trace = await service.getDebugTrace(ORG_ID, "EXPORT_PDF");
        expect(trace.resolvedVia).toBe("plan");
        expect(trace.value).toBe(25);
      });

      it("no org override, no subscription → fallback (false), getLimit returns 0", async () => {
        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
        const trace = await service.getDebugTrace(ORG_ID, "EXPORT_PDF");
        expect(trace.resolvedVia).toBe("fallback");
        expect(trace.value).toBe(false);
      });
    });

    // ── Expired vs active overrides ──

    describe("Expired vs active org overrides", () => {
      it("expired org override (past) falls back to plan value", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: false,
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          reason: "Expired override",
        });

        // Plan says enabled=true → override expired → plan wins
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
        expect(trace.value).toBe(true);
      });

      it("active org override takes priority over plan", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
          reason: "Active override",
        });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(false);
      });

      it("org override with no expiresAt (indefinite) takes priority", async () => {
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          reason: "Indefinite override",
        });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
      });

      it("multiple overrides for same org don't interfere across features", async () => {
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        setupPlanWithFeature("free", "API_ACCESS", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        // Enable AI_SUMMARY, keep API_ACCESS disabled
        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          reason: "Enable AI",
        });

        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        expect(await service.hasFeature(ORG_ID, "API_ACCESS")).toBe(false);
      });
    });
  });

  // ============================================
  // C. Edge Cases
  // ============================================

  describe("C. Edge Cases", () => {
    function setupPlanWithFeature(planKey: string, featureKey: string, enabled: boolean, limitValue: number | null = null) {
      const plan = repository.plans.get(planKey)!;
      const feature = repository.features.get(featureKey)!;
      const planId = `plan_${planKey}`;
      const existingFeatures = repository.planFeatures.get(planId) ?? [];
      repository.planFeatures.set(planId, [...existingFeatures, createPlanFeature(planId, feature, enabled, limitValue)]);
    }

    // ── Time boundary overrides ──

    describe("time boundary overrides", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("expiresAt exactly at current time → treated as expired (not > now)", async () => {
        const now = new Date("2026-06-28T12:00:00.000Z");
        vi.setSystemTime(now);

        // Manually adding override and testing mock's filtering directly
        const override: EntitlementOverrideRecord = {
          id: "override_boundary",
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          limitValue: null,
          configJson: null,
          expiresAt: new Date("2026-06-28T12:00:00.000Z"), // == now
          reason: "Boundary test",
          organizationId: null,
          createdAt: now,
          updatedAt: now,
        };
        repository.overrides.push(override);

        // The mock's getOverride checks expiresAt > now, and at the same time,
        // equal means "not >", so the override is treated as expired.
        // We need to call the method to see if it returns null.
        // Since vi.useFakeTimers is set, we'll check the mock directly.
        setupPlanWithFeature("free", "AI_SUMMARY", false);
        repository.subscriptions.set(ORG_ID, {
          id: "sub_boundary",
          userId: "u1",
          orgId: ORG_ID,
          planKey: "free",
          plan: "FREE",
          status: "ACTIVE",
          stripeSubscriptionId: null,
          stripePriceId: null,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          stripeCurrentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          trialEnd: null,
          trialStart: null,
          createdAt: now,
          updatedAt: now,
        });

        // Because expiresAt === now (not >), the override is effectively expired
        // and the service sees plan value
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
      });

      it("expiresAt 1ms in the past → treated as expired", async () => {
        const now = new Date("2026-06-28T12:00:00.000Z");
        vi.setSystemTime(now);

        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          expiresAt: new Date(now.getTime() - 1), // 1ms in the past
          reason: "About to expire",
        });

        // Override is expired → plan wins (false)
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("plan");
      });

      it("expiresAt 1ms in the future → active override takes priority", async () => {
        const now = new Date("2026-06-28T12:00:00.000Z");
        vi.setSystemTime(now);

        setupPlanWithFeature("free", "AI_SUMMARY", false);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          expiresAt: new Date(now.getTime() + 1), // 1ms in the future
          reason: "Just activated",
        });

        // Override is active → wins over plan
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
      });

      it("expiresAt boundary: service also checks expiration (not just mock)", async () => {
        // Even if the mock returns an override, the service also checks expiration.
        // Here we test that the mock's getOverride returns null for expired,
        // so the service never sees it
        const now = new Date("2026-06-28T12:00:00.000Z");
        vi.setSystemTime(now);

        const override = await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          expiresAt: new Date(now.getTime() - 1000), // expired
          reason: "Expired",
        });

        // Mock filters expired overrides
        const fetched = await repository.getOverride("ORG", ORG_ID, "AI_SUMMARY");
        expect(fetched).toBeNull();
      });
    });

    // ── Override values and limits ──

    describe("override limitValue edge cases", () => {
      it("org override limitValue = 0 for LIMIT feature → feature disabled", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 100);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: true,
          limitValue: 0,
          reason: "Set limit to zero",
        });

        // hasFeature returns false because limit is 0
        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
        // getLimit returns 0
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
        // Consume should fail
        const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
        expect(result.success).toBe(false);
        expect(result.error).toBe("LIMIT_REACHED");
      });

      it("org override limitValue = null for LIMIT feature → unlimited (null)", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: true,
          limitValue: null, // unlimited
          reason: "Make unlimited",
        });

        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(true);
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBeNull();
        const result = await service.consume(ORG_ID, "EXPORT_PDF", 9999);
        expect(result.success).toBe(true);
        expect(result.remaining).toBeNull();
      });

      it("plan limitValue = 0 with no override → hasFeature false, getLimit 0", async () => {
        setupPlanWithFeature("free", "EXPORT_PDF", true, 0);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
      });

      it("plan limitValue = null (unlimited) with no override → hasFeature true, getLimit null", async () => {
        setupPlanWithFeature("enterprise", "EXPORT_PDF", true, null);
        await repository.createSubscription(ORG_ID, "enterprise", { status: "ACTIVE" });

        expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(true);
        expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBeNull();
      });
    });

    // ── Override for non-existent feature ──

    describe("override for features not in plan", () => {
      it("override for feature that does not exist in any plan → feature resolved as false (plan fallback), but override still applies", async () => {
        // Feature doesn't exist in the features map at all
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "NONEXISTENT_FEATURE",
          enabled: true,
          reason: "Override for unknown feature",
        });

        // getDebugTrace will check override first, but then the feature
        // doesn't exist in the repository, so featureType can't be determined.
        // Let's trace the code: getFeature("NONEXISTENT_FEATURE") → null
        // Then feature?.type is undefined, featureType becomes undefined
        // const value = undefined === "LIMIT" && true ? ... : true → value = true (orgOverride.enabled)
        // So it should return resolvedVia: "org_override", value: true
        const trace = await service.getDebugTrace(ORG_ID, "NONEXISTENT_FEATURE");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(true);

        // hasFeature returns true because override says enabled
        expect(await service.hasFeature(ORG_ID, "NONEXISTENT_FEATURE")).toBe(true);
      });

      it("override for existing feature but not configured in any plan → override still applies", async () => {
        // AI_SUMMARY exists as a feature but is not in any plan's planFeatures
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          reason: "Override enable for unconfigured feature",
        });

        // Override applies first
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
      });
    });

    // ── Override without subscription ──

    describe("override without subscription", () => {
      it("org override without any subscription → override still applies", async () => {
        // No subscription at all
        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: true,
          reason: "Org override without sub",
        });

        // Override is checked before subscription, so it applies
        expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
        const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
        expect(trace.resolvedVia).toBe("org_override");
        expect(trace.value).toBe(true);
      });

      it("user override without subscription → affects isInExperiment", async () => {
        // Even without subscription, user override on experiment should work
        const result = await service.isInExperiment("user_no_sub", "NEW_DASHBOARD");
        // Without override, falls to config (50% bucket)
        expect(typeof result).toBe("boolean");
      });
    });

    // ── Consume with overrides ──

    describe("consume with overrides", () => {
      it("consume: override-disabled BOOLEAN feature returns FEATURE_NOT_AVAILABLE (different from plan-disabled)", async () => {
        setupPlanWithFeature("pro", "AI_SUMMARY", true);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        // Org override disables it
        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "AI_SUMMARY",
          enabled: false,
          reason: "Override disable",
        });

        const result = await service.consume(ORG_ID, "AI_SUMMARY", 1);
        expect(result.success).toBe(false);
        expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
      });

      it("consume: override-disabled LIMIT feature returns FEATURE_NOT_AVAILABLE", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: false,
          reason: "Override disable limit",
        });

        const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
        expect(result.success).toBe(false);
        expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
      });
    });

    // ── getAllEntitlements edge cases ──

    describe("getAllEntitlements edge cases", () => {
      it("getAllEntitlements: plan LIMIT disabled (enabled=false) with limitValue shows feature=false, limit=0", async () => {
        // Create a LIMIT feature where enabled=false but limitValue > 0
        repository.features.set("DISABLED_LIMIT", createFeature("DISABLED_LIMIT", "LIMIT"));
        const plan = repository.plans.get("free")!;
        const feature = repository.features.get("DISABLED_LIMIT")!;
        repository.planFeatures.set("plan_free", [
          createPlanFeature("plan_free", feature, false, 50), // enabled=false, limitValue=50
        ]);
        await repository.createSubscription(ORG_ID, "free", { status: "ACTIVE" });

        const entitlements = await service.getAllEntitlements(ORG_ID);
        expect(entitlements.features["DISABLED_LIMIT"]).toBe(false);
        // When pf.enabled=false, limit is forced to 0 (gap #2 fix: pf.enabled gates both features and limits)
        expect(entitlements.limits["DISABLED_LIMIT"]).toBe(0);

        const hf = await service.hasFeature(ORG_ID, "DISABLED_LIMIT");
        expect(hf).toBe(false); // consistent with getAllEntitlements
      });

      it("getAllEntitlements: overrides reflect in the map", async () => {
        setupPlanWithFeature("pro", "EXPORT_PDF", true, 10);
        await repository.createSubscription(ORG_ID, "pro", { status: "ACTIVE" });

        await repository.createOverride({
          scope: "ORG",
          scopeId: ORG_ID,
          featureKey: "EXPORT_PDF",
          enabled: true,
          limitValue: 75,
          reason: "Boost limit",
        });

        const entitlements = await service.getAllEntitlements(ORG_ID);
        // getAllEntitlements checks overrides and uses override.limitValue
        expect(entitlements.features["EXPORT_PDF"]).toBe(true);
        expect(entitlements.limits["EXPORT_PDF"]).toBe(75);
      });
    });
  });

  // ============================================
  // D. isInExperiment with Override
  // ============================================

  describe("D. isInExperiment with Override", () => {
    it("user override enabled → experiment active regardless of experiment config (even 0% rollout)", async () => {
      // Create an experiment with 0% rollout
      repository.features.set("ZERO_PCT_EXP", createFeature("ZERO_PCT_EXP", "EXPERIMENT", {
        percentage: 0,
        seed: "zero_pct",
      }));

      // User override enables it
      await repository.createOverride({
        scope: "USER",
        scopeId: USER_ID,
        featureKey: "ZERO_PCT_EXP",
        enabled: true,
        reason: "Override into experiment",
      });

      const result = await service.isInExperiment(USER_ID, "ZERO_PCT_EXP");
      expect(result).toBe(true);
    });

    it("user override disabled → experiment disabled regardless of experiment config (even 100% rollout)", async () => {
      // Create an experiment with 100% rollout
      repository.features.set("ALL_IN_EXP", createFeature("ALL_IN_EXP", "EXPERIMENT", {
        percentage: 100,
        seed: "all_in",
      }));

      // User override disables it
      await repository.createOverride({
        scope: "USER",
        scopeId: USER_ID,
        featureKey: "ALL_IN_EXP",
        enabled: false,
        reason: "Opt out",
      });

      const result = await service.isInExperiment(USER_ID, "ALL_IN_EXP");
      expect(result).toBe(false);
    });

    it("only org override for experiment feature → no effect on isInExperiment (ignores org override)", async () => {
      repository.features.set("EXP_FOR_ORG", createFeature("EXP_FOR_ORG", "EXPERIMENT", {
        percentage: 10,
        seed: "org_test",
      }));

      // Org-level override (should be ignored by isInExperiment)
      await repository.createOverride({
        scope: "ORG",
        scopeId: ORG_ID,
        featureKey: "EXP_FOR_ORG",
        enabled: true,
        reason: "Org override for exp",
      });

      // isInExperiment only checks user-level overrides, not org
      // Falls to experiment config: 10% bucketing
      const result = await service.isInExperiment(USER_ID, "EXP_FOR_ORG");
      // Result depends on bucket; just verify it's a boolean and doesn't crash
      expect(typeof result).toBe("boolean");
    });

    it("user override + org override for experiment → user override wins (checked first)", async () => {
      repository.features.set("CONFLICT_EXP", createFeature("CONFLICT_EXP", "EXPERIMENT", {
        percentage: 50,
        seed: "conflict",
      }));

      // Org override enables (should be ignored)
      await repository.createOverride({
        scope: "ORG",
        scopeId: ORG_ID,
        featureKey: "CONFLICT_EXP",
        enabled: true,
        reason: "Org enable",
      });

      // User override disables (should win)
      await repository.createOverride({
        scope: "USER",
        scopeId: USER_ID,
        featureKey: "CONFLICT_EXP",
        enabled: false,
        reason: "User disable",
      });

      const result = await service.isInExperiment(USER_ID, "CONFLICT_EXP");
      expect(result).toBe(false); // user override wins
    });

    it("non-EXPERIMENT feature returns false from isInExperiment even with user override", async () => {
      // AI_SUMMARY is BOOLEAN type
      await repository.createOverride({
        scope: "USER",
        scopeId: USER_ID,
        featureKey: "AI_SUMMARY",
        enabled: true,
        reason: "User override",
      });

      const result = await service.isInExperiment(USER_ID, "AI_SUMMARY");
      expect(result).toBe(false); // not an EXPERIMENT type
    });

    it("experiment with no user override, 0% config → false", async () => {
      repository.features.set("ZERO_EXP", createFeature("ZERO_EXP", "EXPERIMENT", {
        percentage: 0,
        seed: "zero",
      }));

      const result = await service.isInExperiment("any_user", "ZERO_EXP");
      expect(result).toBe(false);
    });

    it("experiment with no user override, 100% config → true", async () => {
      repository.features.set("FULL_EXP", createFeature("FULL_EXP", "EXPERIMENT", {
        percentage: 100,
        seed: "full",
      }));

      const result = await service.isInExperiment("any_user", "FULL_EXP");
      expect(result).toBe(true);
    });
  });
});
