import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

// Import after mock
import { isOnTrial, getTrialDaysRemaining } from "@/lib/plan-check";
import { prisma } from "@/lib/prisma";

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
      trialEnd: null,
      trialStart: null,
    });
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
  });

  it("returns false when trial has not started", async () => {
    const futureStart = new Date(Date.now() + 86400000); // tomorrow
    const futureEnd = new Date(Date.now() + 86400000 * 8); // 8 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      trialEnd: futureEnd,
      trialStart: futureStart,
    });
    const result = await isOnTrial("user_123");
    expect(result).toBe(false);
  });

  it("returns true when trial is active", async () => {
    const pastStart = new Date(Date.now() - 86400000); // yesterday
    const futureEnd = new Date(Date.now() + 86400000 * 6); // 6 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      trialEnd: futureEnd,
      trialStart: pastStart,
    });
    const result = await isOnTrial("user_123");
    expect(result).toBe(true);
  });

  it("returns false when trial has ended", async () => {
    const pastStart = new Date(Date.now() - 86400000 * 10); // 10 days ago
    const pastEnd = new Date(Date.now() - 86400000 * 3); // 3 days ago
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      trialEnd: pastEnd,
      trialStart: pastStart,
    });
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
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ trialEnd: null });
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(0);
  });

  it("returns correct days for future trial end", async () => {
    const trialEnd = new Date(Date.now() + 86400000 * 5); // 5 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ trialEnd });
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(5);
  });

  it("returns 0 when trial has expired", async () => {
    const trialEnd = new Date(Date.now() - 86400000); // yesterday
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ trialEnd });
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(0);
  });

  it("rounds up partial days", async () => {
    const trialEnd = new Date(Date.now() + 86400000 * 2 + 43200000); // 2.5 days from now
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ trialEnd });
    const result = await getTrialDaysRemaining("user_123");
    expect(result).toBe(3);
  });
});
