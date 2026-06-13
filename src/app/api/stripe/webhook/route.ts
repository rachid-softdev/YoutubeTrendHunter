import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"

export const dynamic = "force-dynamic"

function getPlanFromPriceId(priceId: string) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO" as const
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM" as const
  return "FREE" as const
}

async function validateUserId(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  return user !== null
}

function getPeriodEnd(sub: Stripe.Subscription): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sub as any).current_period_end ?? sub.billing_cycle_anchor
}

async function handleSubscriptionEvent(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)

  const userId = sub.metadata?.userId
  if (!userId || !(await validateUserId(userId))) {
    console.error("Invalid or missing userId in subscription metadata", subscriptionId)
    return null
  }

  return { userId, sub }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    return NextResponse.json({ error: "Signature manquante" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session
      if (checkoutSession.mode !== "subscription" || !checkoutSession.subscription) break

      const result = await handleSubscriptionEvent(checkoutSession.subscription as string)
      if (!result) break

      const { userId, sub } = result
      const priceId = sub.items.data[0].price.id

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
          plan: getPlanFromPriceId(priceId),
          status: "ACTIVE",
        },
        update: {
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
          plan: getPlanFromPriceId(priceId),
          status: "ACTIVE",
        },
      })

      if (checkoutSession.customer) {
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: checkoutSession.customer as string },
        })
      }
      break
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoiceSub = (invoice as any).subscription
      if (!invoiceSub) break

      const result = await handleSubscriptionEvent(invoiceSub as string)
      if (!result) break

      const { userId, sub } = result

      await prisma.subscription.update({
        where: { userId },
        data: {
          stripeCurrentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
          status: "ACTIVE",
        },
      })
      break
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription

      const userId = subscription.metadata?.userId
      if (!userId || !(await validateUserId(userId))) {
        console.error("Invalid or missing userId in subscription metadata", subscription.id)
        break
      }

      const priceId = subscription.items.data[0].price.id
      await prisma.subscription.update({
        where: { userId },
        data: {
          stripePriceId: priceId,
          plan: getPlanFromPriceId(priceId),
          status: "ACTIVE",
          stripeCurrentPeriodEnd: new Date(getPeriodEnd(subscription) * 1000),
        },
      })
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription

      const userId = subscription.metadata?.userId
      if (!userId || !(await validateUserId(userId))) {
        console.error("Invalid or missing userId in subscription metadata", subscription.id)
        break
      }

      await prisma.subscription.update({
        where: { userId },
        data: { status: "CANCELED", plan: "FREE" },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
