// ============================================
// Stripe Webhook - Working version
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function getPlanFromPriceId(priceId: string) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO" as const;
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM" as const;
  return "FREE" as const;
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active": return "ACTIVE";
    case "past_due": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "incomplete": return "INCOMPLETE";
    case "trialing": return "TRIALING";
    case "paused": return "PAST_DUE";
    default: return "ACTIVE";
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Webhook invalide" }, { status: 400 });
  }

  // === IDEMPOTENCY CHECK ===
  const existingEvent = await prisma.stripeEvent.findUnique({
    where: { eventId: event.id },
  });
  if (existingEvent && existingEvent.processed) {
    console.log(`[Stripe Webhook] Duplicate event skipped: ${event.id}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Record event as received (before processing)
  await prisma.stripeEvent.upsert({
    where: { eventId: event.id },
    create: { eventId: event.id, type: event.type, processed: false },
    update: {},
  });

  let processingError: Error | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      try {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        if (checkoutSession.mode !== "subscription") break;

        const subscriptionId = checkoutSession.subscription as string;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = sub.metadata.userId;

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0].price.id,
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            plan: getPlanFromPriceId(sub.items.data[0].price.id),
            status: "ACTIVE",
          },
          update: {
            stripePriceId: sub.items.data[0].price.id,
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            plan: getPlanFromPriceId(sub.items.data[0].price.id),
            status: "ACTIVE",
          },
        });
        break;
      } catch (err) {
        processingError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Stripe Webhook] Failed to handle ${event.type}:`, processingError);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      try {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata.userId;

        await prisma.subscription.update({
          where: { userId },
          data: {
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            status: "ACTIVE",
          },
        });
        break;
      } catch (err) {
        processingError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Stripe Webhook] Failed to handle ${event.type}:`, processingError);
      }
      break;
    }

    case "customer.subscription.updated": {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        await prisma.subscription.update({
          where: { userId },
          data: {
            stripePriceId: subscription.items.data[0].price.id,
            plan: getPlanFromPriceId(subscription.items.data[0].price.id),
            status: mapStripeStatus(subscription.status),
            stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });
        break;
      } catch (err) {
        processingError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Stripe Webhook] Failed to handle ${event.type}:`, processingError);
      }
      break;
    }

    case "customer.subscription.deleted": {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        await prisma.subscription.update({
          where: { userId },
          data: { status: "CANCELED", plan: "FREE" },
        });
        break;
      } catch (err) {
        processingError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Stripe Webhook] Failed to handle ${event.type}:`, processingError);
      }
      break;
    }

    case "customer.subscription.trial_will_end": {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.userId;

        console.log(`Trial will end soon for user ${userId}`);
        break;
      } catch (err) {
        processingError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Stripe Webhook] Failed to handle ${event.type}:`, processingError);
      }
      break;
    }
  }

  // Only mark as processed if no handler errored
  if (!processingError) {
    await prisma.stripeEvent.update({
      where: { eventId: event.id },
      data: { processed: true },
    }).catch((err) => {
      console.warn(`[Stripe Webhook] Failed to mark event ${event.id} as processed:`, err);
    });
    return NextResponse.json({ received: true });
  }

  console.error(`[Stripe Webhook] Event ${event.id} (${event.type}) NOT marked processed — will retry`);
  return NextResponse.json(
    { error: `Handler failed: ${processingError.message}` },
    { status: 500 },
  );
}
