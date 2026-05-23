// ============================================
// Stripe Webhook - Working version
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getPlanFromPriceId(priceId: string) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO" as const;
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM" as const;
  return "FREE" as const;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Webhook invalide" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as any;
      if (checkoutSession.mode !== "subscription") break;

      const sub = (await stripe.subscriptions.retrieve(
        checkoutSession.subscription as string,
      )) as any;
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
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as any;
      if (!invoice.subscription) break;

      const sub = (await stripe.subscriptions.retrieve(invoice.subscription as string)) as any;
      const userId = sub.metadata.userId;

      await prisma.subscription.update({
        where: { userId },
        data: {
          stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          status: "ACTIVE",
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as any;
      const userId = subscription.metadata.userId;

      await prisma.subscription.update({
        where: { userId },
        data: {
          stripePriceId: subscription.items.data[0].price.id,
          plan: getPlanFromPriceId(subscription.items.data[0].price.id),
          status: "ACTIVE",
          stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as any;
      const userId = subscription.metadata.userId;

      await prisma.subscription.update({
        where: { userId },
        data: { status: "CANCELED", plan: "FREE" },
      });
      break;
    }

    case "customer.subscription.trial_will_end": {
      const subscription = event.data.object as any;
      const userId = subscription.metadata.userId;

      console.log(`Trial will end soon for user ${userId}`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
