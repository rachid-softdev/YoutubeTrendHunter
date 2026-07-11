// ============================================
// Stripe Webhook Handler — Complete Test Suite
// ============================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";

// Focused views of the deep-mocked modules used by this suite. We keep the
// original parameter types but relax the return to `Promise<unknown>` so the
// tests can pass partial fixtures to `mockResolvedValue` without `any`.
type MockPrisma = {
  user: {
    findFirst: Mock<(...args: Parameters<PrismaClient["user"]["findFirst"]>) => Promise<unknown>>;
    findUnique: Mock<(...args: Parameters<PrismaClient["user"]["findUnique"]>) => Promise<unknown>>;
  };
  subscription: {
    findFirst: Mock<
      (...args: Parameters<PrismaClient["subscription"]["findFirst"]>) => Promise<unknown>
    >;
    upsert: Mock<(...args: Parameters<PrismaClient["subscription"]["upsert"]>) => Promise<unknown>>;
    updateMany: Mock<
      (...args: Parameters<PrismaClient["subscription"]["updateMany"]>) => Promise<unknown>
    >;
    update: Mock<(...args: Parameters<PrismaClient["subscription"]["update"]>) => Promise<unknown>>;
  };
};

type MockStripe = {
  subscriptions: {
    retrieve: Mock<(...args: Parameters<Stripe["subscriptions"]["retrieve"]>) => Promise<unknown>>;
  };
};

// ─── Module-level mocks (hoisted by Vitest) ───

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock("@/lib/retry", () => ({
  withRetry: async <T>(fn: () => Promise<T>, _options?: unknown) => fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  getFeatureGateService: vi.fn(),
  getDowngradeService: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// ─── Set env vars needed by stripe-config before imports ───

process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_mock";
process.env.STRIPE_PRO_PRICE_ID = "price_pro";
process.env.STRIPE_TEAM_PRICE_ID = "price_team";

// ─── Constants ───

const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 24 * 60 * 60; // 30 days from now

/** Type-safe coercion helper for partial third-party fixtures (no `as unknown as`). */
function coerce<T>(value: unknown): T {
  return value as T;
}

// ─── Event factories ───

function createEvent(type: string, data: unknown): Stripe.Event {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: { object: data },
    created: NOW,
    livemode: false,
    pending_webhooks: 0,
    api_version: "2026-04-22",
    request: null,
  } as Stripe.Event;
}

function createSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return coerce<Stripe.Subscription>({
    id: "sub_mock_123",
    object: "subscription",
    metadata: {} as Stripe.Metadata,
    items: { data: [{ price: { id: "price_pro" } }] },
    status: "active",
    current_period_end: PERIOD_END,
    ...overrides,
  });
}

function createInvoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return coerce<Stripe.Invoice>({
    id: "in_mock_123",
    object: "invoice",
    subscription: "sub_mock_123",
    ...overrides,
  });
}

function createCheckoutSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_mock_123",
    object: "checkout.session",
    mode: "subscription",
    subscription: "sub_mock_123",
    ...overrides,
  } as Stripe.Checkout.Session;
}

// ─── Tests ───

describe("Stripe Webhook Handlers", () => {
  let prisma: MockPrisma;
  let stripe: MockStripe;
  let getFeatureGate: Mock<() => unknown>;
  let mockGate: { invalidateCache: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaModule = await import("@/lib/prisma");
    prisma = vi.mocked(prismaModule.prisma, true);
    const stripeModule = await import("@/lib/stripe");
    stripe = vi.mocked(stripeModule.stripe, true);
    const ffModule = await import("@/lib/feature-flags");
    getFeatureGate = vi.mocked(ffModule.getFeatureGateService);

    // Default: no user found
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    // Default: no current subscription (new org — skip downgrade detection)
    prisma.subscription.findFirst.mockResolvedValue(null);
    // Default: upsert succeeds
    prisma.subscription.upsert.mockResolvedValue({});
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.update.mockResolvedValue({});

    // Default: stripe retrieve returns a subscription
    stripe.subscriptions.retrieve.mockResolvedValue(
      createSubscription({ metadata: { orgId: "org_1" } }),
    );

    // Feature gate mock
    mockGate = { invalidateCache: vi.fn().mockResolvedValue(undefined) };
    getFeatureGate.mockReturnValue(mockGate);
  });

  // ============================================
  // customer.subscription.created
  // ============================================

  describe("customer.subscription.created", () => {
    it("creates subscription via orgId path with user lookup", async () => {
      // Arrange: orgId in metadata, user exists in org
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        items: { data: [{ price: { id: "price_pro" } }] },
        status: "active",
      });
      const event = createEvent("customer.subscription.created", sub);

      prisma.user.findFirst.mockResolvedValue({ id: "user_in_org" });

      // Act
      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.created");
      const result = await handler!(event);

      // Assert
      expect(result).toEqual({ handled: true, eventType: "customer.subscription.created" });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { orgId: "org_1" } });
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_in_org" },
          create: expect.objectContaining({
            plan: "PRO",
            status: "ACTIVE",
            orgId: "org_1",
          }),
        }),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("creates subscription via userId fallback when orgId absent", async () => {
      const sub = createSubscription({
        metadata: { userId: "user_1" },
        status: "active",
      });
      const event = createEvent("customer.subscription.created", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.created");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.created" });
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_1" },
          create: expect.objectContaining({ plan: "PRO", status: "ACTIVE" }),
        }),
      );
      // No orgId → no cache invalidation
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });

    it("returns handled:false when no orgId or userId in metadata", async () => {
      const sub = createSubscription({ metadata: {} });
      const event = createEvent("customer.subscription.created", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.created");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "customer.subscription.created" });
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it("skips upsert when orgId exists but no user found in org", async () => {
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
      });
      const event = createEvent("customer.subscription.created", sub);

      // No user in org
      prisma.user.findFirst.mockResolvedValue(null);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.created");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.created" });
      // No user == no subscription upsert
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
      // Cache still invalidated because orgId exists
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // customer.subscription.updated
  // ============================================

  describe("customer.subscription.updated", () => {
    it("updates subscription via orgId path", async () => {
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
        status: "past_due",
      });
      const event = createEvent("customer.subscription.updated", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.updated" });
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: "org_1" },
          data: expect.objectContaining({ status: "PAST_DUE" }),
        }),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("returns handled:false when no identifiers in metadata", async () => {
      const sub = createSubscription({ metadata: {} });
      const event = createEvent("customer.subscription.updated", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "customer.subscription.updated" });
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // customer.subscription.deleted
  // ============================================

  describe("customer.subscription.deleted", () => {
    it("sets subscription to CANCELED + free via orgId path", async () => {
      const sub = createSubscription({
        metadata: { orgId: "org_1" },
      });
      const event = createEvent("customer.subscription.deleted", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.deleted");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "customer.subscription.deleted" });
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: "org_1" },
          data: expect.objectContaining({ status: "CANCELED", planKey: "free", plan: "FREE" }),
        }),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // invoice.payment_succeeded
  // ============================================

  describe("invoice.payment_succeeded", () => {
    it("renews period and sets status to ACTIVE via orgId path", async () => {
      // Arrange: invoice has subscription reference, retrieve returns sub with orgId
      const invoice = createInvoice({ subscription: "sub_mock_123" });
      const event = createEvent("invoice.payment_succeeded", invoice);

      stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({ metadata: { orgId: "org_1" }, status: "active" }),
      );

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("invoice.payment_succeeded");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "invoice.payment_succeeded" });
      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_mock_123");
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: "org_1" },
          data: expect.objectContaining({ status: "ACTIVE" }),
        }),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("returns handled:false when invoice has no subscription", async () => {
      const invoice = createInvoice({ subscription: null });
      const event = createEvent("invoice.payment_succeeded", invoice);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("invoice.payment_succeeded");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "invoice.payment_succeeded" });
      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // invoice.payment_failed
  // ============================================

  describe("invoice.payment_failed", () => {
    it("sets subscription to PAST_DUE via orgId path", async () => {
      const invoice = createInvoice({ subscription: "sub_mock_123" });
      const event = createEvent("invoice.payment_failed", invoice);

      stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({ metadata: { orgId: "org_1" }, status: "past_due" }),
      );

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("invoice.payment_failed");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "invoice.payment_failed" });
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: "org_1" },
          data: { status: "PAST_DUE" },
        }),
      );
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });
  });

  // ============================================
  // checkout.session.completed (backward compat)
  // ============================================

  describe("checkout.session.completed", () => {
    it("creates subscription from session with user→org resolution", async () => {
      const session = createCheckoutSession({
        mode: "subscription",
        subscription: "sub_mock_123",
      });
      const event = createEvent("checkout.session.completed", session);

      // Stripe retrieve returns sub with userId
      stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({
          metadata: { userId: "user_1" },
          items: { data: [{ price: { id: "price_pro" } }] },
        }),
      );

      // User lookup succeeds
      prisma.user.findUnique.mockResolvedValue({ id: "user_1", orgId: "org_1" });

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("checkout.session.completed");
      const result = await handler!(event);

      expect(result).toEqual({ handled: true, eventType: "checkout.session.completed" });
      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_mock_123");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user_1" },
        select: { orgId: true },
      });
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_1" },
          create: expect.objectContaining({ plan: "PRO", status: "ACTIVE", orgId: "org_1" }),
        }),
      );
      // orgId was resolved → cache invalidated
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("returns handled:false when mode is not subscription", async () => {
      const session = createCheckoutSession({
        mode: "payment",
        subscription: null,
      });
      const event = createEvent("checkout.session.completed", session);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("checkout.session.completed");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "checkout.session.completed" });
      expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    });

    it("returns handled:false when no userId in subscription metadata", async () => {
      const session = createCheckoutSession({
        mode: "subscription",
        subscription: "sub_mock_123",
      });
      const event = createEvent("checkout.session.completed", session);

      // Retrieve returns sub with no userId
      stripe.subscriptions.retrieve.mockResolvedValue(createSubscription({ metadata: {} }));

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("checkout.session.completed");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "checkout.session.completed" });
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it("returns handled:false when subscription has no items", async () => {
      const session = createCheckoutSession({
        mode: "subscription",
        subscription: "sub_mock_123",
      });
      const event = createEvent("checkout.session.completed", session);

      stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({
          metadata: { userId: "user_1" },
          items: { data: [] },
        }),
      );

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("checkout.session.completed");
      const result = await handler!(event);

      expect(result).toEqual({ handled: false, eventType: "checkout.session.completed" });
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Cache invalidation behavior (cross-cutting)
  // ============================================

  describe("cache invalidation", () => {
    it.each([
      ["customer.subscription.created", "subscription"],
      ["customer.subscription.updated", "subscription"],
      ["customer.subscription.deleted", "subscription"],
      ["invoice.payment_succeeded", "invoice"],
      ["invoice.payment_failed", "invoice"],
    ] as const)("calls invalidateCache when orgId is present for %s", async (eventType, dataKind) => {
      // Build the right event data shape for each event type
      let eventData: unknown;
      if (dataKind === "invoice") {
        eventData = { subscription: "sub_mock_123" };
      } else {
        eventData = createSubscription({ metadata: { orgId: "org_1" } });
      }
      const event = createEvent(eventType, eventData);

      // For invoice events, retrieve returns sub with orgId so resolveOrgId works
      stripe.subscriptions.retrieve.mockResolvedValue(
        createSubscription({ metadata: { orgId: "org_1" } }),
      );

      // For subscription.created, a user must exist in the org
      if (eventType === "customer.subscription.created") {
        prisma.user.findFirst.mockResolvedValue({ id: "user_in_org" });
      }

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler(eventType);
      const result = await handler!(event);

      expect(result.handled).toBe(true);
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org_1");
    });

    it("does not invalidate cache when no orgId resolved", async () => {
      const sub = createSubscription({ metadata: { userId: "user_1" } });
      const event = createEvent("customer.subscription.updated", sub);

      const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
      const handler = getWebhookHandler("customer.subscription.updated");
      const result = await handler!(event);

      expect(result.handled).toBe(true);
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Unknown event type
  // ============================================

  it("getWebhookHandler returns null for unknown event type", async () => {
    const { getWebhookHandler } = await import("@/lib/payment/stripe-webhook-handler");
    const handler = getWebhookHandler("unknown.event.type");
    expect(handler).toBeNull();
  });
});
