// ============================================
// Feature Flags & Entitlements — Barrel Exports
// ============================================

// Core service
export { FeatureGateService } from "./feature-gate.service";

// Repository
export { PrismaEntitlementRepository } from "./entitlement-repository";

// Cache
export { CacheService, getCacheService } from "./cache-service";

// Downgrade
export { DowngradeService } from "./downgrade.service";

// Errors
export {
  FeatureNotAvailableError,
  LimitReachedError,
  SubscriptionExpiredError,
} from "./errors";

// Middlewares
export {
  requireFeature,
  requireLimit,
  consumeFeature,
  withFeature,
  withLimit,
} from "./middleware";

// Experiments
export { isInExperiment, murmurhash, getExperimentBucket } from "./experiment";

// Types
export type {
  IEntitlementRepository,
  ICacheService,
  DebugTrace,
  ConsumeResult,
  EntitlementMap,
  ExperimentConfig,
  DowngradePreview,
  DowngradeFeatureImpact,
  FeatureType,
  OverrideScope,
  DowngradeStrategy,
  SubscriptionStatus,
  PlanRecord,
  FeatureRecord,
  PlanFeatureRecord,
  OrganizationRecord,
  SubscriptionRecord,
  EntitlementOverrideRecord,
  UsageTrackingRecord,
  CreateOverrideInput,
  ResolutionSource,
} from "./types";

// Factory for easy initialization
import { PrismaEntitlementRepository } from "./entitlement-repository";
import { getCacheService } from "./cache-service";
import { FeatureGateService } from "./feature-gate.service";
import { DowngradeService } from "./downgrade.service";

let gateInstance: FeatureGateService | null = null;
let downgradeInstance: DowngradeService | null = null;

/**
 * Get or create the singleton FeatureGateService.
 * Uses Prisma repository + cache service.
 */
export function getFeatureGateService(): FeatureGateService {
  if (!gateInstance) {
    const repository = new PrismaEntitlementRepository();
    const cache = getCacheService();
    gateInstance = new FeatureGateService(repository, cache);
  }
  return gateInstance;
}

/**
 * Get or create the singleton DowngradeService.
 */
export function getDowngradeService(): DowngradeService {
  if (!downgradeInstance) {
    const repository = new PrismaEntitlementRepository();
    const cache = getCacheService();
    const gate = getFeatureGateService();
    downgradeInstance = new DowngradeService(repository, gate, cache);
  }
  return downgradeInstance;
}
