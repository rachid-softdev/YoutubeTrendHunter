// ============================================
// Downgrade Service
// ============================================

import { entitlementRepository } from "./repository";
import { featureGateService } from "./service";
import type { DowngradeStrategy, DowngradeImpact, DowngradePreview } from "./types";

export class DowngradeService {
  /**
   * Get preview of what will change if org downgrades to target plan
   */
  async getPreview(orgId: string, targetPlanKey: string): Promise<DowngradeImpact> {
    return featureGateService.getDowngradePreview(orgId, targetPlanKey);
  }

  /**
   * Apply downgrade strategy based on feature config
   */
  async applyDowngrade(
    orgId: string,
    targetPlanKey: string,
  ): Promise<{
    success: boolean;
    affectedFeatures: string[];
    message: string;
  }> {
    const impact = await this.getPreview(orgId, targetPlanKey);

    // Get current subscription
    const subscription = await entitlementRepository.getActiveSubscription(orgId);
    const currentPeriodEnd = subscription?.currentPeriodEnd;

    const affectedFeatures: string[] = [];
    const now = new Date();

    for (const feature of impact.willLoseFeatures) {
      // Apply strategy
      switch (feature.strategy) {
        case "IMMEDIATE":
          // Apply immediately - no special handling needed
          // The FeatureGateService will check new plan on next request
          affectedFeatures.push(feature.featureKey);
          break;

        case "GRACEFUL":
          // Check if we're past the grace period
          if (currentPeriodEnd && now >= currentPeriodEnd) {
            // Grace period over, cut access
            affectedFeatures.push(feature.featureKey);
          }
          // Otherwise, access continues until period end
          break;

        case "FREEZE":
          // Mark in override to block new actions but keep data
          // For now, we just log - actual freeze would need override
          console.log(
            `[DowngradeService] Freeze requested for ${feature.featureKey} on org ${orgId}`,
          );
          affectedFeatures.push(feature.featureKey);
          break;
      }
    }

    // If immediate downgrade, update subscription now
    const hasImmediate = impact.willLoseFeatures.some((f) => f.strategy === "IMMEDIATE");

    if (hasImmediate) {
      await entitlementRepository.updateSubscription(orgId, {
        planKey: targetPlanKey,
      });
      await featureGateService.invalidateCache(orgId);
    }

    // TODO: Send email notification if graceful and approaching end
    if (currentPeriodEnd) {
      const daysUntilEnd = Math.ceil(
        (currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilEnd <= 7 && daysUntilEnd > 0) {
        console.log(`[DowngradeService] Send downgrade email - ${daysUntilEnd} days remaining`);
        // TODO: Send email via email service
      }
    }

    return {
      success: true,
      affectedFeatures,
      message:
        affectedFeatures.length > 0
          ? `${affectedFeatures.length} features will be affected`
          : "No features affected",
    };
  }

  /**
   * Get all downgrade strategies available
   */
  getStrategies(): { key: DowngradeStrategy; label: string; description: string }[] {
    return [
      {
        key: "GRACEFUL",
        label: "Graceful",
        description: "Keep access until end of billing period, then cut",
      },
      {
        key: "IMMEDIATE",
        label: "Immediate",
        description: "Cut access immediately when downgrade happens",
      },
      {
        key: "FREEZE",
        label: "Freeze",
        description: "Block new actions but keep existing data",
      },
    ];
  }
}

export const downgradeService = new DowngradeService();
