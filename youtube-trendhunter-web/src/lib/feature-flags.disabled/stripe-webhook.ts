// ============================================
// Stripe Webhook Handler - Production Ready
// ============================================

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { entitlementRepository } from "./repository";
import { featureGateService } from "./service";
import { cacheService } from "./cache";
import Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Plan key mapping from Stripe price IDs
function getPlanKeyFromPriceId(priceId: string): string {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const teamPriceId = process.env.STRIPE_TEAM_PRICE_ID;
  const enterprisePriceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;

  if (priceId === proPriceId) return "pro";
  if (priceId === teamPriceId) return "team";
  if (priceId === enterprisePriceId) return "enterprise";
  return "free";
}

// Get userId from Stripe metadata or customer
async function resolveUserIdFromStripe(subscription: Stripe.Subscription): Promise<string | null> {
  // Priority: metadata.userId
  if (subscription.metadata.userId) {
    return subscription.metadata.userId;
  }

  // Fallback: resolve via customer
  if (subscription.customer) {
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  return null;
}

// Resolve orgId from userId
async function resolveOrgIdFromUserId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });
  return user?.orgId ?? null;
}

// ============================================
// Event Handlers
// ============================================

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== "subscription") return;

  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) {
    console.error("[StripeWebhook] No userId found for subscription", subscriptionId);
    return;
  }

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) {
    console.error("[StripeWebhook] No orgId found for user", userId);
    return;
  }

  const planKey = getPlanKeyFromPriceId(subscription.items.data[0].price.id);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  // Create or update subscription
  await entitlementRepository.createSubscription(orgId, planKey, {
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0].price.id,
    status: "ACTIVE",
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: periodEnd,
  });

  // Invalidate cache
  await featureGateService.invalidateCache(orgId);

  console.log(`[StripeWebhook] Checkout completed for org ${orgId}, plan: ${planKey}`);
}

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) {
    console.error("[StripeWebhook] No userId found for subscription", subscription.id);
    return;
  }

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) {
    console.error("[StripeWebhook] No orgId found for user", userId);
    return;
  }

  const planKey = getPlanKeyFromPriceId(subscription.items.data[0].price.id);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  await entitlementRepository.createSubscription(orgId, planKey, {
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0].price.id,
    status: subscription.status === "trialing" ? "TRIALING" : "ACTIVE",
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: periodEnd,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
  });

  await featureGateService.invalidateCache(orgId);

  console.log(`[StripeWebhook] Subscription created for org ${orgId}, plan: ${planKey}`);
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) {
    console.error("[StripeWebhook] No userId found for subscription", subscription.id);
    return;
  }

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) {
    console.error("[StripeWebhook] No orgId found for user", userId);
    return;
  }

  const planKey = getPlanKeyFromPriceId(subscription.items.data[0].price.id);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  // Determine status
  let status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" = "ACTIVE";
  if (subscription.status === "trialing") status = "TRIALING";
  if (subscription.status === "past_due") status = "PAST_DUE";
  if (subscription.status === "canceled") status = "CANCELED";

  await entitlementRepository.updateSubscription(orgId, {
    planKey,
    stripePriceId: subscription.items.data[0].price.id,
    status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: periodEnd,
  });

  await featureGateService.invalidateCache(orgId);

  console.log(
    `[StripeWebhook] Subscription updated for org ${orgId}, plan: ${planKey}, status: ${status}`,
  );
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) return;

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) return;

  await entitlementRepository.updateSubscription(orgId, {
    planKey: "free",
    status: "CANCELED",
  });

  await featureGateService.invalidateCache(orgId);

  console.log(`[StripeWebhook] Subscription deleted for org ${orgId}`);
}

async function handlePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  if (!invoice.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) return;

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) return;

  const periodEnd = new Date(subscription.current_period_end * 1000);

  await entitlementRepository.updateSubscription(orgId, {
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: periodEnd,
    status: "ACTIVE",
  });

  await featureGateService.invalidateCache(orgId);

  console.log(`[StripeWebhook] Payment succeeded for org ${orgId}`);
}

async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  if (!invoice.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) return;

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) return;

  await entitlementRepository.updateSubscription(orgId, {
    status: "PAST_DUE",
  });

  await featureGateService.invalidateCache(orgId);

  console.log(`[StripeWebhook] Payment failed for org ${orgId}`);
}

async function handleTrialWillEnd(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = await resolveUserIdFromStripe(subscription);

  if (!userId) return;

  const orgId = await resolveOrgIdFromUserId(userId);
  if (!orgId) return;

  // TODO: Send email reminder to user
  console.log(`[StripeWebhook] Trial will end soon for org ${orgId}`);
}

// ============================================
// Main Handler
// ============================================

export async function handleStripeWebhook(
  body: string,
  signature: string,
): Promise<{ received: boolean } | { error: string }> {
  // Verify signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[StripeWebhook] Invalid signature:", err);
    return { error: "Invalid signature" };
  }

  // Idempotency check
  const alreadyProcessed = await entitlementRepository.hasStripeEventBeenProcessed(event.id);
  if (alreadyProcessed) {
    console.log(`[StripeWebhook] Event ${event.id} already processed, skipping`);
    return { received: true };
  }

  // Process event
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event);
        break;

      default:
        console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await entitlementRepository.markStripeEventProcessed(event.id, event.type);

    return { received: true };
  } catch (error) {
    console.error("[StripeWebhook] Error processing event:", error);
    return { error: "Processing failed" };
  }
}

// ============================================
// Next.js API Route Handler
// ============================================

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const result = await handleStripeWebhook(body, signature);

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
