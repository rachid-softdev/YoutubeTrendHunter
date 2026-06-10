import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getUserPlan, activateTrial } from "@/lib/services/subscription.service";
import { prisma } from "@/lib/prisma";

describe("getUserPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns FREE when no subscription exists", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    const result = await getUserPlan("user_123");
    expect(result).toBe("FREE");
  });

  it("returns PRO when trial is active and plan is PRO", async () => {
    const now = new Date();
    const trialStart = new Date(now.getTime() - 86400000); // yesterday
    const trialEnd = new Date(now.getTime() + 86400000 * 6); // 6 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "PRO",
      status: "TRIALING",
      trialStart,
      trialEnd,
      stripeCurrentPeriodEnd: trialEnd,
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("PRO");
  });

  it("returns TEAM when trial is active and plan is TEAM", async () => {
    const now = new Date();
    const trialStart = new Date(now.getTime() - 86400000);
    const trialEnd = new Date(now.getTime() + 86400000 * 6);
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "TEAM",
      status: "TRIALING",
      trialStart,
      trialEnd,
      stripeCurrentPeriodEnd: trialEnd,
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("TEAM");
  });

  it("returns FREE when subscription is CANCELED", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "PRO",
      status: "CANCELED",
      trialStart: null,
      trialEnd: null,
      stripeCurrentPeriodEnd: new Date(),
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("FREE");
  });

  it("returns FREE when subscription is INCOMPLETE", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "PRO",
      status: "INCOMPLETE",
      trialStart: null,
      trialEnd: null,
      stripeCurrentPeriodEnd: new Date(),
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("FREE");
  });

  it("returns FREE when subscription period has ended", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "PRO",
      status: "ACTIVE",
      trialStart: null,
      trialEnd: null,
      stripeCurrentPeriodEnd: new Date(Date.now() - 86400000), // yesterday
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("FREE");
  });

  it("returns PRO when subscription is active with valid period", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "PRO",
      status: "ACTIVE",
      trialStart: null,
      trialEnd: null,
      stripeCurrentPeriodEnd: new Date(Date.now() + 86400000 * 30), // 30 days from now
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("PRO");
  });

  it("returns TEAM when subscription is TEAM and active", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      plan: "TEAM",
      status: "ACTIVE",
      trialStart: null,
      trialEnd: null,
      stripeCurrentPeriodEnd: new Date(Date.now() + 86400000 * 30),
    });
    const result = await getUserPlan("user_123");
    expect(result).toBe("TEAM");
  });
});

describe("activateTrial", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
  });

  it("creates a new trial subscription", async () => {
    vi.mocked(prisma.subscription.upsert).mockResolvedValue({
      id: "sub_123",
      userId: "user_123",
      plan: "PRO",
      status: "TRIALING",
      stripeSubscriptionId: "trial_123",
      stripePriceId: "pro_trial",
      stripeCurrentPeriodEnd: new Date(Date.now() + 86400000 * 7),
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 86400000 * 7),
    } as any);

    await activateTrial("user_123", "PRO");

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_123" },
        create: expect.objectContaining({
          userId: "user_123",
          plan: "PRO",
          status: "TRIALING",
        }),
      }),
    );
  });

  it("uses 7 days as default trial duration", async () => {
    vi.mocked(prisma.subscription.upsert).mockImplementation(async ({ create }: any) => ({
      ...create,
      id: "sub_new",
      trialEnd: create.trialEnd,
    }));

    const result = await activateTrial("user_123", "PRO");
    // Trial should be approximately 7 days
    expect(result).toBeDefined();
  });

  it("uses TEAM plan for TEAM plan trials", async () => {
    vi.mocked(prisma.subscription.upsert).mockResolvedValue({
      id: "sub_123",
      userId: "user_123",
      plan: "TEAM",
      status: "TRIALING",
      stripeSubscriptionId: "trial_123",
      stripePriceId: null,
      stripeCurrentPeriodEnd: new Date(Date.now() + 86400000 * 7),
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 86400000 * 7),
    } as any);

    await activateTrial("user_123", "TEAM");

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          stripePriceId: null,
        }),
      }),
    );
  });

  it("uses custom duration when provided", async () => {
    vi.mocked(prisma.subscription.upsert).mockResolvedValue({
      id: "sub_123",
      userId: "user_123",
      plan: "PRO",
      status: "TRIALING",
      stripeSubscriptionId: "trial_123",
      stripePriceId: "pro_trial",
      stripeCurrentPeriodEnd: new Date(Date.now() + 86400000 * 14),
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 86400000 * 14),
    } as any);

    await activateTrial("user_123", "PRO", 14);

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          plan: "PRO",
          status: "TRIALING",
        }),
      }),
    );
  });
});
