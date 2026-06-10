/**
 * Subscription / plan types.
 *
 * Canonical source for PlanType and PlanStatus.
 * PlanType mirrors SubscriptionPlan from Prisma.
 * PlanStatus mirrors SubscriptionStatus from Prisma.
 */

export type PlanType = "FREE" | "PRO" | "TEAM";
export type PlanStatus = "ACTIVE" | "CANCELED" | "PAST_DUE" | "TRIALING" | "INCOMPLETE";
