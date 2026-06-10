/**
 * StripeAdapter — implements PaymentProvider using the Stripe API.
 */
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/retry";
import { stripeConfig, getPlanFromPriceId, getPeriodEnd } from "./stripe-config";
import { mapStripeStatus } from "./stripe-status-mapper";
import { getWebhookHandler } from "./stripe-webhook-handler";
import type {
  PaymentProvider,
  CheckoutParams,
  CheckoutResult,
  PortalParams,
  PortalResult,
  WebhookResult,
  SubscriptionData,
} from "./provider";
import { PaymentError } from "./provider";

export class StripeAdapter implements PaymentProvider {
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    // Validate priceId against allowed list
    if (!stripeConfig.allowedPriceIds.includes(params.priceId)) {
      throw new PaymentError("PRICE_NOT_FOUND", `Price ID ${params.priceId} n'est pas autorisé`);
    }

    let customerId = params.stripeCustomerId;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await withRetry(
        () =>
          stripe.customers.create({
            email: params.userEmail,
            name: params.userName,
            metadata: { userId: params.userId },
          }),
        { maxRetries: 2, baseDelayMs: 500, timeoutMs: 15000 },
      );
      customerId = customer.id;

      await prisma.user.update({
        where: { id: params.userId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      billing_address_collection: "required",
      line_items: [{ price: params.priceId, quantity: 1 }],
      mode: "subscription",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        metadata: { userId: params.userId },
      },
    });

    return {
      url: session.url,
      sessionId: session.id,
      customerId,
    };
  }

  async createPortalSession(params: PortalParams): Promise<PortalResult> {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });
      return { url: session.url };
    } catch (err) {
      throw new PaymentError("CUSTOMER_NOT_FOUND", "Impossible de créer une session portail", err);
    }
  }

  async handleWebhook(body: string, signature: string): Promise<WebhookResult> {
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, stripeConfig.webhookSecret);
    } catch (err) {
      throw new PaymentError("WEBHOOK_SIGNATURE_INVALID", "Signature webhook invalide", err);
    }

    // Check idempotency via StripeEvent table
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });
    if (existingEvent?.processed) {
      return { handled: false, eventType: event.type };
    }

    // Record event as received
    await prisma.stripeEvent.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, type: event.type, processed: false },
      update: {},
    });

    // Route to handler
    const handler = getWebhookHandler(event.type);
    if (!handler) {
      console.info(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      return { handled: false, eventType: event.type };
    }
    try {
      const result = await handler(event);

      // Mark as processed
      if (result.handled) {
        await prisma.stripeEvent.update({
          where: { eventId: event.id },
          data: { processed: true },
        });
      }

      return result;
    } catch (error) {
      // Clean up StripeEvent on failure so the next retry starts fresh
      await prisma.stripeEvent.delete({ where: { eventId: event.id } }).catch(() => {});
      throw error;
    }
  }

  async retrieveSubscription(subscriptionId: string): Promise<SubscriptionData> {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      return {
        id: sub.id,
        plan: getPlanFromPriceId(sub.items.data[0].price.id),
        status: mapStripeStatus(sub.status),
        currentPeriodEnd: new Date(getPeriodEnd(sub) * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items.data[0].price.id,
      };
    } catch (err) {
      throw new PaymentError(
        "SUBSCRIPTION_NOT_FOUND",
        `Abonnement ${subscriptionId} introuvable`,
        err,
      );
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      throw new PaymentError(
        "SUBSCRIPTION_NOT_FOUND",
        `Impossible d'annuler l'abonnement ${subscriptionId}`,
        err,
      );
    }
  }
}

/** Singleton instance */
export const stripeAdapter = new StripeAdapter();
