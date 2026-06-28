/**
 * Stripe webhook event routing — maps event types to handlers.
 *
 * Handles org-based subscriptions with cache invalidation.
 * Each event logs the resolved org_id.
 */

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/retry";
import { stripe } from "@/lib/stripe";
import { getPeriodEnd, getPlanFromPriceId } from "./stripe-config";
import { mapStripeStatus } from "./stripe-status-mapper";
import { getFeatureGateService, getDowngradeService } from "@/lib/feature-flags";
import { log } from "@/lib/logger";
import type { WebhookResult } from "./provider";

type WebhookEventHandler = (event: Stripe.Event) => Promise<WebhookResult>;

/** Safely extract the first price ID from a Stripe subscription's items list. */
function getPriceIdFromSub(sub: Stripe.Subscription): string | null {
  return sub.items.data[0]?.price?.id ?? null;
}

/**
 * Resolve orgId from a Stripe subscription's metadata or from the user.
 */
async function resolveOrgId(sub: Stripe.Subscription): Promise<string | null> {
  // Direct orgId in metadata (preferred for org-based subscriptions)
  if (sub.metadata.orgId) return sub.metadata.orgId;

  // Fallback: resolve via userId in metadata
  const userId = sub.metadata.userId;
  if (!userId) return null;

  // Try to get org from user
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    return user?.orgId ?? null;
  } catch {
    return null;
  }
}

const handlers: Record<string, WebhookEventHandler> = {
  // ─── customer.subscription.created ───

  "customer.subscription.created": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = await resolveOrgId(subscription);
    const userId = subscription.metadata.userId;

    if (!orgId && !userId) {
      log("warn", "[Stripe Webhook] customer.subscription.created: no orgId or userId in metadata");
      return { handled: false, eventType: event.type };
    }

    const priceId = getPriceIdFromSub(subscription) ?? "unknown";
    const plan = getPlanFromPriceId(priceId);
    const status = mapStripeStatus(subscription.status);

    try {
      if (orgId) {
        // Find a user in this org for the subscription
        const orgUser = await prisma.user.findFirst({ where: { orgId } });
        if (orgUser) {
          await prisma.subscription.upsert({
            where: { userId: orgUser.id },
            create: {
              userId: orgUser.id,
              planKey: plan.toLowerCase(),
              orgId,
              plan,
              status,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              currentPeriodStart: new Date(getPeriodEnd(subscription) * 1000 - 30 * 24 * 60 * 60 * 1000),
              currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
              stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
            },
            update: {
              planKey: plan.toLowerCase(),
              orgId,
              plan,
              status,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
              stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
            },
          });
        }
      } else if (userId) {
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            planKey: plan.toLowerCase(),
            plan,
            status,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            currentPeriodStart: new Date(getPeriodEnd(subscription) * 1000 - 30 * 24 * 60 * 60 * 1000),
            currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
            stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
          },
          update: {
            planKey: plan.toLowerCase(),
            plan,
            status,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
            stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
          },
        });
      }

      // Invalidate cache
      if (orgId) {
        const gate = getFeatureGateService();
        await gate.invalidateCache(orgId);
      }

      log("info", "[Stripe Webhook] Subscription created", {
        orgId,
        userId,
        plan,
        subscriptionId: subscription.id,
        eventId: event.id,
      });

      return { handled: true, eventType: event.type };
    } catch (err) {
      log("error", "[Stripe Webhook] Failed to create subscription", {
        orgId,
        userId,
        subscriptionId: subscription.id,
        error: String(err),
        eventId: event.id,
      });
      throw err;
    }
  },

  // ─── customer.subscription.updated ───

  "customer.subscription.updated": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = await resolveOrgId(subscription);
    const userId = subscription.metadata.userId;

    if (!orgId && !userId) {
      log("warn", "[Stripe Webhook] customer.subscription.updated: no identifiers");
      return { handled: false, eventType: event.type };
    }

    const status = mapStripeStatus(subscription.status);
    const priceId = getPriceIdFromSub(subscription) ?? "unknown";
    const plan = getPlanFromPriceId(priceId);
    const newPlanKey = plan.toLowerCase();

    try {
      // Capture old plan key before mutation (for downgrade detection)
      let oldPlanKey: string | null = null;
      if (orgId) {
        const currentSub = await prisma.subscription.findFirst({
          where: { orgId },
          orderBy: { updatedAt: "desc" },
          select: { planKey: true },
        });
        oldPlanKey = currentSub?.planKey ?? null;
      }

      // Apply downgrade strategy BEFORE updating DB so DowngradeService
      // reads the OLD subscription (not the already-updated one)
      if (orgId && oldPlanKey && oldPlanKey !== newPlanKey) {
        try {
          const downgrade = getDowngradeService();
          await downgrade.applyDowngradeStrategy(orgId, oldPlanKey, newPlanKey);
        } catch (downgradeErr) {
          log("error", "[Stripe Webhook] Downgrade failed, continuing", {
            orgId, error: String(downgradeErr), eventId: event.id,
          });
        }
      }

      const updateData = {
        stripePriceId: priceId,
        planKey: newPlanKey,
        plan,
        status,
        stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
        currentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
      };

      if (orgId) {
        // Update all subscriptions for this org
        await prisma.subscription.updateMany({
          where: { orgId },
          data: updateData as Record<string, unknown>,
        });
      } else if (userId) {
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            ...updateData,
            stripeSubscriptionId: subscription.id,
          } as any,
          update: updateData as Record<string, unknown>,
        });
      }

      // Invalidate cache (always, even if downgrade failed)
      if (orgId) {
        const gate = getFeatureGateService();
        await gate.invalidateCache(orgId);
      }

      log("info", "[Stripe Webhook] Subscription updated", {
        orgId,
        userId,
        status,
        oldPlan: oldPlanKey,
        newPlan: newPlanKey,
        subscriptionId: subscription.id,
        eventId: event.id,
      });

      return { handled: true, eventType: event.type };
    } catch (err) {
      log("error", "[Stripe Webhook] Failed to update subscription", {
        orgId,
        userId,
        status,
        error: String(err),
        eventId: event.id,
      });
      throw err;
    }
  },

  // ─── customer.subscription.deleted ───

  "customer.subscription.deleted": async (event) => {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = await resolveOrgId(subscription);
    const userId = subscription.metadata.userId;

    try {
      // Capture old plan key before mutation
      let oldPlanKey: string | null = null;
      if (orgId) {
        const currentSub = await prisma.subscription.findFirst({
          where: { orgId },
          orderBy: { updatedAt: "desc" },
          select: { planKey: true },
        });
        oldPlanKey = currentSub?.planKey ?? null;
      }

      // Apply downgrade strategy BEFORE updating DB (reads old subscription)
      if (orgId && oldPlanKey && oldPlanKey !== "free") {
        try {
          const downgrade = getDowngradeService();
          await downgrade.applyDowngradeStrategy(orgId, oldPlanKey, "free");
        } catch (downgradeErr) {
          log("error", "[Stripe Webhook] Downgrade on deletion failed, continuing", {
            orgId, error: String(downgradeErr), eventId: event.id,
          });
        }
      }

      if (orgId) {
        await prisma.subscription.updateMany({
          where: { orgId },
          data: { status: "CANCELED", planKey: "free", plan: "FREE" },
        });
      } else if (userId) {
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeSubscriptionId: subscription.id,
            status: "CANCELED",
            planKey: "free",
            plan: "FREE",
          },
          update: {
            status: "CANCELED",
            planKey: "free",
            plan: "FREE",
          },
        });
      }

      if (orgId) {
        const gate = getFeatureGateService();
        await gate.invalidateCache(orgId);
      }

      log("info", "[Stripe Webhook] Subscription deleted", {
        orgId,
        userId,
        oldPlan: oldPlanKey,
        subscriptionId: subscription.id,
        eventId: event.id,
      });

      return { handled: true, eventType: event.type };
    } catch (err) {
      log("error", "[Stripe Webhook] Failed to delete subscription", {
        orgId,
        userId,
        error: String(err),
        eventId: event.id,
      });
      throw err;
    }
  },

  // ─── invoice.payment_succeeded ───

  "invoice.payment_succeeded": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const invSub = (invoice as unknown as { subscription: string | Stripe.Subscription | null })
      .subscription;
    if (!invSub) {
      return { handled: false, eventType: event.type };
    }

    const subscriptionId = typeof invSub === "string" ? invSub : invSub.id;

    // Retrieve fresh subscription data
    const sub = await withRetry(() => stripe.subscriptions.retrieve(subscriptionId), {
      maxRetries: 2,
      baseDelayMs: 500,
      timeoutMs: 20000,
    });

    const orgId = await resolveOrgId(sub);
    const userId = sub.metadata.userId;

    try {
      const periodEnd = new Date(getPeriodEnd(sub) * 1000);

      if (orgId) {
        await prisma.subscription.updateMany({
          where: { orgId },
          data: {
            stripeCurrentPeriodEnd: periodEnd,
            currentPeriodEnd: periodEnd,
            status: "ACTIVE",
          },
        });
      } else if (userId) {
        await prisma.subscription.update({
          where: { userId },
          data: {
            stripeCurrentPeriodEnd: periodEnd,
            currentPeriodEnd: periodEnd,
            status: "ACTIVE",
          },
        });
      }

      // Invalidate cache
      if (orgId) {
        const gate = getFeatureGateService();
        await gate.invalidateCache(orgId);
      }

      log("info", "[Stripe Webhook] Payment succeeded, period renewed", {
        orgId,
        userId,
        periodEnd: periodEnd.toISOString(),
        subscriptionId,
        eventId: event.id,
      });

      return { handled: true, eventType: event.type };
    } catch (err) {
      log("error", "[Stripe Webhook] Failed to process payment success", {
        orgId,
        userId,
        error: String(err),
        eventId: event.id,
      });
      throw err;
    }
  },

  // ─── invoice.payment_failed ───

  "invoice.payment_failed": async (event) => {
    const invoice = event.data.object as Stripe.Invoice;
    const invSub = (invoice as unknown as { subscription: string | Stripe.Subscription | null })
      .subscription;
    if (!invSub) {
      return { handled: false, eventType: event.type };
    }

    const subscriptionId = typeof invSub === "string" ? invSub : invSub.id;

    const sub = await withRetry(() => stripe.subscriptions.retrieve(subscriptionId), {
      maxRetries: 2,
      baseDelayMs: 500,
      timeoutMs: 20000,
    });

    const orgId = await resolveOrgId(sub);
    const userId = sub.metadata.userId;

    try {
      if (orgId) {
        await prisma.subscription.updateMany({
          where: { orgId },
          data: { status: "PAST_DUE" },
        });
      } else if (userId) {
        await prisma.subscription.update({
          where: { userId },
          data: { status: "PAST_DUE" },
        });
      }

      if (orgId) {
        const gate = getFeatureGateService();
        await gate.invalidateCache(orgId);
      }

      log("warn", "[Stripe Webhook] Payment failed", {
        orgId,
        userId,
        invoiceId: invoice.id,
        subscriptionId,
        eventId: event.id,
      });

      return { handled: true, eventType: event.type };
    } catch (err) {
      log("error", "[Stripe Webhook] Failed to process payment failure", {
        orgId,
        userId,
        error: String(err),
        eventId: event.id,
      });
      throw err;
    }
  },

  // ─── checkout.session.completed (backward compat) ───

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
      log("warn", "[Stripe Webhook] checkout.session.completed: no userId in metadata");
      return { handled: false, eventType: event.type };
    }

    const priceId = getPriceIdFromSub(sub);
    if (!priceId) {
      log("warn", "[Stripe Webhook] checkout.session.completed: no items in subscription");
      return { handled: false, eventType: event.type };
    }

    const plan = getPlanFromPriceId(priceId);

    // Resolve orgId from user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    const orgId = user?.orgId;

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        orgId,
        planKey: plan.toLowerCase(),
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
        currentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
        plan,
        status: "ACTIVE",
      },
      update: {
        orgId,
        planKey: plan.toLowerCase(),
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
        currentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
        plan,
        status: "ACTIVE",
      },
    });

    if (orgId) {
      const gate = getFeatureGateService();
      await gate.invalidateCache(orgId);
    }

    log("info", "[Stripe Webhook] Checkout completed", {
      orgId,
      userId,
      plan,
      subscriptionId: sub.id,
      eventId: event.id,
    });

    return { handled: true, eventType: event.type };
  },
};

/**
 * Get the appropriate handler for a Stripe event type.
 */
export function getWebhookHandler(eventType: string): WebhookEventHandler | null {
  return handlers[eventType] ?? null;
}
