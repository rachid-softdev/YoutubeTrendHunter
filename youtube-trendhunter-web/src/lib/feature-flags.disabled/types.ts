// ============================================
// Feature Flags & Entitlements Types
// ============================================

import type { 
  Plan, 
  Feature, 
  PlanFeature, 
  Organization, 
  Subscription,
  EntitlementOverride,
  UsageTracking,
  FeatureType,
  DowngradeStrategy,
  OverrideScope,
  SubscriptionStatus
} from "@prisma/client"

// Re-export Prisma types
export type {
  Plan,
  Feature,
  PlanFeature,
  Organization,
  Subscription,
  EntitlementOverride,
  UsageTracking,
  FeatureType,
  DowngradeStrategy,
  OverrideScope,
  SubscriptionStatus
}

// ============================================
// Feature Gate Service Return Types
// ============================================

export type FeatureValue = boolean | number | null

export interface ConsumeResult {
  success: boolean
  feature: string
  used: number
  limit: number | null
  remaining: number | null
  resetAt?: Date
  error?: "LIMIT_REACHED" | "SUBSCRIPTION_EXPIRED"
  limitReached?: {
    feature: string
    limit: number
    used: number
    resetAt: Date
    upgradeUrl: string
  }
}

export interface EntitlementMap {
  plan: string
  planKey: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  usage: Record<string, number>
  resetAt: Record<string, Date | null>
  experimentBuckets: Record<string, boolean>
}

export type ResolveSource = "user_override" | "org_override" | "plan" | "fallback"

export interface DebugTrace {
  feature: string
  resolvedVia: ResolveSource
  value: FeatureValue
  overrideId?: string
  expiresAt?: Date
  planKey?: string
  planName?: string
  limitValue?: number | null
  configJson?: Record<string, unknown>
  isExperiment?: boolean
  experimentConfig?: ExperimentConfig
}

export interface ExperimentConfig {
  percentage: number
  seed: string
}

// ============================================
// Repository Interfaces
// ============================================

export interface IEntitlementRepository {
  // Plan
  getPlan(planKey: string): Promise<Plan | null>
  getAllPlans(): Promise<Plan[]>
  getActivePlans(): Promise<Plan[]>

  // Feature
  getFeature(featureKey: string): Promise<Feature | null>
  getAllFeatures(): Promise<Feature[]>
  getActiveFeatures(): Promise<Feature[]>

  // Plan Features
  getPlanFeatures(planId: string): Promise<PlanFeatureWithFeature[]>
  getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureWithFeature | null>

  // Organization
  getOrganization(orgId: string): Promise<OrganizationWithSubscription | null>

  // Subscription
  getActiveSubscription(orgId: string): Promise<Subscription | null>
  updateSubscription(orgId: string, data: Partial<Subscription>): Promise<Subscription>
  createSubscription(orgId: string, planKey: string, data?: Partial<Subscription>): Promise<Subscription>

  // Entitlement Overrides
  getOverride(scope: OverrideScope, scopeId: string, featureKey: string): Promise<EntitlementOverride | null>
  getOverridesForOrg(orgId: string): Promise<EntitlementOverride[]>
  getOverridesForUser(userId: string): Promise<EntitlementOverride[]>
  createOverride(data: Omit<EntitlementOverride, "id" | "createdAt" | "updatedAt">): Promise<EntitlementOverride>
  updateOverride(id: string, data: Partial<EntitlementOverride>): Promise<EntitlementOverride>
  deleteOverride(id: string): Promise<void>

  // Usage Tracking
  getCurrentUsage(orgId: string, featureKey: string): Promise<UsageTracking | null>
  getUsageForPeriod(orgId: string, featureKey: string, periodStart: Date): Promise<UsageTracking | null>
  createUsage(orgId: string, featureKey: string, periodStart: Date, periodEnd: Date): Promise<UsageTracking>
  consumeUsage(orgId: string, featureKey: string, amount: number): Promise<UsageTracking | null>

  // Stripe Events (idempotency)
  hasStripeEventBeenProcessed(eventId: string): Promise<boolean>
  markStripeEventProcessed(eventId: string, type: string): Promise<void>
}

export interface PlanFeatureWithFeature extends PlanFeature {
  feature: Feature
}

export interface OrganizationWithSubscription extends Organization {
  subscription?: Subscription | null
}

// ============================================
// Cache Interfaces
// ============================================

export interface ICacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, data: T, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  delPattern(pattern: string): Promise<void>
  publishInvalidation(orgId: string): Promise<void>
  subscribe(callback: (orgId: string) => void): () => void
}

export interface EntitlementCache {
  planKey: string
  planName: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  subscriptionStatus: SubscriptionStatus | null
  periodEnd: Date | null
  version: number // Pour invalidation
  cachedAt: number
}

// ============================================
// Error Types
// ============================================

export class FeatureNotAvailableError extends Error {
  feature: string
  planRequired: string
  currentPlan: string
  upgradeUrl: string

  constructor(feature: string, planRequired: string, currentPlan: string) {
    super(`Feature "${feature}" requires plan "${planRequired}", but current plan is "${currentPlan}"`)
    this.name = "FeatureNotAvailableError"
    this.feature = feature
    this.planRequired = planRequired
    this.currentPlan = currentPlan
    this.upgradeUrl = "/billing/upgrade"
  }

  toJSON() {
    return {
      error: "FEATURE_NOT_AVAILABLE",
      feature: this.feature,
      plan_required: this.planRequired,
      current_plan: this.currentPlan,
      upgrade_url: this.upgradeUrl
    }
  }
}

export class LimitReachedError extends Error {
  feature: string
  limit: number
  used: number
  resetAt: Date
  upgradeUrl: string

  constructor(feature: string, limit: number, used: number, resetAt: Date) {
    super(`Limit reached for "${feature}": ${used}/${limit}`)
    this.name = "LimitReachedError"
    this.feature = feature
    this.limit = limit
    this.used = used
    this.resetAt = resetAt
    this.upgradeUrl = "/billing/upgrade"
  }

  toJSON() {
    return {
      error: "LIMIT_REACHED",
      feature: this.feature,
      limit: this.limit,
      used: this.used,
      reset_at: this.resetAt.toISOString(),
      upgrade_url: this.upgradeUrl
    }
  }
}

export class SubscriptionExpiredError extends Error {
  renewUrl: string

  constructor() {
    super("Subscription expired")
    this.name = "SubscriptionExpiredError"
    this.renewUrl = "/billing"
  }

  toJSON() {
    return {
      error: "SUBSCRIPTION_EXPIRED",
      renew_url: this.renewUrl
    }
  }
}

// ============================================
// Downgrade Types
// ============================================

export interface DowngradePreview {
  featureKey: string
  featureName: string
  currentValue: boolean | number | null
  newValue: boolean | number | null
  strategy: DowngradeStrategy
  willLoseAccess: boolean
  currentPeriodEnd?: Date
}

export interface DowngradeImpact {
  willLoseFeatures: DowngradePreview[]
  willKeepFeatures: DowngradePreview[]
  currentPeriodEnd: Date | null
  effectiveDate: Date | null
}

// ============================================
// API Response Types
// ============================================

export interface EntitlementsResponse {
  plan: string
  planKey: string
  features: Record<string, boolean>
  limits: Record<string, number | null>
  usage: Record<string, number>
  resetAt: Record<string, string | null>
  experimentBuckets: Record<string, boolean>
}

// ============================================
// Pagination Types
// ============================================

export interface PaginationParams {
  page: number
  limit: number
  sort?: string // "key:asc", "name:desc", etc.
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}