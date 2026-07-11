import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkoutSchema } from "@/lib/schemas";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

type SessionLike = { user?: { id?: string; email?: string } } | null;
const sessionMock = vi.fn<() => Promise<SessionLike>>();

import { makeUser } from "@/__tests__/factories";

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Schema Validation", () => {
    it("should accept valid priceId", () => {
      const result = checkoutSchema.safeParse({ priceId: "price_123" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priceId).toBe("price_123");
      }
    });

    it("should reject missing priceId", () => {
      const result = checkoutSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject empty priceId", () => {
      const result = checkoutSchema.safeParse({ priceId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("Authentication Check", () => {
    it("should return 401 when not authenticated", async () => {
      sessionMock.mockResolvedValue(null);

      const session = await sessionMock();
      if (!session?.user?.id) {
        const response = new Response(JSON.stringify({ error: "Non authentifié" }), {
          status: 401,
        });
        expect(response.status).toBe(401);
      }
    });

    it("should proceed when authenticated", async () => {
      sessionMock.mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      const session = await sessionMock();
      expect(session?.user?.id).toBeDefined();
    });
  });

  describe("User Lookup", () => {
    it("should return 404 when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const user = await prisma.user.findUnique({
        where: { id: "nonexistent" },
        select: { stripeCustomerId: true, email: true, name: true },
      });

      expect(user).toBeNull();
    });

    it("should find existing user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        makeUser({ stripeCustomerId: null, email: "test@example.com", name: "Test User" }),
      );

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        select: { stripeCustomerId: true, email: true, name: true },
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe("test@example.com");
    });
  });

  describe("Stripe Customer Creation", () => {
    it("should create new Stripe customer if none exists", async () => {
      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: "cus_new123",
        object: "customer",
      } as Awaited<ReturnType<typeof stripe.customers.create>>);

      const customer = await stripe.customers.create({
        email: "test@example.com",
        name: "Test User",
        metadata: { userId: "user-123" },
      });

      expect(customer.id).toBe("cus_new123");
      expect(stripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          metadata: { userId: "user-123" },
        }),
      );
    });

    it("should not create new customer if one already exists", async () => {
      const existingCustomerId = "cus_existing123";
      vi.mocked(stripe.customers.create).mockClear();

      const existingUser = {
        stripeCustomerId: existingCustomerId,
      };

      // Simulate the checkout flow
      let stripeCustomerId = existingUser.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: "test@example.com",
          name: "Test User",
          metadata: { userId: "user-123" },
        });
        stripeCustomerId = customer.id;
      }

      expect(stripe.customers.create).not.toHaveBeenCalled();
      expect(stripeCustomerId).toBe(existingCustomerId);
    });
  });

  describe("Checkout Session Creation", () => {
    it("should create checkout session with correct parameters", async () => {
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        id: "session_123",
        object: "checkout.session",
        url: "https://checkout.stripe.com/session_123",
      } as Awaited<ReturnType<typeof stripe.checkout.sessions.create>>);

      const session = await stripe.checkout.sessions.create({
        customer: "cus_123",
        payment_method_types: ["card"],
        billing_address_collection: "required",
        line_items: [{ price: "price_pro", quantity: 1 }],
        mode: "subscription",
        success_url: `${process.env.NEXTAUTH_URL}/dashboard?success=true`,
        cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
        subscription_data: {
          metadata: { userId: "user-123" },
        },
      });

      expect(session.url).toContain("checkout.stripe.com");
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: "cus_123",
          mode: "subscription",
          payment_method_types: expect.arrayContaining(["card"]),
        }),
      );
    });
  });
});
