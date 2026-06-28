// ============================================
// FeatureGateService — Central Access Control
// ============================================
//
// This is the SOLE source of truth for feature access.
// No "if (plan === 'PRO')" anywhere in the codebase.
// Everything passes through this service.
// ============================================

import type {
  IEntitlementRepository,
  ICacheService,
  DebugTrace,
  ConsumeResult,
  EntitlementMap,
  ResolutionSource,
  FeatureType,
} from "./types";
import { isInExperiment as checkExperimentBucket, getExperimentBucket } from "./experiment";
import { FeatureNotAvailableError, LimitReachedError } from "./errors";
import { log } from "@/lib/logger";

const CACHE_TTL = 300; // 5 min Redis
const MEMORY_TTL = 30; // 30s memory fallback
const CACHE_PREFIX = "entitlements:";

export class FeatureGateService {
  private readonly pendingRequests = new Map<string, Promise<EntitlementMap>>();

  constructor(
    private readonly repository: IEntitlementRepository,
    private readonly cache: ICacheService,
  ) {}

  // ─── Public API ───

  /**
   * Check if an org has a feature enabled (boolean or limit type).
   */
  async hasFeature(orgId: string, featureKey: string): Promise<boolean> {
    const resolved = await this.resolve(orgId, featureKey);
    if (typeof resolved.value === "boolean") return resolved.value;
    // For limit features: null means unlimited (enabled), 0 means disabled
    return resolved.value !== 0;
  }

  /**
   * Get the numeric limit for a feature. Returns null for unlimited.
   */
  async getLimit(orgId: string, limitKey: string): Promise<number | null> {
    const resolved = await this.resolve(orgId, limitKey);
    // null value from plan means unlimited
    if (resolved.value === null) return null;
    if (typeof resolved.value === "number") return resolved.value;
    if (resolved.value === true) return null; // boolean enabled = no limit
    return 0; // disabled
  }

  /**
   * Assert that a feature is available. Throws 403 if not.
   */
  async assertFeature(orgId: string, featureKey: string): Promise<void> {
    const trace = await this.getDebugTrace(orgId, featureKey);
    if (trace.value === false || trace.value === 0) {
      const sub = await this.repository.getActiveSubscription(orgId);
      const currentPlan = sub?.planKey ?? "free";
      // Find which plan would have it
      const allPlans = await this.repository.getAllPlans();
      let planRequired = "enterprise";
      for (const plan of allPlans) {
        const pf = await this.repository.getPlanFeature(plan.id, featureKey);
        if (pf?.enabled) {
          planRequired = plan.key;
          break;
        }
      }

      log("warn", "[FeatureGate] Feature not available", {
        orgId,
        feature: featureKey,
        currentPlan,
        resolvedVia: trace.resolvedVia,
      });

      throw new FeatureNotAvailableError(featureKey, planRequired, currentPlan);
    }
  }

  /**
   * Check if an org can consume N units of a limit feature (without consuming).
   */
  async canConsume(orgId: string, featureKey: string, n = 1): Promise<boolean> {
    const limit = await this.getLimit(orgId, featureKey);
    if (limit === null) return true; // unlimited

    const usage = await this.repository.getCurrentUsage(orgId, featureKey);
    const used = usage?.usageCount ?? 0;
    return used + n <= limit;
  }

  /**
   * Atomically consume N units of a limit feature.
   */
  async consume(orgId: string, featureKey: string, n = 1): Promise<ConsumeResult> {
    // Guard against negative or zero consumption (quota manipulation)
    if (n <= 0) {
      const usage = await this.repository.getCurrentUsage(orgId, featureKey);
      return {
        success: false,
        used: usage?.usageCount ?? 0,
        remaining: null,
        error: "LIMIT_REACHED",
      };
    }

    // Check feature exists and is enabled
    const trace = await this.getDebugTrace(orgId, featureKey);
    if (trace.value === false) {
      return {
        success: false,
        used: 0,
        remaining: null,
        error: "FEATURE_NOT_AVAILABLE",
      };
    }

    const limit = await this.getLimit(orgId, featureKey);
    if (limit === null) {
      // Unlimited — just track usage
      await this.repository.consumeUsage(orgId, featureKey, n);
      return { success: true, used: n, remaining: null };
    }

    // Check current usage before consuming (best-effort pre-check; the
    // atomic SQL below has a WHERE clause that enforces the limit to
    // prevent TOCTOU races between concurrent requests).
    const usage = await this.repository.getCurrentUsage(orgId, featureKey);
    const used = usage?.usageCount ?? 0;

    // Optimistic pre-check: if we're already well over the limit,
    // return early without hitting the DB.
    if (used >= limit) {
      const resetAt = usage?.periodEnd?.toISOString() ?? new Date().toISOString();
      log("warn", "[FeatureGate] Limit reached", {
        orgId,
        feature: featureKey,
        limit,
        used,
        attempted: n,
      });
      return {
        success: false,
        used,
        remaining: 0,
        error: "LIMIT_REACHED",
        limitReached: {
          feature: featureKey,
          limit,
          used,
          resetAt,
        },
      };
    }

    // Atomically consume with TOCTOU guard: the SQL enforces
    // usage_count + n <= limit at the DB level.
    const result = await this.repository.consumeUsage(orgId, featureKey, n, limit);
    if (!result) {
      // The atomic update returned 0 rows — limit was reached
      const freshUsage = await this.repository.getCurrentUsage(orgId, featureKey);
      const freshUsed = freshUsage?.usageCount ?? 0;
      const resetAt = freshUsage?.periodEnd?.toISOString() ?? new Date().toISOString();
      return {
        success: false,
        used: freshUsed,
        remaining: Math.max(0, limit - freshUsed),
        error: "LIMIT_REACHED",
        limitReached: {
          feature: featureKey,
          limit,
          used: freshUsed,
          resetAt,
        },
      };
    }

    // Recalculate remaining from the authoritative DB result
    const newUsed = result.usageCount;
    return {
      success: true,
      used: newUsed,
      remaining: Math.max(0, limit - newUsed),
    };
  }

  /**
   * Get all entitlements for an org (cached).
   */
  async getAllEntitlements(orgId: string): Promise<EntitlementMap> {
    const cacheKey = `${CACHE_PREFIX}${orgId}`;

    // Try cache
    const cached = await this.cache.get<EntitlementMap>(cacheKey);
    if (cached) return cached;

    // Coalesce concurrent cache misses: if another request is already fetching
    // this org's entitlements, await that promise instead of hitting the DB again.
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) return pending;

    // Start building — store the promise so concurrent requests coalesce
    const promise = this.buildEntitlements(orgId, cacheKey);
    this.pendingRequests.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Build entitlements from source (DB), cache, and return.
   * Extracted to a separate method to enable request coalescing.
   */
  private async buildEntitlements(orgId: string, cacheKey: string): Promise<EntitlementMap> {
    const sub = await this.repository.getActiveSubscription(orgId);
    const planKey = sub?.planKey ?? "free";
    const plan = await this.repository.getPlan(planKey);
    const features: Record<string, boolean> = {};
    const limits: Record<string, number | null> = {};
    const experiments: Record<string, { percentage: number; seed: string }> = {};

    if (plan) {
      const planFeatures = await this.repository.getPlanFeatures(plan.id);
      const orgOverrides = await this.repository.getOverridesForOrg(orgId);

      for (const pf of planFeatures) {
        const key = pf.feature?.key ?? "";
        if (!key) continue;

        const featureType = pf.feature?.type as FeatureType;

        // Handle EXPERIMENT features
        if (featureType === "EXPERIMENT") {
          const raw = (pf.configJson ?? pf.feature?.defaultConfig) as Record<string, unknown> | null;
          const config = raw
            ? { percentage: (raw.percentage as number) ?? 0, seed: (raw.seed as string) ?? "" }
            : null;
          if (config && typeof config.percentage === "number" && config.seed) {
            experiments[key] = config;
            features[key] = pf.enabled;
          } else {
            features[key] = false;
          }
          continue;
        }

        // Check override first
        const override = orgOverrides.find((o) => o.featureKey === key);
        if (override) {
          if (featureType === "BOOLEAN") {
            features[key] = override.enabled;
          } else if (featureType === "LIMIT") {
            features[key] = true;
            limits[key] = override.limitValue ?? pf.limitValue;
          }
          continue;
        }

        // Plan default
        if (featureType === "BOOLEAN") {
          features[key] = pf.enabled;
        } else if (featureType === "LIMIT") {
          features[key] = pf.enabled;
          limits[key] = pf.enabled ? (pf.limitValue ?? null) : 0;
        }
      }
    }

    const map: EntitlementMap = { planKey, features, limits };
    if (Object.keys(experiments).length > 0) {
      map.experiments = experiments;
    }

    // Cache
    await this.cache.set(cacheKey, map, CACHE_TTL);

    return map;
  }

  /**
   * Get a detailed debug trace showing how a feature was resolved.
   */
  async getDebugTrace(orgId: string, featureKey: string): Promise<DebugTrace & { value: boolean | number | null }> {
    // 1. User override (requires userId, not available here — skip)
    // 2. Org override
    const orgOverride = await this.repository.getOverride("ORG", orgId, featureKey);

    if (orgOverride && (!orgOverride.expiresAt || orgOverride.expiresAt > new Date())) {
      const feature = await this.repository.getFeature(featureKey);
      const featureType = feature?.type as FeatureType;
      // For LIMIT features: if override disables it, return false; otherwise return limitValue
      const enabled = orgOverride.enabled ?? false;
      const value =
        featureType === "LIMIT" && enabled
          ? (orgOverride.limitValue ?? null)
          : enabled;

      return {
        feature: featureKey,
        resolvedVia: "org_override",
        value,
        overrideId: orgOverride.id,
        expiresAt: orgOverride.expiresAt ?? undefined,
        limitValue: orgOverride.limitValue ?? undefined,
      };
    }

    // 3. Plan
    const sub = await this.repository.getActiveSubscription(orgId);
    if (sub) {
      const planKey = sub.planKey ?? "free";
      const plan = await this.repository.getPlan(planKey);
      if (plan) {
        const pf = await this.repository.getPlanFeature(plan.id, featureKey);
        if (pf) {
          const feature = await this.repository.getFeature(featureKey);
          const featureType = feature?.type as FeatureType;

          if (featureType === "BOOLEAN") {
            return {
              feature: featureKey,
              resolvedVia: "plan",
              value: pf.enabled,
              planKey: plan.key,
            };
          }

          if (featureType === "LIMIT") {
            return {
              feature: featureKey,
              resolvedVia: "plan",
              value: pf.enabled ? pf.limitValue : false,
              planKey: plan.key,
            };
          }

          // EXPERIMENT
          if (featureType === "EXPERIMENT") {
            const raw = (pf.configJson ?? feature?.defaultConfig) as Record<string, unknown> | null;
            const config = raw
              ? ({
                  percentage: raw.percentage ?? 0,
                  seed: raw.seed ?? "",
                } as { percentage: number; seed: string })
              : null;
            return {
              feature: featureKey,
              resolvedVia: "plan",
              value: pf.enabled,
              planKey: plan.key,
              experimentConfig: config ?? undefined,
            };
          }
        }

        // Feature not in plan — check if it exists globally
        const globalFeature = await this.repository.getFeature(featureKey);
        if (globalFeature) {
          // Feature exists but isn't configured for this plan
          const raw = globalFeature.defaultConfig as Record<string, unknown> | null;
          const defaultConfig = raw
            ? ({
                percentage: raw.percentage ?? 0,
                seed: raw.seed ?? "",
              } as { percentage: number; seed: string })
            : null;

          if (globalFeature.type === "EXPERIMENT" && defaultConfig) {
            return {
              feature: featureKey,
              resolvedVia: "plan",
              value: true, // Experiments are "available" but bucketed
              planKey: plan.key,
              experimentConfig: defaultConfig,
            };
          }
        }

        return {
          feature: featureKey,
          resolvedVia: "plan",
          value: false,
          planKey: plan.key,
        };
      }
    }

    // 4. Fallback
    return {
      feature: featureKey,
      resolvedVia: "fallback",
      value: false,
      planKey: "free",
    };
  }

  /**
   * Get resolved value + debug trace (internal helper).
   */
  private async resolve(
    orgId: string,
    featureKey: string,
  ): Promise<{ value: boolean | number | null; resolvedVia: ResolutionSource }> {
    const trace = await this.getDebugTrace(orgId, featureKey);
    return { value: trace.value, resolvedVia: trace.resolvedVia };
  }

  /**
   * Invalidate cache for an org (manual or on mutation).
   */
  async invalidateCache(orgId: string): Promise<void> {
    await this.cache.publishInvalidation(orgId);
  }

  // ─── Experiment Helpers ───

  /**
   * Check if a user is in an A/B test experiment.
   * Must be called with a userId (not just orgId).
   */
  async isInExperiment(userId: string, experimentKey: string): Promise<boolean> {
    // First check feature exists and is type EXPERIMENT
    const feature = await this.repository.getFeature(experimentKey);
    if (!feature || feature.type !== "EXPERIMENT") {
      return false;
    }

    // Check user-level override
    const override = await this.repository.getOverride("USER", userId, experimentKey);
    if (override) {
      return override.enabled;
    }

    // Use experiment config
    const config = feature.defaultConfig as {
      percentage?: number;
      seed?: string;
    } | null;
    if (!config || typeof config.percentage !== "number" || !config.seed) {
      return false;
    }

    return checkExperimentBucket(userId, config.seed, config.percentage);
  }

  /**
   * Get the experiment config for a given experiment key.
   */
  async getExperimentConfig(experimentKey: string): Promise<{
    percentage: number;
    seed: string;
  } | null> {
    const feature = await this.repository.getFeature(experimentKey);
    if (!feature || feature.type !== "EXPERIMENT") return null;
    const config = feature.defaultConfig as {
      percentage?: number;
      seed?: string;
    } | null;
    if (!config || typeof config.percentage !== "number" || !config.seed) return null;
    return { percentage: config.percentage, seed: config.seed };
  }

  /**
   * Get the experiment bucket for a user (for debugging).
   */
  getExperimentBucket(userId: string, experimentKey: string, seed: string): number {
    return getExperimentBucket(userId, seed);
  }
}
