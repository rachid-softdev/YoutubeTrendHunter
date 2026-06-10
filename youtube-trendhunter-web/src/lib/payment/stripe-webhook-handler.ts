/**
 * Stripe webhook event routing — maps event types to handlers.
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/retry";
import { stripe } from "@/lib/stripe";
import { getPlanFromPriceId } from "./stripe-config";
import { mapStripeStatus } from "./stripe-status-mapper";
import type { WebhookResult } from "./provider";

type WebhookEventHandler = (event: Stripe.Event) => Promise<WebhookResult>;

/** Safely extract the first price ID from a Stripe subscription's items list. */
function getPriceIdFromSub(sub: Stripe.Subscription): string | null {
  return sub.items.data[0]?.price?.id ?? null;
}

const handlers: Record<string, WebhookEventHandler> = {
  "checkout.session.completed": async (event) => {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") {
      return { handled: false, eventType: event.type };
    }

    const subscriptionId = session.subscription;
    if (typeof subscriptionId !== "string") {
      return { handled: false, eventType: event.type };
    }

    const sub = await withRetry(() => stripe.subscriptions.retrieve(subscriptionId), {
      maxRetries: 2,
      baseDelayMs: 500,
      timeoutMs: 20000,
    });
    const userId = sub.metadata.userId;
    if (!userId) {
      console.warn("[Stripe Webhook] checkout.session.completed: no userId in metadata");
      return { handled: false, eventType: event.type };
    }

    const priceId = getPriceIdFromSub(sub);
    if (!priceId) {
      console.warn("[Stripe Webhook] checkout.session.completed: no items in subscription");
      return { handled: false, eventType: event.type };
    }
    const plan = getPlanFromPriceId(priceId);
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
        plan,
        status: "ACTIVE",
      },
      update: {
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
        plan,
        status: "ACTIVE",
      },
    });

    return { handled: true, eventType: event.type };
  },

  "invoice.payment_failed": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    console.warn(
      `[Stripe Webhook] Payment failed for invoice ${invoice.id}` +
        (invoice.subscription ? `, sub: ${invoice.subscription}` : ""),
    );
    // The `customer.subscription.updated` event (already handled below)
    // will update the DB status to PAST_DUE. This handler exists for
    // observability and alerting.
    return { handled: true, eventType: event.type };
  },

  "invoice.payment_succeeded": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    if (!invoice.subscription) {
      return { handled: false, eventType: event.type };
    }

    const subscriptionId =
      typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;

    const sub = await withRetry(() => stripe.subscriptions.retrieve(subscriptionId), {
      maxRetries: 2,
      baseDelayMs: 500,
      timeoutMs: 20000,
    });
    const userId = sub.metadata.userId;
    if (!userId) {
      return { handled: false, eventType: event.type };
    }

    await prisma.subscription.update({
      where: { userId },
      data: {
        stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
        status: "ACTIVE",
      },
    });

    return { handled: true, eventType: event.type };
  },

  "customer.subscription.updated": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata.userId;
    if (!userId) {
      return { handled: false, eventType: event.type };
    }

    const status = mapStripeStatus(subscription.status);
    const priceId = getPriceIdFromSub(subscription) ?? "unknown";
    const plan = getPlanFromPriceId(priceId);

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        plan,
        status,
        stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
      update: {
        stripePriceId: priceId,
        plan,
        status,
        stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });

    return { handled: true, eventType: event.type };
  },

  "customer.subscription.deleted": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata.userId;
    if (!userId) {
      return { handled: false, eventType: event.type };
    }

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        status: "CANCELED",
        plan: "FREE",
      },
      update: {
        status: "CANCELED",
        plan: "FREE",
      },
    });

    return { handled: true, eventType: event.type };
  },

  "customer.subscription.trial_will_end": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata.userId;
    console.log(`[Stripe Webhook] Trial will end soon for user ${userId}`);
    return { handled: true, eventType: event.type };
  },
};

/**
 * Get the appropriate handler for a Stripe event type.
 */
export function getWebhookHandler(eventType: string): WebhookEventHandler | null {
  return handlers[eventType] ?? null;
}
