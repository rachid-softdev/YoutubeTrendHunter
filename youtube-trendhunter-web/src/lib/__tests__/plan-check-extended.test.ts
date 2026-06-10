import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

// Import after mock
import { isOnTrial, getTrialDaysRemaining } from "@/lib/services/subscription.service";
import { prisma } from "@/lib/prisma";

const baseSubPick = {
  id: "sub-mock",
  userId: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
  orgId: null as string | null,
  planKey: null as string | null,
  plan: "FREE" as const,
  status: "ACTIVE" as const,
  stripeSubscriptionId: null as string | null,
  stripePriceId: null as string | null,
  stripeCurrentPeriodEnd: new Date(),
  cancelledAt: null as Date | null,
  trialStart: null as Date | null,
  trialEnd: null as Date | null,
};

describe("isOnTrial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no subscription", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId: "user_123" },
      select: { trialEnd: true, trialStart: true },
    });
  });

  it("returns false when no trial dates", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd: null,
      trialStart: null,
    } as any);
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
  });

  it("returns false when trial has not started", async () => {
    const futureStart = new Date(Date.now() + 86400000); // tomorrow
    const futureEnd = new Date(Date.now() + 86400000 * 8); // 8 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd: futureEnd,
      trialStart: futureStart,
    } as any);
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
  });

  it("returns true when trial is active", async () => {
    const pastStart = new Date(Date.now() - 86400000); // yesterday
    const futureEnd = new Date(Date.now() + 86400000 * 6); // 6 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd: futureEnd,
      trialStart: pastStart,
    } as any);
    const result = await isOnTrial("user_123");
    expect(result).toBe(true);
  });

  it("returns false when trial has ended", async () => {
    const pastStart = new Date(Date.now() - 86400000 * 10); // 10 days ago
    const pastEnd = new Date(Date.now() - 86400000 * 3); // 3 days ago
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd: pastEnd,
      trialStart: pastStart,
    } as any);
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
  });
});

describe("getTrialDaysRemaining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when no subscription exists", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(0);
  });

  it("returns 0 when no trial end date", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd: null,
    } as any);
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(0);
  });

  it("returns correct days for future trial end", async () => {
    const trialEnd = new Date(Date.now() + 86400000 * 5); // 5 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd,
    } as any);
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(5);
  });

  it("returns 0 when trial has expired", async () => {
    const trialEnd = new Date(Date.now() - 86400000); // yesterday
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd,
    } as any);
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(0);
  });

  it("rounds up partial days", async () => {
    const trialEnd = new Date(Date.now() + 86400000 * 2 + 43200000); // 2.5 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      ...baseSubPick,
      trialEnd,
    } as any);
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(3);
  });
});
