/**
 * Payment provider abstraction.
 * Allows swapping Stripe for another provider by implementing this interface.
 */

// ─── Domain Types ───

export type PlanType = "FREE" | "PRO" | "TEAM";
export type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE" | "TRIALING" | "INCOMPLETE";

export interface CheckoutParams {
  priceId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  stripeCustomerId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string | null;
  sessionId: string;
  customerId: string;
}

export interface PortalParams {
  customerId: string;
  returnUrl: string;
}

export interface PortalResult {
  url: string;
}

export interface SubscriptionData {
  id: string;
  plan: PlanType;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
}

export interface WebhookResult {
  handled: boolean;
  eventType: string;
  subscription?: SubscriptionData;
}

// ─── Domain Error ───

export type PaymentErrorCode =
  | "PRICE_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "SUBSCRIPTION_NOT_FOUND"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_DUPLICATE"
  | "PROVIDER_ERROR";

export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

// ─── Interface ───

export interface PaymentProvider {
  /** Create a Stripe Checkout Session for subscription purchase */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;

  /** Create a Stripe Billing Portal session for managing subscription */
  createPortalSession(params: PortalParams): Promise<PortalResult>;

  /** Handle an incoming webhook event */
  handleWebhook(body: string, signature: string): Promise<WebhookResult>;

  /** Retrieve subscription data from Stripe */
  retrieveSubscription(subscriptionId: string): Promise<SubscriptionData>;

  /** Cancel a subscription at period end */
  cancelSubscription(subscriptionId: string): Promise<void>;
}
