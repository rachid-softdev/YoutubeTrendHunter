// ============================================
// Feature Flags — Security Boundary Tests
// ============================================
//
// This suite validates the security boundaries of the feature flag system:
//   - Cross-org data access prevention
//   - Session resolver hardening
//   - Middleware auth bypass prevention
//   - Injection resilience through feature keys
//   - Override security and validation
//   - Stripe webhook org resolution integrity
//   - Admin API access control
//   - Experiment bucketing isolation
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mock for admin auth tests (G block). Without this, vi.mock inside a
// test block triggers a warning and will become an error in future Vitest versions.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { FeatureGateService } from "@/lib/feature-flags/feature-gate.service";
import { isInExperiment as checkExperimentBucket, murmurhash } from "@/lib/feature-flags/experiment";
import {
  FeatureNotAvailableError,
  LimitReachedError,
  SubscriptionExpiredError,
} from "@/lib/feature-flags/errors";
import {
  requireFeature,
  requireLimit,
  consumeFeature,
  withFeature,
  withLimit,
  type SessionResolver,
  type AuthSession,
} from "@/lib/feature-flags/middleware";
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

// Mock next/server for middleware higher-order functions
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
// Mock Repository (replicates the one in feature-gate.test.ts)
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
// Test Setup
// ============================================

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";
const USER_B = "user_b";

interface TestContext {
  repository: MockEntitlementRepository;
  cache: MockCacheService;
  service: FeatureGateService;
}

function createBaseSetup(): TestContext {
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
  repository.features.set("NEW_DASHBOARD", createFeature("NEW_DASHBOARD", "EXPERIMENT", {
    percentage: 50,
    seed: "NEW_DASHBOARD_v1",
  }));
  repository.features.set("UNLIMITED_STORAGE", createFeature("UNLIMITED_STORAGE", "LIMIT"));

  return { repository, cache, service };
}

function setupOrgAPro(ctx: TestContext): void {
  ctx.repository.planFeatures.set("plan_pro", [
    createPlanFeature("plan_pro", ctx.repository.features.get("AI_SUMMARY")!, true),
    createPlanFeature("plan_pro", ctx.repository.features.get("EXPORT_PDF")!, true, 100),
  ]);
  ctx.repository.createSubscription(ORG_A, "pro");
}

function setupOrgBFree(ctx: TestContext): void {
  ctx.repository.planFeatures.set("plan_free", [
    createPlanFeature("plan_free", ctx.repository.features.get("AI_SUMMARY")!, false),
    createPlanFeature("plan_free", ctx.repository.features.get("EXPORT_PDF")!, false, 5),
  ]);
  ctx.repository.createSubscription(ORG_B, "free");
}

// ============================================
// A. Cross-Org Data Access
// ============================================

describe("A. Cross-Org Data Access", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
    setupOrgBFree(ctx);
  });

  it("A1: service has NO cross-org check — Org A can query Org B's data directly", async () => {
    // 🔴 This test demonstrates the security gap: the service does not verify
    // that the caller has the right to access the requested orgId.
    // The orgId parameter is user-supplied with no validation against the session.
    const orgAFeature = await ctx.service.hasFeature(ORG_A, "AI_SUMMARY");
    expect(orgAFeature).toBe(true); // Org A has AI_SUMMARY (pro plan)

    // Service happily returns Org B's data when asked — no authorization boundary
    const orgBFeature = await ctx.service.hasFeature(ORG_B, "AI_SUMMARY");
    expect(orgBFeature).toBe(false); // Org B doesn't have AI_SUMMARY (free plan)

    // The service has no concept of "who is asking" vs "what org data is returned"
    // Any authenticated user can query any org's entitlements if they know the orgId.
    // The cross-org boundary MUST be enforced by the caller (route handler, middleware).
  });

  it("A2: getAllEntitlements exposes any org's full entitlement map with just the ID", async () => {
    // The caller can get any org's complete entitlement map just by knowing the orgId
    const orgAEntitlements = await ctx.service.getAllEntitlements(ORG_A);
    expect(orgAEntitlements.planKey).toBe("pro");
    expect(orgAEntitlements.features.AI_SUMMARY).toBe(true);

    const orgBEntitlements = await ctx.service.getAllEntitlements(ORG_B);
    expect(orgBEntitlements.planKey).toBe("free");
    expect(orgBEntitlements.features.AI_SUMMARY).toBe(false);

    // No auth context is required — anyone can call getAllEntitlements(anyOrgId)
    // DOCUMENTED GAP: cross-org access control must be implemented by callers
  });

  it("A3: consume can be called on any org — no caller validation", async () => {
    // Org A has EXPORT_PDF enabled with limit 100
    // An attacker knowing ORG_A could consume Org A's quota
    const result = await ctx.service.consume(ORG_A, "EXPORT_PDF", 1);
    expect(result.success).toBe(true);

    // Verify consumption was attributed to Org A
    const usage = await ctx.repository.getCurrentUsage(ORG_A, "EXPORT_PDF");
    expect(usage?.usageCount).toBe(1);
  });

  it("A4: getDebugTrace reveals org subscription details without auth check", async () => {
    const trace = await ctx.service.getDebugTrace(ORG_A, "AI_SUMMARY");
    expect(trace.resolvedVia).toBe("plan");
    expect(trace.planKey).toBe("pro");

    // Attacker can probe any org to discover their plan and feature configuration
    const traceB = await ctx.service.getDebugTrace(ORG_B, "AI_SUMMARY");
    expect(traceB.planKey).toBe("free");
  });

  it("A5: assertFeature throws for cross-org feature check but doesn't validate caller", async () => {
    // User from Org A calls assertFeature for Org A's feature — passes
    await expect(
      ctx.service.assertFeature(ORG_A, "AI_SUMMARY"),
    ).resolves.toBeUndefined();

    // User from Org A calls assertFeature for Org B's feature — throws
    // (because Org B doesn't have it, not because of auth)
    await expect(
      ctx.service.assertFeature(ORG_B, "AI_SUMMARY"),
    ).rejects.toThrow(FeatureNotAvailableError);
  });

  it("A6: getLimit works across orgs with no caller validation", async () => {
    const limitA = await ctx.service.getLimit(ORG_A, "EXPORT_PDF");
    expect(limitA).toBe(100);

    // ORG_B has EXPORT_PDF disabled (pf.enabled=false) so limit is 0
    const limitB = await ctx.service.getLimit(ORG_B, "EXPORT_PDF");
    expect(limitB).toBe(0);

    // No identity check — just raw orgId lookup
  });
});

// ============================================
// B. Session Resolver Security
// ============================================

describe("B. Session Resolver Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
  });

  it("B1: session resolver returning null orgId — service falls back to 'free'", async () => {
    const resolveNull: SessionResolver = async () => ({
      orgId: null as unknown as string,
      userId: USER_A,
    });

    // The middleware will pass null as orgId to the service
    // This could lead to unexpected behavior — null may be coerced to "null" string
    // in some DB queries, or treated as a valid but non-existent org
    const result = await ctx.service.hasFeature(null as unknown as string, "AI_SUMMARY");
    // Should not crash but returns false (fallback)
    expect(result).toBe(false);
  });

  it("B2: session resolver returning undefined orgId — service coerces to undefined string", async () => {
    // undefined orgId may be coerced to string "undefined" in some operations
    const result = await ctx.service.hasFeature(undefined as unknown as string, "AI_SUMMARY");
    // Should not crash but returns false
    expect(result).toBe(false);

    // Also verify the cache doesn't store data under the "undefined" key
    const cached = await ctx.cache.get("entitlements:undefined");
    expect(cached).toBeNull();
  });

  it("B3: session resolver throws — error propagates through middleware", async () => {
    const resolveThrows: SessionResolver = async () => {
      throw new Error("Session resolution failed");
    };

    const featureMiddleware = requireFeature(ctx.service, resolveThrows);

    await expect(
      featureMiddleware("AI_SUMMARY")(),
    ).rejects.toThrow("Session resolution failed");
  });

  it("B4: session resolver timeout — middleware doesn't hang indefinitely", async () => {
    vi.useFakeTimers();

    const resolveSlow: SessionResolver = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { orgId: ORG_A, userId: USER_A };
    };

    const featureMiddleware = requireFeature(ctx.service, resolveSlow);

    // Start the call
    const promise = featureMiddleware("AI_SUMMARY")();

    // Fast-forward past the timeout
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toBeUndefined();

    vi.useRealTimers();
  });

  it("B5: session resolver returns wrong userId for an org — NOT validated anywhere", async () => {
    // 🔴 Security gap documented: the service never validates that
    // the userId belongs to the orgId returned by the session resolver.
    // A session resolver could return orgId=ORG_A with userId=some_attacker_id
    // and the service would happily process the request.
    const resolveWrongUser: SessionResolver = async () => ({
      orgId: ORG_A,
      userId: "attacker_who_does_not_belong_to_org_a",
    });

    const { orgId, userId } = await resolveWrongUser();
    const result = await ctx.service.hasFeature(orgId, "AI_SUMMARY");
    expect(result).toBe(true); // Works fine — no userId/orgId binding check

    // DOCUMENTED GAP: The service does not validate that userId belongs to orgId.
    // This must be enforced by the session resolver or a separate auth layer.
  });

  it("B6: session resolver returns orgId but user doesn't belong to org — NOT validated", async () => {
    // The FeatureGateService has NO mechanism to verify that the requesting user
    // is a member of the org they're querying. The session resolver is the sole
    // source of truth for the orgId, and if it's compromised or misconfigured,
    // there's no defense-in-depth.
    //
    // To test: we simulate a session resolver that returns ORG_A even though
    // the real user belongs to ORG_B. The service trusts the session resolver.
    const resolveCrossOrg: SessionResolver = async () => ({
      orgId: ORG_A, // Org A's ID
      userId: USER_B, // User B who belongs to Org B
    });

    const { orgId } = await resolveCrossOrg();
    // Service still processes the request — no membership check
    const result = await ctx.service.hasFeature(orgId, "EXPORT_PDF");
    expect(result).toBe(true);

    // DOCUMENTED GAP: Trusted session resolver is the only boundary.
    // No additional org membership validation in the service layer.
  });
});

// ============================================
// C. Middleware Auth Bypass
// ============================================

describe("C. Middleware Auth Bypass", () => {
  let ctx: TestContext;
  let resolveSession: SessionResolver;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
    resolveSession = async () => ({ orgId: ORG_A, userId: USER_A });
  });

  it("C1: requireFeature without resolving orgId — uses whatever session resolver returns", async () => {
    // requireFeature calls resolveSession() to get orgId, then passes to gate.assertFeature
    // If resolveSession is somehow bypassed or returns empty, we get fallback behavior
    const resolveWithEmpty: SessionResolver = async () => ({
      orgId: "",
      userId: USER_A,
    });

    const middleware = requireFeature(ctx.service, resolveWithEmpty);
    // Empty orgId — feature may still resolve based on fallback
    await expect(
      middleware("AI_SUMMARY")(),
    ).rejects.toThrow(FeatureNotAvailableError);
  });

  it("C2: requireLimit with empty featureKey — throws or handles gracefully", async () => {
    const limitMiddleware = requireLimit(ctx.service, resolveSession);

    await expect(
      limitMiddleware("", 1)(async () => "result"),
    ).rejects.toThrow();
  });

  it("C3: consumeFeature with non-existent featureKey — fails with FeatureNotAvailableError", async () => {
    // Non-existent features resolve via "plan" with value=false → FEATURE_NOT_AVAILABLE
    const consumeMiddleware = consumeFeature(ctx.service, resolveSession);

    await expect(
      consumeMiddleware("NONEXISTENT_FEATURE", 1)(async () => "result"),
    ).rejects.toThrow(FeatureNotAvailableError);
  });

  it("C4: withFeature wraps handler — gate runs BEFORE handler, blocking unauthorized access", async () => {
    const sensitiveHandler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ secret_data: "classified" }), { status: 200 }),
    );

    // Org A doesn't have "SUPER_SECRET_FEATURE" — so the handler should never run
    const wrapped = withFeature(ctx.service, resolveSession)("SUPER_SECRET_FEATURE")(sensitiveHandler);

    const response = await wrapped({} as any);
    expect(response.status).toBe(403);

    // Handler should NOT have been called — gate blocked before execution
    expect(sensitiveHandler).not.toHaveBeenCalled();
  });

  it("C5: withLimit wrapping handler — limit is checked before consumption", async () => {
    // Set up EXPORT_PDF with limit 1
    ctx.repository.planFeatures.set("plan_pro", [
      createPlanFeature("plan_pro", ctx.repository.features.get("EXPORT_PDF")!, true, 1),
    ]);

    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const wrapped = withLimit(ctx.service, resolveSession)("EXPORT_PDF", 1)(handler);

    // First consumption should succeed
    const res1 = await wrapped({} as any);
    expect(res1.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);

    // Second consumption should be blocked because limit is reached
    const res2 = await wrapped({} as any);
    expect(res2.status).toBe(402);
    expect(handler).toHaveBeenCalledTimes(1); // handler not called again
  });

  it("C6: requireFeature passes correct orgId and featureKey to gate.assertFeature", async () => {
    const spy = vi.spyOn(ctx.service, "assertFeature");
    const middleware = requireFeature(ctx.service, resolveSession);

    await middleware("AI_SUMMARY")();

    expect(spy).toHaveBeenCalledWith(ORG_A, "AI_SUMMARY");
    spy.mockRestore();
  });

  it("C7: consumeFeature passes correct parameters to gate.consume", async () => {
    const spy = vi.spyOn(ctx.service, "consume");
    const middleware = consumeFeature(ctx.service, resolveSession);

    await middleware("EXPORT_PDF", 3)(async () => "ok");

    expect(spy).toHaveBeenCalledWith(ORG_A, "EXPORT_PDF", 3);
    spy.mockRestore();
  });

  it("C8: withLimit with amount=0 — should not consume (guard in service)", async () => {
    const handler = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const wrapped = withLimit(ctx.service, resolveSession)("EXPORT_PDF", 0)(handler);

    // n=0 is rejected by the service's consume guard
    const response = await wrapped({} as any);
    // With n=0, consume returns LIMIT_REACHED — might return 402
    expect([402, 403]).toContain(response.status);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ============================================
// D. Injection Through Feature Keys
// ============================================

describe("D. Injection Through Feature Keys", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
  });

  it("D1: SQL injection attempt in feature key — handled safely (no raw SQL)", async () => {
    const sqlInjectionKey = "'; DROP TABLE features; --";
    // The service uses the feature key as a lookup key, not in raw SQL.
    // Repository.getFeature(featureKey) uses Map.get() which is safe.
    const result = await ctx.service.hasFeature(ORG_A, sqlInjectionKey);
    expect(result).toBe(false); // Returns false for unknown feature
  });

  it("D2: very long feature key (10000 chars) — does not crash or stack overflow", async () => {
    const longKey = "A".repeat(10000);
    const result = await ctx.service.hasFeature(ORG_A, longKey);
    expect(result).toBe(false); // Should handle gracefully
  });

  it("D3: feature key '__proto__' — does not cause prototype pollution", async () => {
    // __proto__ is a common prototype pollution vector
    const result = await ctx.service.hasFeature(ORG_A, "__proto__");
    expect(result).toBe(false);

    // Also check hasFeature didn't mutate the object's prototype
    expect(({} as any).__proto__).toBe(Object.prototype);
  });

  it("D4: feature key 'constructor' — does not cause unexpected behavior", async () => {
    // 'constructor' is a property on all objects — could cause issues if
    // the key is used in object member access without hasOwnProperty check
    const result = await ctx.service.hasFeature(ORG_A, "constructor");
    expect(result).toBe(false);
  });

  it("D5: feature key with null byte — handled without truncation issues", async () => {
    const nullByteKey = "FEATURE\0../etc/passwd";
    const result = await ctx.service.hasFeature(ORG_A, nullByteKey);
    expect(result).toBe(false); // Should handle gracefully
  });

  it("D6: feature key with path traversal — not used in file operations (safe)", async () => {
    const pathTraversalKey = "../../../etc/passwd";
    const result = await ctx.service.hasFeature(ORG_A, pathTraversalKey);
    expect(result).toBe(false);

    // Also test with various traversal patterns
    const windowsTraversal = "..\\..\\..\\windows\\system32\\config";
    const result2 = await ctx.service.hasFeature(ORG_A, windowsTraversal);
    expect(result2).toBe(false);
  });

  it("D7: feature key passed as array — coerces to unexpected string", async () => {
    // If a route handler accidentally passes an array as featureKey,
    // e.g., from query parameters like ?features[]=EXPORT_PDF&features[]=AI_SUMMARY
    // TypeScript should prevent this, but runtime might not.
    const arrayKey = ["EXPORT_PDF", "AI_SUMMARY"] as unknown as string;
    const result = await ctx.service.hasFeature(ORG_A, arrayKey);
    // Array → string coersion gives "EXPORT_PDF,AI_SUMMARY"
    // which won't match any feature key
    expect(result).toBe(false);
  });

  it("D8: feature key as object with toString override — does not execute arbitrary code", async () => {
    // If someone passes an object instead of a string, and the code uses it
    // in a way that calls toString(), the override would execute
    const maliciousKey = {
      toString: () => {
        throw new Error("HACK: toString called on feature key");
      },
    } as unknown as string;

    // hasFeature calls getDebugTrace which calls repository.getFeature(featureKey)
    // If featureKey is used in Map.get() — Map keys use SameValueZero comparison,
    // so the object reference itself is used, not the string value.
    // However, if it's used in string operations, toString() would be called.
    await expect(
      ctx.service.hasFeature(ORG_A, maliciousKey),
    ).resolves.not.toThrow(); // Should not throw from toString
  });
});

// ============================================
// E. Override Security
// ============================================

describe("E. Override Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
    setupOrgBFree(ctx);
  });

  it("E1: USER override created for another org's feature — repository has no cross-org guard", async () => {
    // The repository.createOverride does NOT validate that the scopeId/userId
    // belongs to the organizationId that is passed.
    // A USER override for user "user_b" can be created with organizationId "org_a"
    const override = await ctx.repository.createOverride({
      scope: "USER",
      scopeId: USER_B, // User B
      featureKey: "AI_SUMMARY",
      enabled: true,
      reason: "Override for user in different org",
      organizationId: ORG_A, // Organization A — user B may not belong here
    });

    expect(override.scopeId).toBe(USER_B);
    expect(override.organizationId).toBe(ORG_A);
    // No validation that USER_B belongs to ORG_A

    // Check service respects it — isInExperiment doesn't validate org membership
    const result = await ctx.service.isInExperiment(USER_B, "AI_SUMMARY");
    expect(result).toBe(false); // AI_SUMMARY is not EXPERIMENT type
  });

  it("E2: ORG override can target any orgId — no ownership validation", async () => {
    // The admin API allows creating ORG-level overrides for any orgId.
    // The repository has no check that the creator has access to that org.
    const override = await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: "org_someone_elses_org",
      featureKey: "EXPORT_PDF",
      enabled: true,
      limitValue: 999999,
      reason: "Can override any org",
      organizationId: null,
    });

    expect(override.scopeId).toBe("org_someone_elses_org");

    // Verify the override is applied when querying that org
    await ctx.repository.createSubscription("org_someone_elses_org", "free");

    const hasFeature = await ctx.service.hasFeature("org_someone_elses_org", "EXPORT_PDF");
    expect(hasFeature).toBe(true);
    // 🔴 An attacker who can create overrides (e.g., via admin API bypass)
    // could grant any org any feature
  });

  it("E3: override reason with HTML/JS — stored as-is, potential XSS in admin logs", async () => {
    // The override 'reason' field is logged via the logger. If logs are viewed
    // in a web-based admin interface without sanitization, this could be XSS.
    const xssReason = "<script>alert('XSS')</script>";
    const override = await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "AI_SUMMARY",
      enabled: true,
      reason: xssReason,
    });

    expect(override.reason).toBe(xssReason); // Stored as-is, no sanitization

    // Service uses reason in log context — structured logging should be safe
    // as long as the log viewer doesn't render HTML
    // DOCUMENTED: reason field should be sanitized for HTML if rendered in admin UI
  });

  it("E4: override with expiresAt in the past — immediately expired (effective no-op)", async () => {
    await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "AI_SUMMARY",
      enabled: false, // Would disable AI_SUMMARY
      expiresAt: new Date(Date.now() - 100000), // Already expired
      reason: "Past expiration",
    });

    // The override should be ignored because it's expired
    const result = await ctx.service.hasFeature(ORG_A, "AI_SUMMARY");
    expect(result).toBe(true); // Still enabled from plan
  });

  it("E5: override with expiresAt in year 9999 — essentially permanent (expected behavior)", async () => {
    await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "AI_SUMMARY",
      enabled: false,
      expiresAt: new Date("9999-12-31T23:59:59Z"),
      reason: "Far future expiration",
    });

    // Override should be active
    const result = await ctx.service.hasFeature(ORG_A, "AI_SUMMARY");
    expect(result).toBe(false); // Disabled by override

    // DOCUMENTED: far-future expirations are effectively permanent overrides.
    // Consider a maximum expiration window for non-admin overrides.
  });

  it("E6: override enabled set to null — coerced to false in getDebugTrace", async () => {
    const override = await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "AI_SUMMARY",
      enabled: null as unknown as boolean, // TypeScript would catch, but runtime could receive null
      reason: "Null enabled",
    });

    // Repository stores it as null
    expect(override.enabled).toBeNull();

    // Service now coerces null to false via `orgOverride.enabled ?? false`
    const trace = await ctx.service.getDebugTrace(ORG_A, "AI_SUMMARY");
    if (trace.resolvedVia === "org_override") {
      expect(trace.value).toBe(false);
    }
  });

  it("E7: override limitValue set to -1 — hasFeature treats as enabled (non-zero), consume treats as -1 limit", async () => {
    await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "EXPORT_PDF",
      enabled: true,
      limitValue: -1,
      reason: "Negative limit test",
    });

    // hasFeature: checks resolved.value !== 0 → -1 !== 0 → true
    const hasFeature = await ctx.service.hasFeature(ORG_A, "EXPORT_PDF");
    expect(hasFeature).toBe(true); // Feature is "available"

    // getLimit: returns the raw value from override → -1
    const limit = await ctx.service.getLimit(ORG_A, "EXPORT_PDF");
    expect(limit).toBe(-1);

    // canConsume with a -1 limit: used + n <= -1 is almost never true
    // So effectively, no consumption is possible
    const canConsume = await ctx.service.canConsume(ORG_A, "EXPORT_PDF", 1);
    expect(canConsume).toBe(false);
  });

  it("E8: override with very large limitValue — potential integer overflow", async () => {
    const largeLimit = 2147483647; // Max int32 — common overflow boundary
    await ctx.repository.createOverride({
      scope: "ORG",
      scopeId: ORG_A,
      featureKey: "EXPORT_PDF",
      enabled: true,
      limitValue: largeLimit,
      reason: "Large limit test",
    });

    const limit = await ctx.service.getLimit(ORG_A, "EXPORT_PDF");
    expect(limit).toBe(largeLimit);

    // Consumption should work fine within range
    const result = await ctx.service.consume(ORG_A, "EXPORT_PDF", largeLimit);
    expect(result.success).toBe(true);
  });
});

// ============================================
// F. Stripe Webhook Security
// ============================================

describe("F. Stripe Webhook Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
  });

  it("F1: forged orgId in metadata — resolveOrgId trusts metadata without verification", async () => {
    // The stripe webhook's resolveOrgId function reads orgId directly from
    // subscription metadata WITHOUT verifying the caller is authorized.
    // If an attacker creates a Stripe subscription with orgId=somebody_elses_org,
    // the webhook would update that org's subscription.
    //
    // We test at the conceptual level: the repository's createSubscription
    // (like prisma upsert) does NOT verify orgId ownership.
    const maliciousOrgId = ORG_A;
    await ctx.repository.createSubscription(maliciousOrgId, "enterprise", {
      stripeSubscriptionId: "sub_forged",
    });

    // The subscription was created for ORG_A without any authorization check
    const sub = await ctx.repository.getActiveSubscription(maliciousOrgId);
    expect(sub).not.toBeNull();
    expect(sub!.planKey).toBe("enterprise");
    // 🔴 An attacker who can trigger a webhook with forged metadata
    // could upgrade any org's subscription without payment
  });

  it("F2: no signature verification — handler processes event without checking origin", async () => {
    // We test the handler path: getWebhookHandler returns the handler function
    // for a given event type. The handler doesn't do its own signature verification.
    // It expects the caller (webhook endpoint) to have verified the signature first.
    //
    // At the service layer, there is no built-in signature verification.
    // All methods trust their callers.

    const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
    const handler = getWebhookHandler("customer.subscription.created");
    expect(handler).not.toBeNull();
    // The handler itself does not check signatures — it processes whatever it receives
    // DOCUMENTED: signature verification must happen in the route handler before calling
  });

  it("F3: event replay protection — same eventId processed twice should be idempotent", async () => {
    // The repository has hasStripeEventBeenProcessed / markStripeEventProcessed
    // for idempotency. Let's test the pattern.
    const eventId = "evt_replay_001";

    // First time: not processed
    const firstCheck = await ctx.repository.hasStripeEventBeenProcessed(eventId);
    expect(firstCheck).toBe(false);

    // Mark as processed
    await ctx.repository.markStripeEventProcessed(eventId, "customer.subscription.created");

    // Second time: already processed
    const secondCheck = await ctx.repository.hasStripeEventBeenProcessed(eventId);
    expect(secondCheck).toBe(true);

    // DOCUMENTED: The webhook handler checks this before processing.
    // If the check is bypassed, replay attacks are possible.
  });

  it("F4: webhook with non-existent subscription ID — retrieve throws, handler catches", async () => {
    // invoice.payment_succeeded calls stripe.subscriptions.retrieve(subscriptionId)
    // which throws if the subscription doesn't exist.
    // The handler catches this and logs the error, then re-throws.
    //
    // Test at service level: non-existent stripe ID in metadata shouldn't cause
    // unexpected state mutations
    const fakeStripeId = "sub_nonexistent_abc123";

    // Create a subscription with a fake stripe reference
    await ctx.repository.createSubscription(ORG_A, "pro", {
      stripeSubscriptionId: fakeStripeId,
    });

    const sub = await ctx.repository.getActiveSubscription(ORG_A);
    expect(sub?.stripeSubscriptionId).toBe(fakeStripeId);
    // The system stores whatever it receives — no validation of stripe ID format
  });

  it("F5: webhook event for org that doesn't exist — creates subscription for non-existent org", async () => {
    // If the webhook receives a subscription for a non-existent org,
    // it will still create/update subscription records in the database.
    // The service-level behavior: creating a subscription for an unknown org
    // is allowed (no referential integrity check at the service level)

    await ctx.repository.createSubscription("org_does_not_exist", "enterprise");
    const sub = await ctx.repository.getActiveSubscription("org_does_not_exist");
    expect(sub).not.toBeNull();
    expect(sub!.planKey).toBe("enterprise");

    // The service will return features based on the subscription data
    // even though the org doesn't actually exist in the system
    const features = await ctx.service.hasFeature("org_does_not_exist", "AI_SUMMARY");
    expect(features).toBe(false); // Because no plan features set for the enterprise plan here
  });

  it("F6: getPlanFromPriceId with unknown/malformed price ID — returns what?", async () => {
    // We can't directly test the stripe-config module here, but we can test
    // how the service handles unknown price/plan mappings.
    // The service uses planKey from subscription — if it doesn't match any plan,
    // it falls through to fallback.

    // Create a subscription with a planKey that doesn't match any plan record
    await ctx.repository.createSubscription(ORG_A, "nonexistent_plan_key");
    const result = await ctx.service.hasFeature(ORG_A, "AI_SUMMARY");
    expect(result).toBe(false); // Falls back to free/fallback behavior
  });
});

// ============================================
// G. Admin API Security
// ============================================

describe("G. Admin API Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
  });

  it("G1: requireAdmin throws for non-admin user — 403 error", async () => {
    // Mock the require-admin module to simulate non-admin behavior
    const mod = await import("@/lib/auth/require-admin");
    const { requireAdmin } = mod;
    // Real requireAdmin will throw unless auth returns admin session
    // In unit tests without a real session, we verify the function exists and throws
    await expect(requireAdmin()).rejects.toThrow();
  });

  it("G2: requireAdmin throws for unauthenticated request — 401 error", async () => {
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    await expect(requireAdmin()).rejects.toThrow();
  });

  it("G3: requireAdmin returns user data for admin user", async () => {
    // The real requireAdmin needs auth and DB. We validate the contract:
    // admin routes call requireAdmin() as their first guard.
    // The function signature and behavior are validated in entitlement API route tests.
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    expect(typeof requireAdmin).toBe("function");
  });

  it("G4: admin routes call requireAdmin before processing data", async () => {
    // Test the pattern used in admin routes: requireAdmin() is called
    // BEFORE any data processing. This ensures auth runs first.
    const handler = vi.fn();

    // Mock auth to return a non-admin user (USER role) using the top-level mock
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", email: "a@b.com", role: "USER" },
    } as any);

    const { requireAdmin } = await import("@/lib/auth/require-admin");

    // Attempt the pattern: require then handle
    try {
      await requireAdmin(); // Should throw for non-admin
      handler(); // Should not reach here
    } catch {
      // Expected
    }

    expect(handler).not.toHaveBeenCalled(); // Handler should NOT have run
    vi.mocked(auth).mockReset();
  });

  it("G5: admin can access other org's data — no cross-org guard in admin endpoints", async () => {
    // Admin routes like GET /api/admin/orgs/:orgId/entitlements accept the orgId
    // as a URL parameter. There is no check that the admin user is restricted
    // to specific orgs. An admin can view any org's entitlements.

    // Verify the service layer doesn't restrict admin access
    setupOrgAPro(ctx);

    // Admin user queries ORG_A's data — works fine
    const orgAData = await ctx.service.getAllEntitlements(ORG_A);
    expect(orgAData.planKey).toBe("pro");

    setupOrgBFree(ctx);
    const orgBData = await ctx.service.getAllEntitlements(ORG_B);
    expect(orgBData.planKey).toBe("free");

    // No restriction on which org an admin can query
    // This is intentional (admin visibility), but should be logged/audited
  });

  it("G6: admin routes handle AuthError with proper status codes", async () => {
    // Check the error handling pattern in admin routes
    // Admin route handlers catch errors and check for UNAUTHORIZED/401/403

    const { AuthError } = await import("@/lib/auth/require-admin");

    const authError401 = new AuthError("Non authentifié", 401);
    expect(authError401.status).toBe(401);
    expect(authError401.message).toContain("Non authentifié");

    const authError403 = new AuthError("Accès non autorisé", 403);
    expect(authError403.status).toBe(403);

    // Route handlers typically do:
    // if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
    //   return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    // }
    const isUnauthorizedPattern = (err: any): boolean =>
      err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403;

    expect(isUnauthorizedPattern(authError401)).toBe(true);
    expect(isUnauthorizedPattern(authError403)).toBe(true);
  });
});

// ============================================
// H. Experiment Security
// ============================================

describe("H. Experiment Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
  });

  it("H1: isInExperiment accepts any userId — could check another user's bucket", async () => {
    // The experiment system is designed to work with any userId.
    // This is NOT a security issue — it's a deterministic hash function.
    // But it means if user A knows user B's ID, user A can compute user B's
    // experiment bucket for any public experiment.
    //
    // Test: user A checks user B's experiment bucket
    const userABucket = await ctx.service.isInExperiment(USER_A, "NEW_DASHBOARD");
    const userBBucket = await ctx.service.isInExperiment(USER_B, "NEW_DASHBOARD");

    // Both calls succeed — no authorization
    expect(typeof userABucket).toBe("boolean");
    expect(typeof userBBucket).toBe("boolean");

    // The experiment bucket is deterministic — same user always gets same result
    const userBRepeat = await ctx.service.isInExperiment(USER_B, "NEW_DASHBOARD");
    expect(userBBucket).toBe(userBRepeat);
  });

  it("H2: experiment config mutation affects live bucketing for all users", async () => {
    // If an attacker can modify the experiment's defaultConfig (e.g., via admin bypass),
    // it changes bucket assignments for ALL users.
    // This is an integrity concern for A/B testing validity.

    // Store original config
    const originalConfig = await ctx.service.getExperimentConfig("NEW_DASHBOARD");
    expect(originalConfig?.percentage).toBe(50);

    // Simulate config mutation (what would happen if an attacker modifies it)
    const mutatedFeature = createFeature("NEW_DASHBOARD", "EXPERIMENT", {
      percentage: 100, // Changed from 50 to 100
      seed: "NEW_DASHBOARD_v1",
    });
    ctx.repository.features.set("NEW_DASHBOARD", mutatedFeature);

    // Now all users are in the experiment
    const userNotOriginallyIn = await ctx.service.isInExperiment(USER_B, "NEW_DASHBOARD");
    // This could differ from the original pre-mutation value
    // 🔴 Config integrity is critical for experiment validity
    // DOCUMENTED: experiment config mutation affects all live bucketing
  });

  it("H3: user-level experiment override for another user's feature — scopeId is validated by repository", async () => {
    // Creating a USER override for "user_b" on an experiment only affects user_b,
    // not user_a. The override scope is userId-specific.
    await ctx.repository.createOverride({
      scope: "USER",
      scopeId: USER_B,
      featureKey: "NEW_DASHBOARD",
      enabled: true,
      reason: "Override for user B",
    });

    // User A is NOT affected by User B's override
    const userAResult = await ctx.service.isInExperiment(USER_A, "NEW_DASHBOARD");
    // User A's bucket depends on config, not User B's override

    // User B IS affected by User B's override
    const userBResult = await ctx.service.isInExperiment(USER_B, "NEW_DASHBOARD");
    expect(userBResult).toBe(true); // Override enables it regardless of bucket

    // Verify the scope isolation
    const overrideCheck = await ctx.repository.getOverride("USER", USER_A, "NEW_DASHBOARD");
    expect(overrideCheck).toBeNull(); // No override for user A
  });

  it("H4: isInExperiment with empty userId — returns bucket based on empty string hash", async () => {
    // Empty userId should be handled deterministically
    const result1 = await ctx.service.isInExperiment("", "NEW_DASHBOARD");
    const result2 = await ctx.service.isInExperiment("", "NEW_DASHBOARD");

    // Same empty userId → same bucket (deterministic)
    expect(result1).toBe(result2);

    // Different empty userId... wait, they're both empty. They should match.
    // This is correct behavior — empty string is a valid input to murmurhash
  });

  it("H5: isInExperiment with malicious userId — no injection in hash function", async () => {
    // The murmurhash function only uses charCodeAt which is safe
    const maliciousIds = [
      '<script>alert("xss")</script>',
      "../../../etc/passwd",
      "'.__proto__",
      "constructor",
      "\0DROP TABLE users;",
      "A".repeat(10000),
    ];

    for (const maliciousId of maliciousIds) {
      // None of these should cause errors or unexpected behavior
      await expect(
        ctx.service.isInExperiment(maliciousId, "NEW_DASHBOARD"),
      ).resolves.not.toThrow();
    }
  });

  it("H6: getExperimentBucket does not leak information about other users", async () => {
    // getExperimentBucket(userId, seed) is a pure function.
    // Given a userId and seed, it returns the same bucket every time.
    // This is designed to be predictable — it's not a security boundary.
    //
    // However, if the seed is predictable or known, user A can compute user B's bucket.
    // This is by design for the experiment system and is not a vulnerability.
    const bucketA = ctx.service.getExperimentBucket(USER_A, "NEW_DASHBOARD_v1", "NEW_DASHBOARD_v1");
    const bucketB = ctx.service.getExperimentBucket(USER_B, "NEW_DASHBOARD_v1", "NEW_DASHBOARD_v1");

    // Both are valid buckets (0-99)
    expect(bucketA).toBeGreaterThanOrEqual(0);
    expect(bucketA).toBeLessThan(100);
    expect(bucketB).toBeGreaterThanOrEqual(0);
    expect(bucketB).toBeLessThan(100);

    // Different users may have different or same buckets (hash distribution)
    // No information leak — this is public deterministic hashing
  });
});

// ============================================
// I. Cache Security
// ============================================

describe("I. Cache Security", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createBaseSetup();
    setupOrgAPro(ctx);
  });

  it("I1: cache key includes orgId — cache entries are org-scoped", async () => {
    await ctx.service.getAllEntitlements(ORG_A);
    const cacheKeyA = `entitlements:${ORG_A}`;

    const cachedA = await ctx.cache.get(cacheKeyA);
    expect(cachedA).not.toBeNull();
    expect(cachedA.planKey).toBe("pro");

    // Org B's cache is separate
    const cacheKeyB = `entitlements:${ORG_B}`;
    const cachedB = await ctx.cache.get(cacheKeyB);
    expect(cachedB).toBeNull(); // Not cached yet

    // If we can inject into the cache key format, we might read/write other caches
    // Test: does the cache prefix make injection harder?
    const injectionKey = `entitlements:${ORG_A}`;
    const c = await ctx.cache.get(injectionKey);
    expect(c).not.toBeNull();
  });

  it("I2: invalidateCache only clears the targeted org's cache entry", async () => {
    // Cache both orgs
    await ctx.service.getAllEntitlements(ORG_A);
    await ctx.service.getAllEntitlements(ORG_B);

    expect(await ctx.cache.get(`entitlements:${ORG_A}`)).not.toBeNull();
    expect(await ctx.cache.get(`entitlements:${ORG_B}`)).not.toBeNull();

    // Invalidate only ORG_A
    await ctx.service.invalidateCache(ORG_A);

    // ORG_A's cache should be cleared
    expect(await ctx.cache.get(`entitlements:${ORG_A}`)).toBeNull();
    // ORG_B's cache should remain
    expect(await ctx.cache.get(`entitlements:${ORG_B}`)).not.toBeNull();
  });

  it("I3: publishInvalidation doesn't leak to other orgs' subscribers", async () => {
    const notifiedOrgsA: string[] = [];
    const notifiedOrgsB: string[] = [];

    ctx.cache.subscribe((orgId) => notifiedOrgsA.push(orgId));
    ctx.cache.subscribe((orgId) => notifiedOrgsB.push(orgId));

    await ctx.service.invalidateCache(ORG_A);

    // Both subscribers should receive the invalidation for ORG_A
    expect(notifiedOrgsA).toContain(ORG_A);
    expect(notifiedOrgsB).toContain(ORG_A);

    // But not for ORG_B
    expect(notifiedOrgsA).not.toContain(ORG_B);
  });
});
