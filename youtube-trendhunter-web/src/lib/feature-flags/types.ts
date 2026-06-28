// ============================================
// Feature Flags & Entitlements — Core Types
// ============================================

// ─── Feature Types ───

export type FeatureType = "BOOLEAN" | "LIMIT" | "EXPERIMENT";

export type OverrideScope = "ORG" | "USER";

export type DowngradeStrategy = "GRACEFUL" | "IMMEDIATE" | "FREEZE";

export type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE" | "TRIALING" | "INCOMPLETE";

// ─── Resolution ───

export type ResolutionSource = "user_override" | "org_override" | "plan" | "fallback";

export interface DebugTrace {
  feature: string;
  resolvedVia: ResolutionSource;
  value: boolean | number | null;
  overrideId?: string;
  expiresAt?: Date;
  planKey?: string;
  limitValue?: number | null;
  experimentConfig?: { percentage: number; seed: string } | null;
}

export interface ConsumeResult {
  success: boolean;
  used: number;
  remaining: number | null;
  error?: "LIMIT_REACHED" | "FEATURE_NOT_AVAILABLE";
  limitReached?: {
    feature: string;
    limit: number | null;
    used: number;
    resetAt: string;
  };
}

export interface EntitlementMap {
  planKey: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  experiments?: Record<string, { percentage: number; seed: string }>;
}

export interface ExperimentConfig {
  percentage: number;
  seed: string;
}

// ─── Downgrade Preview ───

export interface DowngradeFeatureImpact {
  featureKey: string;
  featureName: string;
  featureType: FeatureType;
  currentValue: boolean | number | null;
  newValue: boolean | number | null;
  strategy: DowngradeStrategy;
  impact: "full_loss" | "limited" | "frozen" | "unaffected";
}

export interface DowngradePreview {
  fromPlan: string;
  toPlan: string;
  impactedFeatures: DowngradeFeatureImpact[];
  totalFeatures: number;
  affectedCount: number;
}

// ─── Repository Interface ───
// This is the persistence abstraction. FeatureGateService depends on this,
// never on Prisma directly.

export interface IEntitlementRepository {
  // Plans
  getPlan(planKey: string): Promise<PlanRecord | null>;
  getAllPlans(): Promise<PlanRecord[]>;
  getActivePlans(): Promise<PlanRecord[]>;

  // Features
  getFeature(featureKey: string): Promise<FeatureRecord | null>;
  getAllFeatures(): Promise<FeatureRecord[]>;
  getActiveFeatures(): Promise<FeatureRecord[]>;

  // Plan Features
  getPlanFeatures(planId: string): Promise<PlanFeatureRecord[]>;
  getPlanFeature(planId: string, featureKey: string): Promise<PlanFeatureRecord | null>;

  // Organization
  getOrganization(orgId: string): Promise<OrganizationRecord | null>;

  // Subscription
  getActiveSubscription(orgId: string): Promise<SubscriptionRecord | null>;
  updateSubscription(orgId: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord>;
  createSubscription(
    orgId: string,
    planKey: string,
    data?: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord>;

  // Overrides
  getOverride(
    scope: OverrideScope,
    scopeId: string,
    featureKey: string,
  ): Promise<EntitlementOverrideRecord | null>;
  getOverridesForOrg(orgId: string): Promise<EntitlementOverrideRecord[]>;
  getOverridesForUser(userId: string): Promise<EntitlementOverrideRecord[]>;
  createOverride(data: CreateOverrideInput): Promise<EntitlementOverrideRecord>;
  updateOverride(id: string, data: Partial<EntitlementOverrideRecord>): Promise<EntitlementOverrideRecord>;
  deleteOverride(id: string): Promise<void>;

  // Usage
  getCurrentUsage(
    orgId: string,
    featureKey: string,
  ): Promise<UsageTrackingRecord | null>;
  getUsageForPeriod(
    orgId: string,
    featureKey: string,
    periodStart: Date,
  ): Promise<UsageTrackingRecord | null>;
  createUsage(
    orgId: string,
    featureKey: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageTrackingRecord>;
  consumeUsage(
    orgId: string,
    featureKey: string,
    amount: number,
    maxAllowed?: number,
  ): Promise<{ success: boolean; usageCount: number } | null>;

  // Stripe events
  hasStripeEventBeenProcessed(eventId: string): Promise<boolean>;
  markStripeEventProcessed(eventId: string, type: string): Promise<void>;

  // Downgrade
  getPlanFeaturesForPlan(planId: string): Promise<PlanFeatureRecord[]>;
}

// ─── Record Types (matching Prisma shapes) ───

export interface PlanRecord {
  id: string;
  key: string;
  name: string;
  priceMonthly: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: FeatureType;
  defaultConfig: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanFeatureRecord {
  id: string;
  planId: string;
  featureId: string;
  enabled: boolean;
  limitValue: number | null;
  configJson: Record<string, unknown> | null;
  downgradeStrategy: DowngradeStrategy;
  sortOrder: number;
  plan?: PlanRecord;
  feature?: FeatureRecord;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  orgId: string | null;
  planKey: string | null;
  plan: string;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  stripeCurrentPeriodEnd: Date | null;
  trialEnd: Date | null;
  trialStart: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntitlementOverrideRecord {
  id: string;
  scope: OverrideScope;
  scopeId: string;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  configJson: Record<string, unknown> | null;
  expiresAt: Date | null;
  reason: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageTrackingRecord {
  id: string;
  orgId: string;
  featureKey: string;
  usageCount: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface CreateOverrideInput {
  scope: OverrideScope;
  scopeId: string;
  featureKey: string;
  enabled: boolean;
  limitValue?: number | null;
  configJson?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  reason: string;
  organizationId?: string | null;
}

// ─── Cache Interface ───

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, data: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
  publishInvalidation(orgId: string): Promise<void>;
  subscribe(callback: (orgId: string) => void): () => void;
}

// ─── Middleware types ───

export interface EntitlementRequest {
  orgId: string;
  userId: string;
}

export type NextHandler<T = Response> = (req: EntitlementRequest) => Promise<T> | T;
