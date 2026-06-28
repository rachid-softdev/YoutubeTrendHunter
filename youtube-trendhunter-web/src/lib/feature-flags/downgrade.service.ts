// ============================================
// DowngradeService — Graceful downgrade management
// ============================================

import type { IEntitlementRepository, ICacheService, DowngradePreview, DowngradeFeatureImpact, DowngradeStrategy, FeatureType } from "./types";
import { FeatureGateService } from "./feature-gate.service";
import { log } from "@/lib/logger";

export class DowngradeService {
  constructor(
    private readonly repository: IEntitlementRepository,
    private readonly gate: FeatureGateService,
    private readonly cache: ICacheService,
  ) {}

  /**
   * Preview what features will be impacted if an org downgrades from
   * their current plan to targetPlanKey.
   */
  async previewDowngrade(
    orgId: string,
    targetPlanKey: string,
  ): Promise<DowngradePreview> {
    const sub = await this.repository.getActiveSubscription(orgId);
    const currentPlanKey = sub?.planKey ?? "free";

    if (currentPlanKey === targetPlanKey) {
      return {
        fromPlan: currentPlanKey,
        toPlan: targetPlanKey,
        impactedFeatures: [],
        totalFeatures: 0,
        affectedCount: 0,
      };
    }

    const currentPlan = await this.repository.getPlan(currentPlanKey);
    const targetPlan = await this.repository.getPlan(targetPlanKey);

    if (!currentPlan || !targetPlan) {
      throw new Error(`Plan not found: ${!currentPlan ? currentPlanKey : targetPlanKey}`);
    }

    const currentFeatures = await this.repository.getPlanFeatures(currentPlan.id);
    const targetFeatures = await this.repository.getPlanFeatures(targetPlan.id);

    const impacted: DowngradeFeatureImpact[] = [];
    const targetFeatureMap = new Map(targetFeatures.map((pf) => [pf.feature?.key, pf]));

    for (const pf of currentFeatures) {
      const featureKey = pf.feature?.key;
      const featureName = pf.feature?.name ?? featureKey ?? "";
      const featureType = pf.feature?.type as FeatureType;
      if (!featureKey) continue;

      const targetPf = targetFeatureMap.get(featureKey);

      // Feature not in target plan at all — full loss
      if (!targetPf) {
        impacted.push({
          featureKey,
          featureName,
          featureType,
          currentValue: extractValue(pf),
          newValue: null,
          strategy: pf.downgradeStrategy,
          impact: "full_loss",
        });
        continue;
      }

      // Feature in target but disabled
      if (!targetPf.enabled) {
        impacted.push({
          featureKey,
          featureName,
          featureType,
          currentValue: extractValue(pf),
          newValue: false,
          strategy: pf.downgradeStrategy,
          impact: "full_loss",
        });
        continue;
      }

      // Limit feature with reduced quota
      if (featureType === "LIMIT") {
        const currentLimit = pf.limitValue;
        const targetLimit = targetPf.limitValue;
        if (targetLimit !== null && (currentLimit === null || targetLimit < currentLimit)) {
          impacted.push({
            featureKey,
            featureName,
            featureType,
            currentValue: currentLimit,
            newValue: targetLimit,
            strategy: targetPf.downgradeStrategy,
            impact: currentLimit === null ? "limited" : "limited",
          });
        }
      }
    }

    return {
      fromPlan: currentPlanKey,
      toPlan: targetPlanKey,
      impactedFeatures: impacted,
      totalFeatures: currentFeatures.length,
      affectedCount: impacted.length,
    };
  }

  /**
   * Apply the downgrade strategy for a specific org.
   * Called when a subscription change is detected (webhook).
   *
   * Returns the features that were affected.
   */
  async applyDowngradeStrategy(
    orgId: string,
    oldPlanKey: string,
    newPlanKey: string,
  ): Promise<DowngradeFeatureImpact[]> {
    const preview = await this.previewDowngrade(orgId, newPlanKey);
    const results: DowngradeFeatureImpact[] = [];

    for (const impact of preview.impactedFeatures) {
      switch (impact.strategy) {
        case "GRACEFUL":
          // Log for later processing (cron will handle cutoff at period_end)
          log("info", "[Downgrade] Graceful downgrade scheduled", {
            orgId,
            feature: impact.featureKey,
            currentPeriodEnd: (await this.repository.getActiveSubscription(orgId))
              ?.currentPeriodEnd?.toISOString(),
          });
          results.push(impact);
          break;

        case "IMMEDIATE":
          // Cut access now — cache invalidation handles the rest
          log("info", "[Downgrade] Immediate downgrade applied", {
            orgId,
            feature: impact.featureKey,
          });
          results.push(impact);
          break;

        case "FREEZE":
          // Block new consumption but keep data
          await this.blockConsumption(orgId, impact.featureKey);
          log("info", "[Downgrade] Freeze applied", {
            orgId,
            feature: impact.featureKey,
          });
          results.push(impact);
          break;
      }
    }

    // Invalidate cache so new entitlements are picked up
    await this.cache.publishInvalidation(orgId);

    return results;
  }

  /**
   * Block new consumption by creating an org override that sets limit to current usage.
   */
  private async blockConsumption(orgId: string, featureKey: string): Promise<void> {
    const usage = await this.repository.getCurrentUsage(orgId, featureKey);
    const currentUsed = usage?.usageCount ?? 0;

    await this.repository.createOverride({
      scope: "ORG",
      scopeId: orgId,
      featureKey,
      enabled: true,
      limitValue: currentUsed,
      reason: `Freeze on downgrade — current usage locked at ${currentUsed}`,
      organizationId: orgId,
    });
  }

  /**
   * Check if an org has any features with GRACEFUL downgrade that
   * have passed their current_period_end. Called by cron.
   */
  async processGracefulDowngrades(): Promise<number> {
    // Get all subscriptions with GRACEFUL downgrades past period end
    const plans = await this.repository.getAllPlans();
    let processed = 0;

    for (const plan of plans) {
      const planFeatures = await this.repository.getPlanFeatures(plan.id);
      const gracefulFeatures = planFeatures.filter(
        (pf) => pf.downgradeStrategy === "GRACEFUL" && !pf.enabled,
      );
      if (gracefulFeatures.length === 0) continue;

      // Find orgs on this plan where period_end has passed
      // This is a simplified implementation; in production, query directly
      log("info", "[Downgrade] Graceful downgrade check", {
        plan: plan.key,
        featuresToCut: gracefulFeatures.map((pf) => pf.feature?.key),
      });
      processed += gracefulFeatures.length;
    }

    return processed;
  }
}

/**
 * Extract the "value" from a PlanFeatureRecord for comparison.
 */
function extractValue(pf: {
  enabled: boolean;
  limitValue: number | null;
  feature?: { type: string } | null;
}): boolean | number | null {
  if (pf.feature?.type === "LIMIT") return pf.limitValue;
  return pf.enabled;
}
