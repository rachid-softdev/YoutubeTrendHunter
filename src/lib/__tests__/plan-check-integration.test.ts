import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { getUserPlan, isOnTrial, getTrialDaysRemaining, activateTrial, PLAN_LIMITS } from "../plan-check"
import { prisma } from "../prisma"

// Mock prisma
vi.mock("../prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

describe("Plan Check", () => {
  describe("PLAN_LIMITS", () => {
    it("should have correct limits for FREE plan", () => {
      expect(PLAN_LIMITS.FREE.niches).toBe(1)
      expect(PLAN_LIMITS.FREE.trendsPerNiche).toBe(5)
      expect(PLAN_LIMITS.FREE.alerts).toBe(false)
      expect(PLAN_LIMITS.FREE.export).toBe(false)
      expect(PLAN_LIMITS.FREE.api).toBe(false)
    })

    it("should have correct limits for PRO plan", () => {
      expect(PLAN_LIMITS.PRO.niches).toBe(-1)
      expect(PLAN_LIMITS.PRO.trendsPerNiche).toBe(-1)
      expect(PLAN_LIMITS.PRO.alerts).toBe(true)
      expect(PLAN_LIMITS.PRO.export).toBe(true)
      expect(PLAN_LIMITS.PRO.api).toBe(false)
    })

    it("should have correct limits for TEAM plan", () => {
      expect(PLAN_LIMITS.TEAM.niches).toBe(-1)
      expect(PLAN_LIMITS.TEAM.trendsPerNiche).toBe(-1)
      expect(PLAN_LIMITS.TEAM.alerts).toBe(true)
      expect(PLAN_LIMITS.TEAM.export).toBe(true)
      expect(PLAN_LIMITS.TEAM.api).toBe(true)
    })
  })

  describe("getUserPlan", () => {
    it("should return FREE when no subscription exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null)

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("FREE")
    })

    it("should return FREE when subscription is CANCELED", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        plan: "PRO" as const,
        status: "CANCELED" as const,
        stripeCurrentPeriodEnd: new Date(),
        trialEnd: null,
        trialStart: null,
      })

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("FREE")
    })

    it("should return FREE when subscription period has expired", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        plan: "PRO" as const,
        status: "ACTIVE" as const,
        stripeCurrentPeriodEnd: new Date(Date.now() - 86400000),
        trialEnd: null,
        trialStart: null,
      })

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("FREE")
    })

    it("should return PRO when subscription is active (non-trial)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        plan: "PRO" as const,
        status: "ACTIVE" as const,
        stripeCurrentPeriodEnd: new Date(Date.now() + 86400000),
        trialEnd: null,
        trialStart: null,
      })

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("PRO")
    })

    it("should return PRO when on active trial (regardless of stored plan)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        plan: "PRO" as const,
        status: "TRIALING" as const,
        stripeCurrentPeriodEnd: new Date(Date.now() + 86400000),
        trialStart: new Date(Date.now() - 86400000),
        trialEnd: new Date(Date.now() + 86400000),
      })

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("PRO")
    })

    it("should return TEAM when subscription is TEAM", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        plan: "TEAM" as const,
        status: "ACTIVE" as const,
        stripeCurrentPeriodEnd: new Date(Date.now() + 86400000),
        trialEnd: null,
        trialStart: null,
      })

      const plan = await getUserPlan("user-123")
      expect(plan).toBe("TEAM")
    })
  })

  describe("isOnTrial", () => {
    it("should return false when no trial dates", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null)

      const result = await isOnTrial("user-123")
      expect(result).toBe(false)
    })

    it("should return true when currently in trial period", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        trialStart: new Date(Date.now() - 86400000),
        trialEnd: new Date(Date.now() + 86400000),
      })

      const result = await isOnTrial("user-123")
      expect(result).toBe(true)
    })

    it("should return false when trial has ended", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        trialStart: new Date(Date.now() - 172800000),
        trialEnd: new Date(Date.now() - 86400000),
      })

      const result = await isOnTrial("user-123")
      expect(result).toBe(false)
    })

    it("should return false when trial hasn't started", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        trialStart: new Date(Date.now() + 86400000),
        trialEnd: new Date(Date.now() + 172800000),
      })

      const result = await isOnTrial("user-123")
      expect(result).toBe(false)
    })
  })

  describe("getTrialDaysRemaining", () => {
    it("should return 0 when no trial", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null)

      const days = await getTrialDaysRemaining("user-123")
      expect(days).toBe(0)
    })

    it("should return positive days when trial is active", async () => {
      const now = Date.now()
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        trialEnd: new Date(now + 3 * 86400000),
      })

      const days = await getTrialDaysRemaining("user-123")
      expect(days).toBeGreaterThan(0)
      expect(days).toBeLessThanOrEqual(3)
    })

    it("should return 0 when trial has expired", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        trialEnd: new Date(Date.now() - 86400000),
      })

      const days = await getTrialDaysRemaining("user-123")
      expect(days).toBe(0)
    })
  })
})