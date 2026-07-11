import type Stripe from "stripe";
import type { PlanType } from "./provider";

interface SubscriptionPeriodEnd {
  current_period_end?: number;
  currentPeriodEnd?: number;
}

/** Helper to get the subscription period end, compatible with Stripe API v6+ camelCase changes. */
export function getPeriodEnd(
  sub: Stripe.Subscription | Stripe.Response<Stripe.Subscription>,
): number {
  const view = sub as SubscriptionPeriodEnd;
  return view.current_period_end ?? view.currentPeriodEnd ?? 0;
}

/**
 * Stripe configuration — centralized access to Stripe-related environment variables.
 */

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "Check your .env file or Vercel project settings.",
    );
  }
  return val;
}

export const stripeConfig = {
  get secretKey() {
    return requireEnv("STRIPE_SECRET_KEY");
  },
  get webhookSecret() {
    return requireEnv("STRIPE_WEBHOOK_SECRET");
  },
  get proPriceId() {
    return requireEnv("STRIPE_PRO_PRICE_ID");
  },
  get teamPriceId() {
    return requireEnv("STRIPE_TEAM_PRICE_ID");
  },
  get allowedPriceIds(): string[] {
    return [this.proPriceId, this.teamPriceId];
  },
};

/** Get the plan type from a Stripe price ID */
export function getPlanFromPriceId(priceId: string): PlanType {
  if (priceId === stripeConfig.proPriceId) return "PRO";
  if (priceId === stripeConfig.teamPriceId) return "TEAM";
  return "FREE";
}
