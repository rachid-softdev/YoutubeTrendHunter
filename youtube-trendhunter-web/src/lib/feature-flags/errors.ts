// ============================================
// Feature Flags — Structured Errors
// ============================================

export class FeatureNotAvailableError extends Error {
  public readonly feature: string;
  public readonly planRequired: string;
  public readonly currentPlan: string;
  public readonly statusCode = 403;

  constructor(feature: string, planRequired: string, currentPlan: string) {
    super(`Feature "${feature}" not available on plan "${currentPlan}"`);
    this.name = "FeatureNotAvailableError";
    this.feature = feature;
    this.planRequired = planRequired;
    this.currentPlan = currentPlan;
  }

  toJSON() {
    return {
      error: "FEATURE_NOT_AVAILABLE",
      feature: this.feature,
      plan_required: this.planRequired,
      current_plan: this.currentPlan,
      upgrade_url: "/billing/upgrade",
    };
  }
}

export class LimitReachedError extends Error {
  public readonly feature: string;
  public readonly limit: number | null;
  public readonly used: number;
  public readonly resetAt: string;
  public readonly statusCode = 402;

  constructor(feature: string, limit: number | null, used: number, resetAt: string) {
    super(`Limit reached for "${feature}": ${used}/${limit ?? "∞"}`);
    this.name = "LimitReachedError";
    this.feature = feature;
    this.limit = limit;
    this.used = used;
    this.resetAt = resetAt;
  }

  toJSON() {
    return {
      error: "LIMIT_REACHED",
      feature: this.feature,
      limit: this.limit,
      used: this.used,
      reset_at: this.resetAt,
      upgrade_url: "/billing/upgrade",
    };
  }
}

export class SubscriptionExpiredError extends Error {
  public readonly statusCode = 402;

  constructor() {
    super("Subscription expired");
    this.name = "SubscriptionExpiredError";
  }

  toJSON() {
    return {
      error: "SUBSCRIPTION_EXPIRED",
      renew_url: "/billing",
    };
  }
}
