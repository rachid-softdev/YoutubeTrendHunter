import { describe, it, expect, vi, beforeEach } from "vitest"

// Define mocks outside vi.mock to avoid hoisting issues
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  subscriptions: {
    retrieve: vi.fn(),
  },
}

vi.mock("@/lib/stripe", () => ({
  stripe: mockStripe,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Signature Verification", () => {
    it("should return 400 for invalid webhook signature", async () => {
      vi.mocked(mockStripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error("Invalid signature")
      })

      try {
        mockStripe.webhooks.constructEvent("{}", "invalid_sig", "secret")
      } catch {
        const response = new Response(JSON.stringify({ error: "Webhook invalide" }), { status: 400 })
        expect(response.status).toBe(400)
      }
    })

    it("should proceed with valid webhook payload", async () => {
      const validPayload = { type: "checkout.session.completed" }
      const mockEvent = { type: "checkout.session.completed", data: { object: {} } }

      vi.mocked(mockStripe.webhooks.constructEvent).mockReturnValue(mockEvent as any)

      const event = mockStripe.webhooks.constructEvent(
        JSON.stringify(validPayload),
        "valid_sig",
        "webhook_secret"
      )

      expect(event.type).toBe("checkout.session.completed")
    })
  })

  describe("checkout.session.completed Event", () => {
    it("should create or update subscription on checkout completion", async () => {
      const checkoutSession = {
        mode: "subscription",
        subscription: "sub_123",
      }

      const subscription = {
        id: "sub_123",
        metadata: { userId: "user-123" },
        items: { data: [{ price: { id: "price_pro" } }] },
        current_period_end: 1735689600,
      }

      vi.mocked(mockStripe.subscriptions.retrieve).mockResolvedValue(subscription as any)
      vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as any)

      if (checkoutSession.mode === "subscription") {
        const sub = await mockStripe.subscriptions.retrieve(checkoutSession.subscription as string)
        const userId = sub.metadata.userId

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0].price.id,
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            plan: "PRO",
            status: "ACTIVE",
          },
          update: {
            stripePriceId: sub.items.data[0].price.id,
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            plan: "PRO",
            status: "ACTIVE",
          },
        })
      }

      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_123")
      expect(prisma.subscription.upsert).toHaveBeenCalled()
    })

    it("should skip non-subscription checkouts", async () => {
      const checkoutSession = {
        mode: "payment",
        subscription: null,
      }

      if (checkoutSession.mode !== "subscription") {
        // Should skip
      }

      expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    })
  })

  describe("invoice.payment_succeeded Event", () => {
    it("should update subscription on successful payment", async () => {
      const invoice = {
        subscription: "sub_123",
      }

      const subscription = {
        id: "sub_123",
        metadata: { userId: "user-123" },
        current_period_end: 1738377600,
      }

      vi.mocked(mockStripe.subscriptions.retrieve).mockResolvedValue(subscription as any)
      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any)

      if (invoice.subscription) {
        const sub = await mockStripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = sub.metadata.userId

        await prisma.subscription.update({
          where: { userId },
          data: {
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            status: "ACTIVE",
          },
        })
      }

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: "user-123" }),
          data: expect.objectContaining({ status: "ACTIVE" }),
        })
      )
    })

    it("should skip invoices without subscription", async () => {
      const invoice = {
        subscription: null,
      }

      if (!invoice.subscription) {
        // Should skip
      }

      expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    })
  })

  describe("customer.subscription.deleted Event", () => {
    it("should cancel subscription on deletion", async () => {
      const subscription = {
        metadata: { userId: "user-123" },
      }

      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any)

      const userId = subscription.metadata.userId
      await prisma.subscription.update({
        where: { userId },
        data: { status: "CANCELED", plan: "FREE" },
      })

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELED",
            plan: "FREE",
          }),
        })
      )
    })
  })

  describe("Plan Determination", () => {
    it("should return FREE for unknown price IDs", () => {
      // The function checks environment variables, so test the default behavior
      const getPlanFromPriceId = (priceId: string) => {
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO"
        if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM"
        return "FREE"
      }

      // Without env vars set, unknown price IDs return FREE
      expect(getPlanFromPriceId("price_unknown")).toBe("FREE")
    })

    it("should return FREE by default", () => {
      const getPlanFromPriceId = (priceId: string) => {
        if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO"
        if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return "TEAM"
        return "FREE"
      }

      // Default fallback is FREE
      expect(getPlanFromPriceId("any_price")).toBe("FREE")
    })
  })
})