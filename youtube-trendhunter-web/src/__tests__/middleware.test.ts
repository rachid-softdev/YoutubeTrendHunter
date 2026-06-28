// ============================================
// Middleware Factories — Comprehensive Test Suite
// ============================================
//
// Tests each middleware factory function in isolation:
//   requireFeature, requireLimit, consumeFeature, withFeature, withLimit
//
// Covers success paths, error propagation, edge cases, and response format.
// ============================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeatureGateService } from "@/lib/feature-flags/feature-gate.service";
import {
  FeatureNotAvailableError,
  LimitReachedError,
} from "@/lib/feature-flags/errors";
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

// ─── Mock next/server for withFeature/withLimit ───

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
// Mock Repository
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

  async getPlanFeature(
    planId: string,
    featureKey: string,
  ): Promise<PlanFeatureRecord | null> {
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

  async updateSubscription(
    orgId: string,
    data: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
    const existing = this.subscriptions.get(orgId);
    if (!existing) throw new Error("No subscription");
    const updated = { ...existing, ...data };
    this.subscriptions.set(orgId, updated);
    return updated;
  }

  async createSubscription(
    orgId: string,
    planKey: string,
    data?: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
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
      currentPeriodEnd:
        data?.currentPeriodEnd ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripeCurrentPeriodEnd:
        data?.stripeCurrentPeriodEnd ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialEnd: data?.trialEnd ?? null,
      trialStart: data?.trialStart ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.subscriptions.set(orgId, sub);
    return sub;
  }

  async getOverride(
    scope: OverrideScope,
    scopeId: string,
    featureKey: string,
  ): Promise<EntitlementOverrideRecord | null> {
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
    return this.overrides.filter(
      (o) =>
        o.scope === "ORG" &&
        o.scopeId === orgId &&
        (!o.expiresAt || o.expiresAt > now),
    );
  }

  async getOverridesForUser(userId: string): Promise<EntitlementOverrideRecord[]> {
    const now = new Date();
    return this.overrides.filter(
      (o) =>
        o.scope === "USER" &&
        o.scopeId === userId &&
        (!o.expiresAt || o.expiresAt > now),
    );
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

  async updateOverride(
    id: string,
    data: Partial<EntitlementOverrideRecord>,
  ): Promise<EntitlementOverrideRecord> {
    const idx = this.overrides.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error("Override not found");
    this.overrides[idx] = { ...this.overrides[idx], ...data, updatedAt: new Date() };
    return this.overrides[idx];
  }

  async deleteOverride(id: string): Promise<void> {
    this.overrides = this.overrides.filter((o) => o.id !== id);
  }

  async getCurrentUsage(
    orgId: string,
    featureKey: string,
  ): Promise<UsageTrackingRecord | null> {
    return this.usage.get(`${orgId}:${featureKey}`) ?? null;
  }

  async getUsageForPeriod(
    orgId: string,
    featureKey: string,
    _periodStart: Date,
  ): Promise<UsageTrackingRecord | null> {
    return this.usage.get(`${orgId}:${featureKey}`) ?? null;
  }

  async createUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageTrackingRecord> {
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

  async consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
    maxAllowed?: number,
  ): Promise<{ success: boolean; usageCount: number } | null> {
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
    // Create new period
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

function createFeature(
  key: string,
  type: "BOOLEAN" | "LIMIT" | "EXPERIMENT",
  defaultConfig?: Record<string, unknown> | null,
): FeatureRecord {
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

function createPlanFeature(
  planId: string,
  feature: FeatureRecord,
  enabled: boolean,
  limitValue: number | null = null,
  configJson?: Record<string, unknown> | null,
): PlanFeatureRecord {
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
// Shared Setup
// ============================================

const ORG_ID = "org_middleware_1";
const USER_ID = "user_middleware_1";

function setupService(): {
  repository: MockEntitlementRepository;
  cache: MockCacheService;
  service: FeatureGateService;
} {
  const repository = new MockEntitlementRepository();
  const cache = new MockCacheService();
  const service = new FeatureGateService(repository, cache);

  // Setup base plans
  repository.plans.set("free", createPlan("free", "Free", 0));
  repository.plans.set("pro", createPlan("pro", "Pro", 1));
  repository.plans.set("enterprise", createPlan("enterprise", "Enterprise", 2));

  // Setup features
  repository.features.set("EXPORT_PDF", createFeature("EXPORT_PDF", "LIMIT"));
  repository.features.set("AI_SUMMARY", createFeature("AI_SUMMARY", "BOOLEAN"));
  repository.features.set("API_ACCESS", createFeature("API_ACCESS", "BOOLEAN"));
  repository.features.set(
    "UNLIMITED_STORAGE",
    createFeature("UNLIMITED_STORAGE", "LIMIT"),
  );

  return { repository, cache, service };
}

function defaultSession() {
  return async () => ({ orgId: ORG_ID, userId: USER_ID });
}

// ============================================
// requireFeature Middleware Factory Tests
// ============================================

describe("requireFeature middleware factory", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("passes when feature is available on the plan", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, defaultSession())("AI_SUMMARY");
    await expect(check()).resolves.toBeUndefined();
  });

  it("throws FeatureNotAvailableError when feature is not available on the plan", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, defaultSession())("AI_SUMMARY");
    await expect(check()).rejects.toThrow(FeatureNotAvailableError);
    await expect(check()).rejects.toThrow(
      'Feature "AI_SUMMARY" not available on plan "free"',
    );
  });

  it("propagates session resolver errors", async () => {
    const brokenSession = async () => {
      throw new Error("Session expired");
    };

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, brokenSession)("AI_SUMMARY");
    await expect(check()).rejects.toThrow("Session expired");
  });

  it("throws TypeError when session resolver returns null", async () => {
    const nullSession = async () => null as unknown as { orgId: string; userId: string };

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, nullSession)("AI_SUMMARY");
    await expect(check()).rejects.toThrow(); // Cannot destructure null
  });

  it("handles empty string feature key gracefully", async () => {
    // Empty key won't match any real feature → FeatureNotAvailableError
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, defaultSession())("");
    await expect(check()).rejects.toThrow(FeatureNotAvailableError);
  });

  it("handles special characters in feature key", async () => {
    // Feature with special chars registered on the plan
    repository.features.set(
      "FEATURE_@#$%",
      createFeature("FEATURE_@#$%", "BOOLEAN"),
    );
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("FEATURE_@#$%")!,
        true,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, defaultSession())("FEATURE_@#$%");
    await expect(check()).resolves.toBeUndefined();
  });
});

// ============================================
// requireLimit Middleware Factory Tests
// ============================================

describe("requireLimit middleware factory", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("passes when under limit and returns handler result", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("EXPORT_PDF", 5);
    await expect(check(async () => "ok")).resolves.toBe("ok");
  });

  it("uses default amount of 1 when n is omitted", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        3,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("EXPORT_PDF"); // no amount
    await expect(check(async () => "ok")).resolves.toBe("ok");
  });

  it("passes with larger n that is still under limit", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        100,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("EXPORT_PDF", 50);
    await expect(check(async () => "big_ok")).resolves.toBe("big_ok");
  });

  it("passes when limit is null (unlimited)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("UNLIMITED_STORAGE")!,
        true,
        null, // unlimited
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("UNLIMITED_STORAGE", 9999);
    await expect(check(async () => "unlimited")).resolves.toBe("unlimited");
  });

  it("throws LimitReachedError when at limit", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Use all 10 units
    await service.consume(ORG_ID, "EXPORT_PDF", 10);

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("EXPORT_PDF", 1);
    await expect(check(async () => "ok")).rejects.toThrow(LimitReachedError);
  });

  it("throws LimitReachedError when limit is 0 (disabled)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        0, // disabled
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, defaultSession())("EXPORT_PDF", 1);
    await expect(check(async () => "ok")).rejects.toThrow(LimitReachedError);
  });

  it("propagates session resolver errors", async () => {
    const brokenSession = async () => {
      throw new Error("Token invalid");
    };

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    const check = requireLimit(service, brokenSession)("EXPORT_PDF", 1);
    await expect(check(async () => "ok")).rejects.toThrow("Token invalid");
  });

  it("passes through with negative n (bypasses limit check)", async () => {
    // Negative n causes canConsume to evaluate: used + (-n) <= limit
    // For n=-5, used=0, and any limit > -5, this evaluates to true
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { requireLimit } = await import("@/lib/feature-flags/middleware");
    // Negative n bypasses canConsume because 0 + (-5) <= 10 → true
    const check = requireLimit(service, defaultSession())("EXPORT_PDF", -5);
    await expect(check(async () => "negative_n")).resolves.toBe("negative_n");
  });
});

// ============================================
// consumeFeature Middleware Factory Tests
// ============================================

describe("consumeFeature middleware factory", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("consumes and returns handler result", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("EXPORT_PDF", 3);
    const result = await check(async () => "done");
    expect(result).toBe("done");

    // Verify consumption happened
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(3);
  });

  it("consumption count is accurate after multiple calls", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");

    const check1 = consumeFeature(service, defaultSession())("EXPORT_PDF", 2);
    await check1(async () => "first");
    expect((await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF"))?.usageCount).toBe(2);

    const check2 = consumeFeature(service, defaultSession())("EXPORT_PDF", 3);
    await check2(async () => "second");
    expect((await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF"))?.usageCount).toBe(5);
  });

  it("throws LimitReachedError when at limit", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        5,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Use all 5
    await service.consume(ORG_ID, "EXPORT_PDF", 5);

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("EXPORT_PDF", 1);
    await expect(check(async () => "done")).rejects.toThrow(LimitReachedError);
  });

  it("consumes exactly at limit boundary", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        5,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Consume exactly 5 which is the limit
    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("EXPORT_PDF", 5);
    const result = await check(async () => "exact_limit");
    expect(result).toBe("exact_limit");

    // Next consume should fail
    const check2 = consumeFeature(service, defaultSession())("EXPORT_PDF", 1);
    await expect(check2(async () => "over")).rejects.toThrow(LimitReachedError);
  });

  it("throws FeatureNotAvailableError for feature disabled by plan", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("AI_SUMMARY", 1);
    // Plan-disabled features now return FEATURE_NOT_AVAILABLE (not LIMIT_REACHED)
    await expect(check(async () => "done")).rejects.toThrow(FeatureNotAvailableError);
  });

  it("throws FeatureNotAvailableError for unknown feature key with active subscription", async () => {
    // With an active subscription, unknown features resolve via "plan" with value=false
    // → consume returns FEATURE_NOT_AVAILABLE → middleware throws FeatureNotAvailableError
    await repository.createSubscription(ORG_ID, "pro");

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("UNKNOWN_FEATURE", 1);
    await expect(check(async () => "done")).rejects.toThrow(FeatureNotAvailableError);
  });

  it("throws FeatureNotAvailableError for feature without subscription (fallback)", async () => {
    // Without subscription or plan, features resolve via "fallback" with value=false
    // → consume returns FEATURE_NOT_AVAILABLE → middleware throws FeatureNotAvailableError
    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, defaultSession())("AI_SUMMARY", 1);
    await expect(check(async () => "done")).rejects.toThrow(FeatureNotAvailableError);
  });

  it("propagates session resolver errors", async () => {
    const brokenSession = async () => {
      throw new Error("Auth failed");
    };

    const { consumeFeature } = await import("@/lib/feature-flags/middleware");
    const check = consumeFeature(service, brokenSession)("EXPORT_PDF", 1);
    await expect(check(async () => "done")).rejects.toThrow("Auth failed");
  });
});

// ============================================
// withFeature Middleware Factory Tests
// ============================================

describe("withFeature middleware factory", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("passes through when feature is available and returns handler Response", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) => new Response("ok", { status: 200 }),
    );
    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
  });

  it("returns 403 JSON response when feature is not available", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("propagates non-feature errors (does not catch them)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) => {
        throw new Error("Database connection failed");
      },
    );
    await expect(handler({})).rejects.toThrow("Database connection failed");
  });

  it("propagates session resolver errors", async () => {
    const brokenSession = async () => {
      throw new Error("Unauthenticated");
    };

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, brokenSession)("AI_SUMMARY")(
      async (_req: unknown) => new Response("ok"),
    );
    await expect(handler({})).rejects.toThrow("Unauthenticated");
  });

  it("preserves headers from the handler Response", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) =>
        new Response("with_headers", {
          status: 200,
          headers: { "x-custom": "value", "x-another": "123" },
        }),
    );
    const response = await handler({});
    expect(response.status).toBe(200);
    expect(response.headers.get("x-custom")).toBe("value");
    expect(response.headers.get("x-another")).toBe("123");
  });

  it("preserves non-200 status codes from the handler Response", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) => new Response("not_found", { status: 404 }),
    );
    const response = await handler({});
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("not_found");
  });
});

// ============================================
// withLimit Middleware Factory Tests
// ============================================

describe("withLimit middleware factory", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("passes through when under limit and returns handler Response", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 3)(
      async (_req: unknown) => new Response("consumed", { status: 200 }),
    );
    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("consumed");

    // Verify consumption occurred
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(3);
  });

  it("returns 402 JSON response when limit is reached", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        3,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Consume all
    await service.consume(ORG_ID, "EXPORT_PDF", 3);

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 1)(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe("LIMIT_REACHED");
    expect(body.feature).toBe("EXPORT_PDF");
    expect(body.limit).toBe(3);
    expect(body.used).toBe(3);
    expect(body.upgrade_url).toBe("/billing/upgrade");
  });

  it("returns 402 when limit is 0 (disabled)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        0, // disabled
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 1)(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(402);
  });

  it("returns 403 when BOOLEAN feature disabled by org override", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Disable via org override
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: false,
      reason: "Override test",
    });

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("AI_SUMMARY", 1)(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("passes through with unlimited limit (null)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("UNLIMITED_STORAGE")!,
        true,
        null,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("UNLIMITED_STORAGE", 999)(
      async (_req: unknown) => new Response("unlimited_ok", { status: 200 }),
    );
    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("unlimited_ok");
  });

  it("handles handler returning undefined/null response gracefully", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 1)(
      async (_req: unknown) => undefined as unknown as Response,
    );
    // The middleware expects a Response return - TypeScript would catch this,
    // but at runtime it returns undefined which is technically "fine" for JS
    const result = await handler({});
    expect(result).toBeUndefined();
  });
});

// ============================================
// Error Response Format Verification
// ============================================

describe("Error response format verification", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(() => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;
  });

  it("403 response from withFeature has correct JSON shape", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const { withFeature } = await import("@/lib/feature-flags/middleware");
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("application/json");

    const body = await response.json();
    expect(body).toEqual({
      error: "FEATURE_NOT_AVAILABLE",
      feature: "AI_SUMMARY",
      plan_required: expect.any(String),
      current_plan: "free",
      upgrade_url: "/billing/upgrade",
    });
  });

  it("402 response from withLimit has correct JSON shape", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        5,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Exhaust the limit
    await service.consume(ORG_ID, "EXPORT_PDF", 5);

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 1)(
      async (_req: unknown) => new Response("ok"),
    );
    const response = await handler({});
    expect(response.status).toBe(402);
    expect(response.headers.get("content-type")).toBe("application/json");

    const body = await response.json();
    expect(body).toEqual({
      error: "LIMIT_REACHED",
      feature: "EXPORT_PDF",
      limit: 5,
      used: 5,
      reset_at: expect.any(String),
      upgrade_url: "/billing/upgrade",
    });
  });

  it("withLimit catches handler rejection via await (BUG FIXED)", async () => {
    // FIXED: `return await handler(req)` now properly awaits the handler,
    // so rejections are caught by the try/catch block and formatted as 402.
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        5,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const { withLimit } = await import("@/lib/feature-flags/middleware");
    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 1)(
      async (_req: unknown) => {
        throw new LimitReachedError(
          "EXPORT_PDF",
          5,
          5,
          new Date().toISOString(),
        );
      },
    );
    // FIXED: Error is caught by try/catch and returned as 402 JSON response
    const response = await handler({});
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "LIMIT_REACHED",
      feature: "EXPORT_PDF",
    });
  });
});

// ============================================
// Session Resolver Edge Cases
// ============================================

describe("Session resolver edge cases", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(async () => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;

    // Both features on the same plan
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");
  });

  it("async session resolver that delays resolves correctly", async () => {
    const delayedSession = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { orgId: ORG_ID, userId: USER_ID };
    };

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, delayedSession)("AI_SUMMARY");
    await expect(check()).resolves.toBeUndefined();
  });

  it("session resolver that throws a specific error type", async () => {
    class CustomAuthError extends Error {
      code = 401;
    }

    const throwingSession = async () => {
      throw new CustomAuthError();
    };

    const { requireFeature, requireLimit, consumeFeature, withFeature } =
      await import("@/lib/feature-flags/middleware");

    // requireFeature
    const rfCheck = requireFeature(service, throwingSession)("AI_SUMMARY");
    await expect(rfCheck()).rejects.toThrow(CustomAuthError);

    // requireLimit
    const rlCheck = requireLimit(service, throwingSession)("EXPORT_PDF", 1);
    await expect(rlCheck(async () => "ok")).rejects.toThrow(CustomAuthError);

    // consumeFeature
    const cfCheck = consumeFeature(service, throwingSession)("EXPORT_PDF", 1);
    await expect(cfCheck(async () => "done")).rejects.toThrow(CustomAuthError);

    // withFeature
    const wfHandler = withFeature(service, throwingSession)("AI_SUMMARY")(
      async (_req: unknown) => new Response("ok"),
    );
    await expect(wfHandler({})).rejects.toThrow(CustomAuthError);
  });

  it("session resolver returns missing fields gracefully", async () => {
    // Session with missing orgId should cause issues downstream
    const incompleteSession = async () =>
      ({}) as unknown as { orgId: string; userId: string };

    const { requireFeature } = await import("@/lib/feature-flags/middleware");
    const check = requireFeature(service, incompleteSession)("AI_SUMMARY");
    // orgId will be undefined, causing downstream issues
    await expect(check()).rejects.toThrow();
  });

  it("session resolver with extra properties still works", async () => {
    const richSession = async () => ({
      orgId: ORG_ID,
      userId: USER_ID,
      plan: "pro",
      email: "test@example.com",
      tenant: "acme",
    });

    const { requireFeature, requireLimit } = await import(
      "@/lib/feature-flags/middleware"
    );

    const rfCheck = requireFeature(service, richSession)("AI_SUMMARY");
    await expect(rfCheck()).resolves.toBeUndefined();

    const rlCheck = requireLimit(service, richSession)("EXPORT_PDF", 1);
    await expect(rlCheck(async () => "extra_props")).resolves.toBe("extra_props");
  });
});

// ============================================
// Middleware Composition Tests
// ============================================

describe("Middleware composition", () => {
  let repository: MockEntitlementRepository;
  let service: FeatureGateService;

  beforeEach(async () => {
    const setup = setupService();
    repository = setup.repository;
    service = setup.service;

    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);
    await repository.createSubscription(ORG_ID, "pro");
  });

  it("withFeature wrapping withLimit: feature check + limit check work together", async () => {
    const { withFeature, withLimit } = await import(
      "@/lib/feature-flags/middleware"
    );

    // Composition: feature gate outside, limit check inside
    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      withLimit(service, defaultSession())("EXPORT_PDF", 3)(
        async (_req: unknown) =>
          new Response("composed", { status: 200, headers: { "x-used": "true" } }),
      ),
    );

    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("composed");
    expect(response.headers.get("x-used")).toBe("true");

    // Verify consumption of EXPORT_PDF
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(3);
  });

  it("withFeature catches FeatureNotAvailableError before withLimit runs", async () => {
    // Remove AI_SUMMARY from plan
    repository.planFeatures.set("plan_pro", [
      createPlanFeature(
        "plan_pro",
        repository.features.get("EXPORT_PDF")!,
        true,
        10,
      ),
    ]);

    const { withFeature, withLimit } = await import(
      "@/lib/feature-flags/middleware"
    );

    const handler = withFeature(service, defaultSession())("AI_SUMMARY")(
      withLimit(service, defaultSession())("EXPORT_PDF", 1)(
        async (_req: unknown) => new Response("should_not_run"),
      ),
    );

    const response = await handler({});
    expect(response.status).toBe(403); // Feature check fails
  });

  it("withLimit can be used standalone without withFeature", async () => {
    const { withLimit } = await import("@/lib/feature-flags/middleware");

    const handler = withLimit(service, defaultSession())("EXPORT_PDF", 2)(
      async (_req: unknown) => new Response("standalone", { status: 200 }),
    );

    const response = await handler({});
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("standalone");
  });
});
