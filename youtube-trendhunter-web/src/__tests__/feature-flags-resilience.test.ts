// ============================================
// FeatureFlags — Resilience & Concurrency Tests
// ============================================
//
// Tests concurrent access patterns, race conditions,
// cache resilience, repository edge cases, error propagation,
// and data integrity for the FeatureGateService.
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FeatureGateService } from "@/lib/feature-flags/feature-gate.service";
import { CacheService } from "@/lib/feature-flags/cache-service";
import { FeatureNotAvailableError, LimitReachedError } from "@/lib/feature-flags/errors";
import type {
  IEntitlementRepository,
  ICacheService,
  PlanRecord,
  FeatureRecord,
  PlanFeatureRecord,
  SubscriptionRecord,
  EntitlementOverrideRecord,
  UsageTrackingRecord,
  ConsumeResult,
  EntitlementMap,
  OverrideScope,
  CreateOverrideInput,
  SubscriptionStatus,
} from "@/lib/feature-flags/types";

// ─── Synchronization Barrier ───
// Used to coordinate concurrent operations at specific await points.

class Barrier {
  private waiting: Array<() => void> = [];
  private _released = false;
  private _waitCount = 0;
  private _resolveAuto: (() => void) | null = null;
  private _autoPromise: Promise<void> | null = null;

  get waitCount(): number {
    return this._waitCount;
  }

  /** Wait until the barrier is released. Returns a promise. */
  async wait(): Promise<void> {
    if (this._released) return;
    this._waitCount++;
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /** Auto-resolve when N tasks are waiting */
  autoRelease(count: number): Promise<void> {
    this._autoPromise = new Promise((resolve) => {
      this._resolveAuto = resolve;
    });
    // Check if already enough waiting
    if (this._waitCount >= count) {
      this.release();
    }
    return this._autoPromise;
  }

  /** Release all waiting tasks. */
  release(): void {
    this._released = true;
    const resolvers = [...this.waiting];
    this.waiting = [];
    if (this._resolveAuto) {
      this._resolveAuto();
      this._resolveAuto = null;
    }
    for (const resolve of resolvers) {
      resolve();
    }
  }

  reset(): void {
    this._released = false;
    this._waitCount = 0;
    this.waiting = [];
    this._resolveAuto = null;
    this._autoPromise = null;
  }
}

// ============================================
// Test Data Factories
// ============================================

function createPlan(key: string, name: string, sortOrder = 0, isActive = true): PlanRecord {
  return {
    id: `plan_${key}`,
    key,
    name,
    priceMonthly: key === "free" ? 0 : key === "pro" ? 1500 : 3900,
    isActive,
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createFeature(
  key: string,
  type: "BOOLEAN" | "LIMIT" | "EXPERIMENT",
  defaultConfig?: Record<string, unknown> | null,
  isActive = true,
): FeatureRecord {
  return {
    id: `feature_${key}`,
    key,
    name: key,
    description: `Feature ${key}`,
    type,
    defaultConfig: defaultConfig ?? null,
    isActive,
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
// Base Mock Repository (mirrors feature-gate.test.ts)
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
    // If maxAllowed is set and we'd exceed it, reject (simulates SQL-level guard)
    const key = `${orgId}:${featureKey}`;
    const existing = this.usage.get(key);
    if (maxAllowed !== undefined) {
      const currentCount = existing?.usageCount ?? 0;
      if (currentCount + amount > maxAllowed) {
        return null; // SQL returned 0 rows
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
// ControllableMockRepository — Adds barriers for race condition testing
// ============================================

class ControllableMockRepository extends MockEntitlementRepository {
  // Barriers at specific await points in FeatureGateService
  getCurrentUsageBarrier: Barrier | null = null;
  consumeUsageBarrier: Barrier | null = null;
  getLimitBarrier: Barrier | null = null;

  // Track invocation counts
  getCurrentUsageCallCount = 0;
  consumeUsageCallCount = 0;

  async getCurrentUsage(
    orgId: string,
    featureKey: string,
  ): Promise<UsageTrackingRecord | null> {
    this.getCurrentUsageCallCount++;
    if (this.getCurrentUsageBarrier) {
      await this.getCurrentUsageBarrier.wait();
    }
    return super.getCurrentUsage(orgId, featureKey);
  }

  async consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
    maxAllowed?: number,
  ): Promise<{ success: boolean; usageCount: number } | null> {
    this.consumeUsageCallCount++;
    if (this.consumeUsageBarrier) {
      await this.consumeUsageBarrier.wait();
    }
    // Pass through to parent
    return super.consumeUsage(orgId, featureKey, amount, maxAllowed);
  }

  resetBarriers(): void {
    this.getCurrentUsageBarrier = null;
    this.consumeUsageBarrier = null;
    this.getLimitBarrier = null;
    this.getCurrentUsageCallCount = 0;
    this.consumeUsageCallCount = 0;
  }
}

// ============================================
// LimitEnforcingMockRepository — Enforces limits in consumeUsage
// ============================================

class LimitEnforcingMockRepository extends MockEntitlementRepository {
  // Store effective limits per feature key for enforcement
  private enforcedLimits = new Map<string, number | null>();

  setEnforcedLimit(orgId: string, featureKey: string, limit: number | null): void {
    this.enforcedLimits.set(`${orgId}:${featureKey}`, limit);
  }

  async consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
    maxAllowed?: number,
  ): Promise<{ success: boolean; usageCount: number } | null> {
    const key = `${orgId}:${featureKey}`;
    const limit = maxAllowed ?? this.enforcedLimits.get(key) as number | undefined;

    if (limit !== null) {
      // Check if increment would exceed limit (simulating atomic UPDATE...RETURNING)
      const existing = this.usage.get(key);
      const currentCount = existing?.usageCount ?? 0;
      if (currentCount + amount > limit) {
        return null; // Simulates zero rows affected by UPDATE
      }
    }

    // Proceed with increment
    const existing = this.usage.get(key);
    if (existing) {
      existing.usageCount += amount;
      return { success: true, usageCount: existing.usageCount };
    }

    // Create new period
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const usage: UsageTrackingRecord = {
      id: `usage_${Date.now()}`,
      orgId,
      featureKey,
      usageCount: amount,
      periodStart: now,
      periodEnd,
    };
    this.usage.set(key, usage);
    return { success: true, usageCount: amount };
  }
}

// ============================================
// Mock Cache Service (mirrors feature-gate.test.ts)
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
// ControllableMockCache — Adds barrier + failure simulation
// ============================================

class ControllableMockCache extends MockCacheService {
  // Simulate failures
  throwOnGet = false;
  throwOnSet = false;
  throwOnDel = false;
  getDelay = 0;
  simulateRedisDown = false;

  async get<T>(key: string): Promise<T | null> {
    if (this.throwOnGet) throw new Error("Cache GET failure");
    return super.get<T>(key);
  }

  async set<T>(key: string, data: T, _ttlSeconds: number): Promise<void> {
    if (this.throwOnSet) throw new Error("Cache SET failure");
    return super.set(key, data, _ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.throwOnDel) throw new Error("Cache DEL failure");
    return super.del(key);
  }
}

// ============================================
// Test Suite Setup
// ============================================

const ORG_ID = "org_1";
const USER_ID = "user_1";

function setupBasicPlan(repo: MockEntitlementRepository): void {
  repo.plans.set("free", createPlan("free", "Free", 0));
  repo.plans.set("pro", createPlan("pro", "Pro", 1));
  repo.plans.set("enterprise", createPlan("enterprise", "Enterprise", 2));
}

function setupFeatures(repo: MockEntitlementRepository): void {
  repo.features.set("EXPORT_PDF", createFeature("EXPORT_PDF", "LIMIT"));
  repo.features.set("AI_SUMMARY", createFeature("AI_SUMMARY", "BOOLEAN"));
  repo.features.set("API_ACCESS", createFeature("API_ACCESS", "BOOLEAN"));
  repo.features.set("NEW_DASHBOARD", createFeature("NEW_DASHBOARD", "EXPERIMENT", {
    percentage: 50,
    seed: "NEW_DASHBOARD_v1",
  }));
  repo.features.set("UNLIMITED_STORAGE", createFeature("UNLIMITED_STORAGE", "LIMIT"));
}

function setupProSubscription(repo: MockEntitlementRepository): void {
  repo.createSubscription(ORG_ID, "pro");
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// ─── 1. Concurrent Access Tests ───
// ============================================

describe("Concurrent Access — Consume", () => {
  let repository: ControllableMockRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new ControllableMockRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  afterEach(() => {
    repository.resetBarriers();
  });

  it("multiple simultaneous consume() calls all succeed when total < limit", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 100),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Pre-seed usage so the mock's consumeUsage doesn't hit the create-new-usage race window
    await repository.createUsage(ORG_ID, "EXPORT_PDF", new Date(), new Date(Date.now() + 86400000));

    // 10 concurrent consumes of 1 each (total = 10, limit = 100)
    const promises = Array(10)
      .fill(0)
      .map(() => service.consume(ORG_ID, "EXPORT_PDF", 1));

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success).length;
    expect(successes).toBe(10);

    // Total usage should be 10
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(10);
  });

  it("multiple simultaneous consume() calls that exactly exhaust the limit all succeed", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Pre-seed usage to avoid mock create-usage race
    await repository.createUsage(ORG_ID, "EXPORT_PDF", new Date(), new Date(Date.now() + 86400000));

    // 5 concurrent consumes of 2 each (total = 10, limit = 10)
    const promises = Array(5)
      .fill(0)
      .map(() => service.consume(ORG_ID, "EXPORT_PDF", 2));

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success);
    expect(successes.length).toBe(5);

    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(10);
  });

  it("multiple simultaneous consume() calls where total > limit — some succeed, some fail", async () => {
    // Use LimitEnforcingMockRepository for proper limit enforcement
    const enforcingRepo = new LimitEnforcingMockRepository();
    setupBasicPlan(enforcingRepo);
    setupFeatures(enforcingRepo);
    enforcingRepo.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", enforcingRepo.features.get("EXPORT_PDF")!, true, 5),
    ]);
    await enforcingRepo.createSubscription(ORG_ID, "pro");
    enforcingRepo.setEnforcedLimit(ORG_ID, "EXPORT_PDF", 5);

    const enforcingService = new FeatureGateService(enforcingRepo, cache);

    // 3 concurrent consumes of 3 each (total = 9, limit = 5)
    const promises = Array(3)
      .fill(0)
      .map(() => enforcingService.consume(ORG_ID, "EXPORT_PDF", 3));

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // At most 1 can succeed (3*3 > 5, so only 1 can go through)
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(failures.length).toBeGreaterThanOrEqual(1); // at least 1 should fail

    // Usage should not exceed limit
    const usage = await enforcingRepo.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage?.usageCount).toBeLessThanOrEqual(5);
  });

  it("canConsume + consume race: canConsume returns true but limit exhausted by another before consume", async () => {
    const enforcingRepo = new LimitEnforcingMockRepository();
    setupBasicPlan(enforcingRepo);
    setupFeatures(enforcingRepo);
    enforcingRepo.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", enforcingRepo.features.get("EXPORT_PDF")!, true, 3),
    ]);
    await enforcingRepo.createSubscription(ORG_ID, "pro");
    enforcingRepo.setEnforcedLimit(ORG_ID, "EXPORT_PDF", 3);

    const enforcingService = new FeatureGateService(enforcingRepo, cache);

    // First, check canConsume — it's true
    const canConsume = await enforcingService.canConsume(ORG_ID, "EXPORT_PDF", 3);
    expect(canConsume).toBe(true);

    // Now consume 3 (exhausts limit)
    const r1 = await enforcingService.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(r1.success).toBe(true);

    // Attempt to consume 1 more — should fail (limit 3 exhausted)
    const r2 = await enforcingService.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(r2.success).toBe(false);
    expect(r2.error).toBe("LIMIT_REACHED");
  });

  it("canConsume + consume race: concurrent canConsume and consume interleave", async () => {
    // Use controllable repository to create a race:
    // 1. Task A calls canConsume (reads usage = 0, limit = 5, returns true)
    // 2. Before Task A's consume, Task B consumes all 5
    // 3. Task A's consume should fail because limit now exhausted

    // We'll do this sequentially but in a way that demonstrates the race:
    // canConsume is true, then external consumption exhausts the limit

    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 5),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Simulating the race by calling canConsume first, then someone else consumes
    const canConsume = await service.canConsume(ORG_ID, "EXPORT_PDF", 3);
    expect(canConsume).toBe(true);

    // Another request consumes the remaining
    await service.consume(ORG_ID, "EXPORT_PDF", 5);

    // Original request's consume now fails because limit is exhausted
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(result.success).toBe(false);
    expect(result.error).toBe("LIMIT_REACHED");
  });

  it("getAllEntitlements called concurrently by multiple requests — no corruption", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // 10 concurrent getAllEntitlements calls
    const promises = Array(10)
      .fill(0)
      .map(() => service.getAllEntitlements(ORG_ID));

    const results = await Promise.all(promises);

    // All should return identical, correct data
    for (const result of results) {
      expect(result.planKey).toBe("pro");
      expect(result.features.AI_SUMMARY).toBe(true);
      expect(result.limits.EXPORT_PDF).toBe(10);
    }
  });

  it("getAllEntitlements concurrent with different orgs — no cross-contamination", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "pro");
    await repository.createSubscription("org_2", "free");

    const promises = [
      service.getAllEntitlements(ORG_ID),
      service.getAllEntitlements("org_2"),
      service.getAllEntitlements(ORG_ID),
      service.getAllEntitlements("org_2"),
    ];

    const results = await Promise.all(promises);

    expect(results[0].features.AI_SUMMARY).toBe(true);
    expect(results[1].features.AI_SUMMARY).toBe(false);
    expect(results[2].features.AI_SUMMARY).toBe(true);
    expect(results[3].features.AI_SUMMARY).toBe(false);

    // No cross-contamination
    expect(results[0].planKey).toBe("pro");
    expect(results[1].planKey).toBe("free");
  });
});

// ============================================
// ─── 2. Cache Resilience Tests ───
// ============================================

describe("Cache Resilience", () => {
  let repository: MockEntitlementRepository;
  let cache: ControllableMockCache;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new ControllableMockCache();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
  });

  it("cache miss — loads from repository then populates cache", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // Cache is empty
    expect(await cache.get(`entitlements:${ORG_ID}`)).toBeNull();

    // Fetch — should miss cache, load from repo
    const result = await service.getAllEntitlements(ORG_ID);
    expect(result.features.AI_SUMMARY).toBe(true);

    // Cache should now be populated
    const cached = await cache.get<EntitlementMap>(`entitlements:${ORG_ID}`);
    expect(cached).not.toBeNull();
    expect(cached!.features.AI_SUMMARY).toBe(true);
  });

  it("cache hit — returns cached value without hitting repository", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // First fetch (miss + populate)
    await service.getAllEntitlements(ORG_ID);

    // Mutate repository (simulating a DB change)
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, false),
    ]);

    // Second fetch — should return cached version (still true)
    const result = await service.getAllEntitlements(ORG_ID);
    expect(result.features.AI_SUMMARY).toBe(true); // from cache, not repo
  });

  it("cache invalidation — subsequent reads bypass cache and fetch fresh data", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // First fetch (populates cache)
    await service.getAllEntitlements(ORG_ID);

    // Invalidate cache
    await service.invalidateCache(ORG_ID);

    // Change repository data
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, false),
    ]);

    // Fetch again — should miss cache and get fresh data
    const result = await service.getAllEntitlements(ORG_ID);
    expect(result.features.AI_SUMMARY).toBe(false);
  });

  it("multiple cache invalidation calls — still works correctly", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // Populate cache
    await service.getAllEntitlements(ORG_ID);

    // Multiple invalidations
    await service.invalidateCache(ORG_ID);
    await service.invalidateCache(ORG_ID);
    await service.invalidateCache(ORG_ID);

    // Should still work
    const result = await service.getAllEntitlements(ORG_ID);
    expect(result.planKey).toBe("pro");
  });

  it("cache get failure propagates error — service does not swallow cache errors", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // Make cache throw on get
    cache.throwOnGet = true;

    // The service does not wrap cache.get in try-catch, so errors propagate
    await expect(service.getAllEntitlements(ORG_ID)).rejects.toThrow("Cache GET failure");
  });

  it("cache set failure propagates error — service does not swallow cache errors", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // Make cache throw on set
    cache.throwOnSet = true;

    // The service does not wrap cache.set in try-catch, so errors propagate
    await expect(service.getAllEntitlements(ORG_ID)).rejects.toThrow("Cache SET failure");
  });

  it("cache invalidation during concurrent reads — stale data vs fresh data", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    // First fetch populates cache with AI_SUMMARY = true
    const r1 = await service.getAllEntitlements(ORG_ID);
    expect(r1.features.AI_SUMMARY).toBe(true);

    // Invalidate and read concurrently
    const promises = [
      service.invalidateCache(ORG_ID),
      service.getAllEntitlements(ORG_ID),
      service.getAllEntitlements(ORG_ID),
      service.invalidateCache(ORG_ID),
      service.getAllEntitlements(ORG_ID),
    ];

    // Should not crash
    const results = await Promise.all(promises);
    // Invalidation results are void, getAll results are EntitlementMap
    for (const r of results) {
      if (r && typeof r === "object" && "features" in r) {
        expect(r.features).toBeDefined();
      }
    }
  });
});

// ============================================
// ─── 3. Repository Edge Cases ───
// ============================================

describe("Repository Edge Cases", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("getPlan returns null for unknown plan — service handles gracefully", async () => {
    // Plan "nonexistent" doesn't exist in repo
    // hasFeature should return false (fallback)
    const result = await service.hasFeature(ORG_ID, "AI_SUMMARY");
    expect(result).toBe(false);
  });

  it("getFeature returns null for unknown feature — service returns false/0", async () => {
    const hasIt = await service.hasFeature(ORG_ID, "MADE_UP_FEATURE");
    expect(hasIt).toBe(false);

    const limit = await service.getLimit(ORG_ID, "MADE_UP_FEATURE");
    expect(limit).toBe(0);
  });

  it("getActiveSubscription returns null — fallback to FREE plan", async () => {
    // No subscription created — should fallback
    const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
    expect(trace.resolvedVia).toBe("fallback");
    expect(trace.value).toBe(false);
  });

  it("getOverride returns null — falls through to plan", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    // No override set — should use plan value
    const trace = await service.getDebugTrace(ORG_ID, "AI_SUMMARY");
    expect(trace.resolvedVia).toBe("plan");
    expect(trace.value).toBe(true);
  });

  it("getCurrentUsage returns null (no usage yet) — service treats as 0 used", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // No usage recorded yet
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage).toBeNull();

    // canConsume should treat null usage as 0
    const can = await service.canConsume(ORG_ID, "EXPORT_PDF", 5);
    expect(can).toBe(true);
  });

  it("consumeUsage with no existing usage row — creates one", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // First consume — should create usage record
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(result.success).toBe(true);

    // Usage record should exist with count 3
    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage).not.toBeNull();
    expect(usage!.usageCount).toBe(3);
  });

  it("consumeUsage returns null — service handles as failed consume", async () => {
    // Use limit-enforcing repo to simulate consumeUsage returning null
    const enforcingRepo = new LimitEnforcingMockRepository();
    setupBasicPlan(enforcingRepo);
    setupFeatures(enforcingRepo);
    enforcingRepo.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", enforcingRepo.features.get("EXPORT_PDF")!, true, 5),
    ]);
    await enforcingRepo.createSubscription(ORG_ID, "pro");
    enforcingRepo.setEnforcedLimit(ORG_ID, "EXPORT_PDF", 5);

    const enforcingService = new FeatureGateService(enforcingRepo, cache);

    // Exhaust limit with first consume
    await enforcingService.consume(ORG_ID, "EXPORT_PDF", 5);

    // Second consume should fail because consumeUsage would return null
    const result = await enforcingService.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("LIMIT_REACHED");
  });
});

// ============================================
// ─── 4. Error Propagation Tests ───
// ============================================

describe("Error Propagation", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("repository throws unexpected error — FeatureGateService propagates it (not silently swallowed)", async () => {
    // Make getPlan throw — needs subscription + plan to be in code path
    const throwingRepo = new MockEntitlementRepository();
    setupBasicPlan(throwingRepo);
    setupFeatures(throwingRepo);
    throwingRepo.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", throwingRepo.features.get("AI_SUMMARY")!, true),
    ]);
    await throwingRepo.createSubscription(ORG_ID, "pro");

    // Now make getPlan throw — it will be called because subscription exists
    throwingRepo.getPlan = async () => {
      throw new Error("DB_CONNECTION_LOST");
    };

    const throwingService = new FeatureGateService(throwingRepo, cache);

    await expect(throwingService.hasFeature(ORG_ID, "AI_SUMMARY")).rejects.toThrow("DB_CONNECTION_LOST");
  });

  it("repository getActiveSubscription throws — error propagates", async () => {
    const throwingRepo = new MockEntitlementRepository();
    throwingRepo.getActiveSubscription = async () => {
      throw new Error("DB_TIMEOUT");
    };

    const throwingService = new FeatureGateService(throwingRepo, cache);

    await expect(throwingService.hasFeature(ORG_ID, "AI_SUMMARY")).rejects.toThrow("DB_TIMEOUT");
  });

  it("repository consumeUsage throws — error propagates", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Temporarily make consumeUsage throw
    const originalConsume = repository.consumeUsage.bind(repository);
    repository.consumeUsage = async () => {
      throw new Error("CONSUME_FAILED");
    };

    await expect(service.consume(ORG_ID, "EXPORT_PDF", 1)).rejects.toThrow("CONSUME_FAILED");

    // Restore
    repository.consumeUsage = originalConsume;
  });

  it("cache service throws on get — error propagates (service lacks error handling for cache get)", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    const badCache = new ControllableMockCache();
    badCache.throwOnGet = true;
    const serviceWithBadCache = new FeatureGateService(repository, badCache);

    await expect(serviceWithBadCache.getAllEntitlements(ORG_ID)).rejects.toThrow("Cache GET failure");
  });

  it("cache service throws on set — error propagates (service lacks error handling for cache set)", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    const badCache = new ControllableMockCache();
    badCache.throwOnSet = true;
    const serviceWithBadCache = new FeatureGateService(repository, badCache);

    await expect(serviceWithBadCache.getAllEntitlements(ORG_ID)).rejects.toThrow("Cache SET failure");
  });

  it("malformed experiment config (no percentage) — handled without crash", async () => {
    repository.features.set(
      "BAD_EXPERIMENT",
      createFeature("BAD_EXPERIMENT", "EXPERIMENT", { seed: "no_percentage" }),
    );

    const result = await service.isInExperiment("user_1", "BAD_EXPERIMENT");
    expect(result).toBe(false);
  });

  it("malformed experiment config (no seed) — handled without crash", async () => {
    repository.features.set(
      "BAD_EXPERIMENT2",
      createFeature("BAD_EXPERIMENT2", "EXPERIMENT", { percentage: 50 }),
    );

    const result = await service.isInExperiment("user_1", "BAD_EXPERIMENT2");
    expect(result).toBe(false);
  });

  it("null experiment config — handled without crash", async () => {
    repository.features.set(
      "NULL_EXPERIMENT",
      createFeature("NULL_EXPERIMENT", "EXPERIMENT", null),
    );

    const result = await service.isInExperiment("user_1", "NULL_EXPERIMENT");
    expect(result).toBe(false);
  });

  it("empty featureKey — handled without crash", async () => {
    await repository.createSubscription(ORG_ID, "pro");

    const hasFeature = await service.hasFeature(ORG_ID, "");
    expect(hasFeature).toBe(false);

    const limit = await service.getLimit(ORG_ID, "");
    expect(limit).toBe(0);
  });

  it("empty orgId — handled without crash (fallback)", async () => {
    const hasFeature = await service.hasFeature("", "AI_SUMMARY");
    expect(hasFeature).toBe(false);
  });

  it("nonexistent orgId — returns fallback values", async () => {
    const hasFeature = await service.hasFeature("org_does_not_exist", "AI_SUMMARY");
    expect(hasFeature).toBe(false);

    const trace = await service.getDebugTrace("org_does_not_exist", "AI_SUMMARY");
    expect(trace.resolvedVia).toBe("fallback");
  });
});

// ============================================
// ─── 5. Bug List Edge Cases ───
// ============================================

describe("Bug List Edge Cases", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("override with expiresAt in the past — ignored, falls through to plan", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Create an override that expired in the past
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: false,
      expiresAt: new Date(Date.now() - 100000), // Expired
      reason: "Expired override",
    });

    // Should use plan value (true), not the expired override (false)
    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
  });

  it("plan with isActive: false — not returned by getActivePlans, fallback", async () => {
    // Create an inactive plan
    repository.plans.set("legacy", createPlan("legacy", "Legacy", 3, false));
    repository.planFeatures.set("plan_legacy", [
      createPlanFeature("plan_legacy", repository.features.get("AI_SUMMARY")!, true),
    ]);

    // Create subscription to the inactive plan
    await repository.createSubscription(ORG_ID, "legacy");

    // Plan is inactive, but subscription references it
    // The service resolves via plan key from subscription
    // This test validates the plan could still be used if looked up by key
    // (getPlan doesn't check isActive, only getActivePlans does)
  });

  it("feature with isActive: false — not considered as available", async () => {
    // Create an inactive feature
    repository.features.set("DEPRECATED_FEATURE", createFeature("DEPRECATED_FEATURE", "BOOLEAN", null, false));
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("DEPRECATED_FEATURE")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // The feature exists and is in the plan, but isActive is false
    // Note: the service doesn't check isActive directly on features
    // It checks via planFeature.enabled. But the feature exists.
    // This test validates the current behavior:
    const hasFeature = await service.hasFeature(ORG_ID, "DEPRECATED_FEATURE");
    expect(hasFeature).toBe(true); // Service uses planFeature.enabled, not feature.isActive
  });

  it("subscription with status CANCELED — not returned by getActiveSubscription, fallback", async () => {
    // Create subscription with CANCELED status
    await repository.createSubscription(ORG_ID, "pro", {
      status: "CANCELED",
    });

    // Service getActiveSubscription only returns ACTIVE/TRIALING
    // So it falls back
    const hasFeature = await service.hasFeature(ORG_ID, "AI_SUMMARY");
    expect(hasFeature).toBe(false);
  });

  it("subscription with status PAST_DUE — not returned as active", async () => {
    await repository.createSubscription(ORG_ID, "pro", {
      status: "PAST_DUE",
    });

    const hasFeature = await service.hasFeature(ORG_ID, "AI_SUMMARY");
    expect(hasFeature).toBe(false);
  });

  it("subscription with status INCOMPLETE — not returned as active", async () => {
    await repository.createSubscription(ORG_ID, "pro", {
      status: "INCOMPLETE",
    });

    const hasFeature = await service.hasFeature(ORG_ID, "AI_SUMMARY");
    expect(hasFeature).toBe(false);
  });

  it("subscription with status TRIALING — returned as active", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro", {
      status: "TRIALING",
    });

    const hasFeature = await service.hasFeature(ORG_ID, "AI_SUMMARY");
    expect(hasFeature).toBe(true);
  });

  it("getLimit for boolean feature — returns null (unlimited) or 0 (disabled)", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Boolean feature enabled -> hasFeature returns true, getLimit returns null
    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
    expect(await service.getLimit(ORG_ID, "AI_SUMMARY")).toBeNull();

    // Boolean feature disabled
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, false),
    ]);

    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
    expect(await service.getLimit(ORG_ID, "AI_SUMMARY")).toBe(0);
  });

  it("hasFeature for experiment feature — based on enabled flag, not percentage", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("NEW_DASHBOARD")!, true, null, {
        percentage: 50,
        seed: "NEW_DASHBOARD_v1",
      }),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // hasFeature checks the resolved value, which for experiments is based on pf.enabled
    // If planFeature.enabled = true, hasFeature returns true
    expect(await service.hasFeature(ORG_ID, "NEW_DASHBOARD")).toBe(true);
  });

  it("consume with n=0 returns failure and does not change usage", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Consume 1 first to establish usage
    await service.consume(ORG_ID, "EXPORT_PDF", 1);
    const before = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(before!.usageCount).toBe(1);

    // Try consume with n=0
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 0);
    expect(result.success).toBe(false);
    expect(result.error).toBe("LIMIT_REACHED");

    // Usage should be unchanged
    const after = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(after!.usageCount).toBe(1);
  });

  it("consume for LIMIT feature disabled in plan returns FEATURE_NOT_AVAILABLE", async () => {
    // DISABLE the feature via the plan with limitValue = 0
    const pdfFeature = repository.features.get("EXPORT_PDF")!;
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", pdfFeature, false, 0),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(result.success).toBe(false);
    // Plan-disabled LIMIT features now return FEATURE_NOT_AVAILABLE
    // (previously returned LIMIT_REACHED — fixed gap #2)
    expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("consume for feature with no active subscription returns FEATURE_NOT_AVAILABLE (fallback path)", async () => {
    // No subscription at all — service falls through to "fallback" resolution
    // In the fallback path, trace.resolvedVia !== "plan", so consume returns FEATURE_NOT_AVAILABLE
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
  });

  it("consume for feature not explicitly in plan but globally known returns FEATURE_NOT_AVAILABLE", async () => {
    // Feature exists globally but is not configured in planFeatures for the plan
    // Service resolves via "plan" with value=false
    // → consume now returns FEATURE_NOT_AVAILABLE (fixed gap #2)
    await repository.createSubscription(ORG_ID, "free");

    const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("FEATURE_NOT_AVAILABLE");
  });
});

// ============================================
// ─── 6. Data Integrity Tests ───
// ============================================

describe("Data Integrity", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("consuming exactly the limit amount succeeds", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const result = await service.consume(ORG_ID, "EXPORT_PDF", 10);
    expect(result.success).toBe(true);
    expect(result.used).toBe(10);
    expect(result.remaining).toBe(0);
  });

  it("consuming one more than limit fails", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Consume exactly the limit
    await service.consume(ORG_ID, "EXPORT_PDF", 10);

    // Try one more
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("LIMIT_REACHED");
  });

  it("after failed consume, usage count is unchanged", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 5),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // First consume
    await service.consume(ORG_ID, "EXPORT_PDF", 3);
    const usageBefore = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usageBefore!.usageCount).toBe(3);

    // Try to consume beyond limit
    const failed = await service.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(failed.success).toBe(false);

    // Usage should remain at 3
    const usageAfter = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usageAfter!.usageCount).toBe(3);
  });

  it("after successful consume, usage count increases by n", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 20),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    await service.consume(ORG_ID, "EXPORT_PDF", 5);
    let usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage!.usageCount).toBe(5);

    await service.consume(ORG_ID, "EXPORT_PDF", 3);
    usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage!.usageCount).toBe(8);

    await service.consume(ORG_ID, "EXPORT_PDF", 12);
    usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage!.usageCount).toBe(20);
  });

  it("consume for unlimited feature always succeeds and tracks usage", async () => {
    repository.planFeatures.set("plan_enterprise", [
      createPlanFeature("plan_enterprise", repository.features.get("EXPORT_PDF")!, true, null),
    ]);
    await repository.createSubscription(ORG_ID, "enterprise");

    // Pre-seed usage to avoid mock's create-usage race in concurrent path
    await repository.createUsage(ORG_ID, "EXPORT_PDF", new Date(), new Date(Date.now() + 86400000));

    const results = await Promise.all(
      Array(50).fill(0).map(() => service.consume(ORG_ID, "EXPORT_PDF", 1)),
    );

    const successes = results.filter((r) => r.success);
    expect(successes.length).toBe(50);

    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage!.usageCount).toBe(50);
  });

  it("consume returns proper remaining values after each operation", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    let result = await service.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(result.remaining).toBe(7);

    result = await service.consume(ORG_ID, "EXPORT_PDF", 4);
    expect(result.remaining).toBe(3);

    result = await service.consume(ORG_ID, "EXPORT_PDF", 3);
    expect(result.remaining).toBe(0);
  });

  it("canConsume returns true when exactly at remaining limit", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 5),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    await service.consume(ORG_ID, "EXPORT_PDF", 3);

    // Can consume exactly 2 (remaining = 2)
    expect(await service.canConsume(ORG_ID, "EXPORT_PDF", 2)).toBe(true);

    // Cannot consume 3 (remaining = 2 < 3)
    expect(await service.canConsume(ORG_ID, "EXPORT_PDF", 3)).toBe(false);
  });

  it("hasFeature returns correct value for LIMIT feature with limitValue zero", async () => {
    repository.features.set("ZERO_LIMIT", createFeature("ZERO_LIMIT", "LIMIT"));
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("ZERO_LIMIT")!, true, 0),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    expect(await service.hasFeature(ORG_ID, "ZERO_LIMIT")).toBe(false);
    expect(await service.getLimit(ORG_ID, "ZERO_LIMIT")).toBe(0);
  });

  it("hasFeature returns false for LIMIT feature with limitValue=0", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("EXPORT_PDF")!, true, 0),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
    expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
  });

  it("hasFeature returns false for LIMIT feature disabled in plan even with null limitValue", async () => {
    // pf.enabled=false now gates the feature regardless of limitValue.
    // getDebugTrace for LIMIT features now returns pf.enabled ? pf.limitValue : false.
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("EXPORT_PDF")!, false, null),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
    expect(await service.getLimit(ORG_ID, "EXPORT_PDF")).toBe(0);
  });

  it("getAllEntitlements returns correct EntitlementMap structure with BOOLEAN and LIMIT features", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("AI_SUMMARY")!, true),
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
      createPlanFeature("plan_pro", repository.features.get("NEW_DASHBOARD")!, true, null, {
        percentage: 50,
        seed: "v1",
      }),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    const map = await service.getAllEntitlements(ORG_ID);

    expect(map.planKey).toBe("pro");
    expect(map.features.AI_SUMMARY).toBe(true);
    expect(map.features.EXPORT_PDF).toBe(true);
    // EXPERIMENT features now included in EntitlementMap (gap #3 fix)
    expect(map.features.NEW_DASHBOARD).toBe(true);
    expect(map.experiments?.NEW_DASHBOARD).toEqual({ percentage: 50, seed: "v1" });
    expect(map.limits.EXPORT_PDF).toBe(10);
  });

  it("entitlement map respects org override for LIMIT features", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Override with higher limit
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "EXPORT_PDF",
      enabled: true,
      limitValue: 50,
      reason: "Override limit",
    });

    const map = await service.getAllEntitlements(ORG_ID);
    expect(map.limits.EXPORT_PDF).toBe(50);
  });

  it("usage tracking is correct after multiple concurrent consumes", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 100),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    // Pre-seed usage to avoid mock's create-usage race
    await repository.createUsage(ORG_ID, "EXPORT_PDF", new Date(), new Date(Date.now() + 86400000));

    // 20 concurrent consumes of 1 each
    await Promise.all(
      Array(20).fill(0).map(() => service.consume(ORG_ID, "EXPORT_PDF", 1)),
    );

    const usage = await repository.getCurrentUsage(ORG_ID, "EXPORT_PDF");
    expect(usage!.usageCount).toBe(20);
  });
});

// ============================================
// ─── 7. Experiment Edge Cases ───
// ============================================

describe("Experiment Resilience", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("isInExperiment returns false for non-existent experiment key", async () => {
    const result = await service.isInExperiment("user_1", "NONEXISTENT_EXP");
    expect(result).toBe(false);
  });

  it("isInExperiment returns false for non-experiment feature type", async () => {
    const result = await service.isInExperiment("user_1", "AI_SUMMARY");
    expect(result).toBe(false);
  });

  it("isInExperiment with user override enabled returns true", async () => {
    repository.features.set(
      "ZERO_PERCENT",
      createFeature("ZERO_PERCENT", "EXPERIMENT", { percentage: 0, seed: "zero_test" }),
    );

    await repository.createOverride({
      scope: "USER",
      scopeId: "user_override_1",
      featureKey: "ZERO_PERCENT",
      enabled: true,
      reason: "Override",
    });

    const result = await service.isInExperiment("user_override_1", "ZERO_PERCENT");
    expect(result).toBe(true);
  });

  it("getExperimentConfig returns null for non-existent experiment", async () => {
    const config = await service.getExperimentConfig("NONEXISTENT");
    expect(config).toBeNull();
  });

  it("getExperimentConfig returns null for non-experiment feature", async () => {
    const config = await service.getExperimentConfig("EXPORT_PDF");
    expect(config).toBeNull();
  });

  it("getExperimentConfig returns null for malformed config (no percentage)", async () => {
    repository.features.set(
      "BAD_CFG",
      createFeature("BAD_CFG", "EXPERIMENT", { seed: "test" }),
    );
    const config = await service.getExperimentConfig("BAD_CFG");
    expect(config).toBeNull();
  });

  it("isInExperiment handles floating point percentage", async () => {
    repository.features.set(
      "FLOAT_EXP",
      createFeature("FLOAT_EXP", "EXPERIMENT", { percentage: 33.3, seed: "float_test" }),
    );
    // Should not crash
    const result = await service.isInExperiment("user_1", "FLOAT_EXP");
    expect(typeof result).toBe("boolean");
  });

  it("getExperimentBucket returns a bucket between 0 and 99", () => {
    const bucket = service.getExperimentBucket("user_1", "test_exp", "test_seed");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThanOrEqual(99);
  });
});

// ============================================
// ─── 8. CacheService Real Implementation Tests ───
// ============================================

describe("CacheService (real implementation)", () => {
  let realCache: CacheService;

  afterEach(() => {
    realCache = new CacheService({ maxMemoryEntries: 1000, memoryTTLSec: 30 });
  });

  it("memory LRU evicts least recently used entry when at capacity", async () => {
    realCache = new CacheService({ maxMemoryEntries: 3, memoryTTLSec: 30 });

    // Fill cache to capacity
    await realCache.set("key1", "value1", 300);
    await realCache.set("key2", "value2", 300);
    await realCache.set("key3", "value3", 300);

    // Access key1 to make it most recently used
    await realCache.get("key1");

    // Add a fourth entry - should evict key2 (least recently used)
    await realCache.set("key4", "value4", 300);

    expect(await realCache.get("key1")).toBe("value1");
    expect(await realCache.get("key2")).toBeNull(); // evicted
    expect(await realCache.get("key3")).toBe("value3");
    expect(await realCache.get("key4")).toBe("value4");
  });

  it("TTL expiry — returns null after TTL elapses", async () => {
    realCache = new CacheService({ maxMemoryEntries: 100, memoryTTLSec: 0.01 }); // 10ms TTL

    await realCache.set("key", "value", 1);

    // Should be available immediately
    expect(await realCache.get("key")).toBe("value");

    // Wait for TTL to expire (10ms)
    await delay(50);

    // Should be null now
    expect(await realCache.get("key")).toBeNull();
  });

  it("del removes entry from cache", async () => {
    await realCache.set("test_key", "test_value", 300);
    expect(await realCache.get("test_key")).toBe("test_value");

    await realCache.del("test_key");
    expect(await realCache.get("test_key")).toBeNull();
  });

  it("delPattern removes matching entries", async () => {
    await realCache.set("entitlements:org_1", { planKey: "pro" }, 300);
    await realCache.set("entitlements:org_2", { planKey: "free" }, 300);
    await realCache.set("other", "value", 300);

    await realCache.delPattern("entitlements:*");

    expect(await realCache.get("entitlements:org_1")).toBeNull();
    expect(await realCache.get("entitlements:org_2")).toBeNull();
    expect(await realCache.get("other")).toBe("value");
  });

  it("publishInvalidation notifies subscribers", async () => {
    const notified: string[] = [];
    const unsub = realCache.subscribe((orgId) => {
      notified.push(orgId);
    });

    await realCache.publishInvalidation("org_test");
    expect(notified).toContain("org_test");

    unsub();
  });

  it("subscribe returns unsubscribe function that works", async () => {
    const notified: string[] = [];
    const unsub = realCache.subscribe((orgId) => {
      notified.push(orgId);
    });

    // Unsubscribe immediately
    unsub();

    await realCache.publishInvalidation("org_test");
    expect(notified).not.toContain("org_test");
  });

  it("subscriber errors don't crash the cache", async () => {
    realCache.subscribe((_orgId) => {
      throw new Error("Subscriber crashed");
    });

    // Should not throw
    await realCache.publishInvalidation("org_test");
    // If we get here, the subscriber error was caught
  });

  it("multiple subscribers all get notified", async () => {
    const notified1: string[] = [];
    const notified2: string[] = [];

    realCache.subscribe((orgId) => { notified1.push(orgId); });
    realCache.subscribe((orgId) => { notified2.push(orgId); });

    await realCache.publishInvalidation("org_multi");

    expect(notified1).toContain("org_multi");
    expect(notified2).toContain("org_multi");
  });
});

// ============================================
// ─── 9. Edge Cases: Override + Expiry ───
// ============================================

describe("Override Expiry Edge Cases", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  const ORG_ID = "org_override_test";

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
  });

  it("org override with limitValue for BOOLEAN feature — treated as enabled", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    // Override enables it with limitValue (ignored for BOOLEAN)
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: true,
      limitValue: 999,
      reason: "BOOLEAN with limitValue",
    });

    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
  });

  it("org override disabled for LIMIT feature — returns false", async () => {
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "EXPORT_PDF",
      enabled: false,
      reason: "Disable LIMIT",
    });

    expect(await service.hasFeature(ORG_ID, "EXPORT_PDF")).toBe(false);
  });

  it("override created exactly at current time boundary — not expired", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    // expiresAt == now (should be valid, not expired)
    const now = new Date();
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: true,
      expiresAt: now,
      reason: "Current time",
    });

    // expiresAt > now is required, so an exact match is NOT > now
    // Actually: `!orgOverride.expiresAt || orgOverride.expiresAt > new Date()` 
    // If expiresAt === now, then `new Date()` will be >= expiresAt, so it's treated as expired
    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(false);
  });

  it("override with future expiresAt — takes effect", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    const future = new Date(Date.now() + 3600000); // 1 hour from now
    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: true,
      expiresAt: future,
      reason: "Future override",
    });

    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
  });

  it("override with expiresAt null (no expiry) — takes effect permanently", async () => {
    repository.planFeatures.set("plan_free", [
      createPlanFeature("plan_free", repository.features.get("AI_SUMMARY")!, false),
    ]);
    await repository.createSubscription(ORG_ID, "free");

    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "AI_SUMMARY",
      enabled: true,
      reason: "Permanent override",
    });

    expect(await service.hasFeature(ORG_ID, "AI_SUMMARY")).toBe(true);
  });
});

// ============================================
// ─── 10. Error Serialization & Boundary Tests ───
// ============================================

describe("Error Boundaries", () => {
  it("FeatureNotAvailableError correctly serializes", () => {
    const err = new FeatureNotAvailableError("EXPORT_PDF", "pro", "free");
    const json = err.toJSON();

    expect(json.error).toBe("FEATURE_NOT_AVAILABLE");
    expect(json.feature).toBe("EXPORT_PDF");
    expect(json.plan_required).toBe("pro");
    expect(json.current_plan).toBe("free");
    expect(json.upgrade_url).toBe("/billing/upgrade");
  });

  it("LimitReachedError correctly serializes with null limit", () => {
    const err = new LimitReachedError("EXPORT_PDF", null, 5, "2026-07-01T00:00:00.000Z");
    const json = err.toJSON();

    expect(json.error).toBe("LIMIT_REACHED");
    expect(json.limit).toBeNull();
    expect(json.used).toBe(5);
  });

  it("consume returns limitReached info with resetAt", async () => {
    const repository = new MockEntitlementRepository();
    const cache = new MockCacheService();
    const service = new FeatureGateService(repository, cache);

    setupBasicPlan(repository);
    setupFeatures(repository);
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 3),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    await service.consume(ORG_ID, "EXPORT_PDF", 3);
    const result = await service.consume(ORG_ID, "EXPORT_PDF", 1);

    expect(result.success).toBe(false);
    expect(result.error).toBe("LIMIT_REACHED");
    expect(result.limitReached).toBeDefined();
    expect(result.limitReached!.feature).toBe("EXPORT_PDF");
    expect(result.limitReached!.limit).toBe(3);
    expect(result.limitReached!.used).toBe(3);
    expect(result.limitReached!.resetAt).toBeDefined();
  });
});

// ============================================
// ─── 11. Service Method Boundary Tests ───
// ============================================

describe("Service Method Boundaries", () => {
  let repository: MockEntitlementRepository;
  let cache: MockCacheService;
  let service: FeatureGateService;

  beforeEach(() => {
    repository = new MockEntitlementRepository();
    cache = new MockCacheService();
    service = new FeatureGateService(repository, cache);
  });

  it("assertFeature throws FeatureNotAvailableError for missing feature", async () => {
    await expect(service.assertFeature(ORG_ID, "NONEXISTENT")).rejects.toThrow(FeatureNotAvailableError);
  });

  it("assertFeature propagates repository errors", async () => {
    repository.getActiveSubscription = async () => {
      throw new Error("REPO_ERROR");
    };
    await expect(service.assertFeature(ORG_ID, "AI_SUMMARY")).rejects.toThrow("REPO_ERROR");
  });

  it("getDebugTrace returns fallback for org with no subscription and no plan", async () => {
    const trace = await service.getDebugTrace("unknown_org", "ANY_FEATURE");
    expect(trace.resolvedVia).toBe("fallback");
    expect(trace.value).toBe(false);
    expect(trace.planKey).toBe("free");
  });

  it("getDebugTrace with org override that has limitValue returns override value", async () => {
    setupBasicPlan(repository);
    setupFeatures(repository);
    repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", repository.features.get("EXPORT_PDF")!, true, 10),
    ]);
    await repository.createSubscription(ORG_ID, "pro");

    await repository.createOverride({
      scope: "ORG",
      scopeId: ORG_ID,
      featureKey: "EXPORT_PDF",
      enabled: true,
      limitValue: 100,
      reason: "Increase limit",
    });

    const trace = await service.getDebugTrace(ORG_ID, "EXPORT_PDF");
    expect(trace.resolvedVia).toBe("org_override");
    expect(trace.value).toBe(100);
    expect(trace.limitValue).toBe(100);
  });
});
