/**
 * Maps Stripe subscription statuses to internal SubscriptionStatus.
 */
import type Stripe from "stripe";
import type { SubscriptionStatus } from "./provider";

export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "trialing":
      return "TRIALING";
    default: {
      console.warn(`[Stripe] Unknown status: ${stripeStatus}, defaulting to INCOMPLETE`);
      return "INCOMPLETE";
    }
  }
}
