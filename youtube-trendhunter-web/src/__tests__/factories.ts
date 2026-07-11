import {
  AlertChannel,
  AlertType,
  AuditAction,
  DowngradeStrategy,
  FeatureType,
  JobStatus,
  OverrideScope,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  TrendStatus,
} from "@prisma/client";
import type {
  Account,
  Alert,
  ApiToken,
  AuditLog,
  EntitlementOverride,
  Feature,
  Job,
  Niche,
  Organization,
  Plan,
  PlanFeature,
  Session,
  StripeEvent,
  Subscription,
  Trend,
  UsageTracking,
  User,
  UserNiche,
  UserRole,
  Webhook,
} from "@prisma/client";

const EPOCH = new Date(0);

/**
 * Builders return a *complete, valid* Prisma object. The base object is
 * exhaustive so the `as X` cast is a valid direct assertion (no
 * `as unknown as`). Partial overrides are merged with `{ ...base, ...partial }`.
 */

export function makeSubscription(partial: Partial<Subscription> = {}): Subscription {
  const base: Subscription = {
    id: "sub_default",
    userId: "user_default",
    orgId: null,
    planKey: null,
    plan: "FREE" as SubscriptionPlan,
    status: "ACTIVE" as SubscriptionStatus,
    stripeSubscriptionId: null,
    stripePriceId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    stripeCurrentPeriodEnd: null,
    trialEnd: null,
    trialStart: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Subscription;
}

export function makeNiche(partial: Partial<Niche> = {}): Niche {
  const base: Niche = {
    id: "niche_default",
    slug: "default-niche",
    name: "Default Niche",
    description: null,
    keywords: [],
    language: "fr",
    isActive: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Niche;
}

export function makeUserNiche(partial: Partial<UserNiche> = {}): UserNiche {
  const base: UserNiche = {
    id: "userniche_default",
    userId: "user_default",
    nicheId: "niche_default",
    createdAt: EPOCH,
  };
  return { ...base, ...partial } as UserNiche;
}

export function makeUser(partial: Partial<User> = {}): User {
  const base: User = {
    id: "user_default",
    name: null,
    email: "user@example.com",
    emailVerified: null,
    image: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    role: Role.USER,
    orgId: null,
    stripeCustomerId: null,
  };
  return { ...base, ...partial } as User;
}

export function makeTrend(partial: Partial<Trend> = {}): Trend {
  const base: Trend = {
    id: "trend_default",
    nicheId: "niche_default",
    title: "Default Trend",
    description: null,
    score: 0,
    velocity: 0,
    status: "EMERGING" as TrendStatus,
    searchVolume: null,
    videoCount: null,
    avgViews: null,
    contentAngles: [],
    detectedAt: EPOCH,
    expiresAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Trend;
}

export function makeAlert(partial: Partial<Alert> = {}): Alert {
  const base: Alert = {
    id: "alert_default",
    userId: "user_default",
    nicheId: null,
    type: "SCORE_THRESHOLD" as AlertType,
    threshold: 70,
    channel: "EMAIL" as AlertChannel,
    webhookUrl: null,
    isActive: true,
    lastSentAt: null,
    createdAt: EPOCH,
  };
  return { ...base, ...partial } as Alert;
}

export function makeApiToken(partial: Partial<ApiToken> = {}): ApiToken {
  const base: ApiToken = {
    id: "apitoken_default",
    userId: "user_default",
    token: "token_default",
    name: "Extension Chrome",
    lastUsedAt: null,
    expiresAt: null,
    createdAt: EPOCH,
  };
  return { ...base, ...partial } as ApiToken;
}

export function makeAuditLog(partial: Partial<AuditLog> = {}): AuditLog {
  const base: AuditLog = {
    id: "auditlog_default",
    userId: "user_default",
    action: "USER_LOGIN" as AuditAction,
    ipAddress: null,
    userAgent: null,
    metadata: null,
    createdAt: EPOCH,
  };
  return { ...base, ...partial } as AuditLog;
}

export function makeJob(partial: Partial<Job> = {}): Job {
  const base: Job = {
    id: "job_default",
    type: "TREND_SCORE",
    status: "PENDING" as JobStatus,
    payload: {},
    result: null,
    error: null,
    progress: 0,
    attempts: 0,
    maxAttempts: 3,
    lockedAt: null,
    lockedBy: null,
    nicheId: null,
    userId: null,
    createdAt: EPOCH,
    startedAt: null,
    completedAt: null,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Job;
}

export function makeOrganization(partial: Partial<Organization> = {}): Organization {
  const base: Organization = {
    id: "org_default",
    name: "Default Organization",
    stripeCustomerId: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Organization;
}

export function makePlan(partial: Partial<Plan> = {}): Plan {
  const base: Plan = {
    id: "plan_default",
    key: "free",
    name: "Free",
    priceMonthly: 0,
    isActive: true,
    sortOrder: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Plan;
}

export function makeFeature(partial: Partial<Feature> = {}): Feature {
  const base: Feature = {
    id: "feature_default",
    key: "FEATURE",
    name: "Feature",
    description: null,
    type: "BOOLEAN" as FeatureType,
    defaultConfig: null,
    isActive: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Feature;
}

export function makePlanFeature(partial: Partial<PlanFeature> = {}): PlanFeature {
  const base: PlanFeature = {
    id: "planfeature_default",
    planId: "plan_default",
    featureId: "feature_default",
    enabled: false,
    limitValue: null,
    configJson: null,
    downgradeStrategy: "GRACEFUL" as DowngradeStrategy,
    sortOrder: 0,
  };
  return { ...base, ...partial } as PlanFeature;
}

export function makeEntitlementOverride(
  partial: Partial<EntitlementOverride> = {},
): EntitlementOverride {
  const base: EntitlementOverride = {
    id: "override_default",
    scope: "USER" as OverrideScope,
    scopeId: "user_default",
    featureKey: "FEATURE",
    enabled: false,
    limitValue: null,
    configJson: null,
    expiresAt: null,
    reason: "test",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    organizationId: null,
  };
  return { ...base, ...partial } as EntitlementOverride;
}

export function makeUsageTracking(partial: Partial<UsageTracking> = {}): UsageTracking {
  const base: UsageTracking = {
    id: "usage_default",
    orgId: "org_default",
    featureKey: "FEATURE",
    usageCount: 0,
    periodStart: EPOCH,
    periodEnd: EPOCH,
  };
  return { ...base, ...partial } as UsageTracking;
}

export function makeUserRole(partial: Partial<UserRole> = {}): UserRole {
  const base: UserRole = {
    id: "userrole_default",
    userId: "user_default",
    role: Role.USER,
  };
  return { ...base, ...partial } as UserRole;
}

export function makeAccount(partial: Partial<Account> = {}): Account {
  const base: Account = {
    id: "account_default",
    userId: "user_default",
    type: "oauth",
    provider: "google",
    providerAccountId: "provider_default",
    refresh_token: null,
    access_token: null,
    expires_at: null,
    token_type: null,
    scope: null,
    id_token: null,
    session_state: null,
  };
  return { ...base, ...partial } as Account;
}

export function makeSession(partial: Partial<Session> = {}): Session {
  const base: Session = {
    id: "session_default",
    sessionToken: "session_token_default",
    userId: "user_default",
    expires: EPOCH,
  };
  return { ...base, ...partial } as Session;
}

export function makeWebhook(partial: Partial<Webhook> = {}): Webhook {
  const base: Webhook = {
    id: "webhook_default",
    orgId: "org_default",
    url: "https://example.com/webhook",
    events: [],
    secret: "secret_default",
    isActive: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
  return { ...base, ...partial } as Webhook;
}

export function makeStripeEvent(partial: Partial<StripeEvent> = {}): StripeEvent {
  const base: StripeEvent = {
    id: "stripeevent_default",
    eventId: "evt_default",
    type: "invoice.paid",
    processed: false,
    createdAt: EPOCH,
  };
  return { ...base, ...partial } as StripeEvent;
}
