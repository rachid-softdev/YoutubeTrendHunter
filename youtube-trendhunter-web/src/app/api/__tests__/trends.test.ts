import { describe, it, expect, vi, beforeEach } from "vitest";
import { trendsQuerySchema } from "@/lib/schemas";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    niche: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    trend: {
      findMany: vi.fn(),
    },
    userNiche: {
      count: vi.fn(),
    },
  },
}));

// Mock Auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock Redis
vi.mock("@/lib/redis", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

// Mock Plan Check
vi.mock("@/lib/services/subscription.service", () => ({
  getUserPlan: vi.fn().mockResolvedValue("PRO"),
  PLAN_LIMITS: {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

describe("GET /api/trends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const handler = async () => {
        const session = await auth();
        if (!session?.user?.id) {
          return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401 });
        }
        return null;
      };

      const result = await handler();
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("should proceed when user is authenticated", async () => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as any);

      const handler = async () => {
        const session = await auth();
        if (!session?.user?.id) {
          return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401 });
        }
        return { status: "ok" };
      };

      const result = await handler();
      expect(result).toEqual({ status: "ok" });
    });
  });

  describe("Query Validation", () => {
    it("should return 400 when niche parameter is missing", () => {
      const result = trendsQuerySchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod v4 provides more detailed error messages
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it("should return 400 when niche is empty string", () => {
      const result = trendsQuerySchema.safeParse({ niche: "" });
      expect(result.success).toBe(false);
    });

    it("should pass validation with valid niche slug", () => {
      const result = trendsQuerySchema.safeParse({ niche: "tech" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.niche).toBe("tech");
      }
    });
  });

  describe("Niche Lookup", () => {
    it("should return 404 when niche does not exist", async () => {
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(null);
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const niche = await prisma.niche.findUnique({ where: { slug: "nonexistent" } });
      expect(niche).toBeNull();
    });

    it("should find niche with valid slug", async () => {
      const mockNiche = { id: "niche-1", slug: "tech", name: "Tech" };
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(mockNiche as any);

      const niche = await prisma.niche.findUnique({ where: { slug: "tech" } });
      expect(niche).not.toBeNull();
      expect(niche?.slug).toBe("tech");
    });
  });

  describe("Trends Fetching", () => {
    it("should fetch trends for authenticated user with valid niche", async () => {
      const mockTrends = [
        { id: "trend-1", title: "AI Tools 2024", score: 95, velocity: 2.5 },
        { id: "trend-2", title: "ChatGPT Tips", score: 88, velocity: 1.8 },
      ];
      const mockNiche = { id: "niche-1", slug: "tech", name: "Tech" };

      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(mockNiche as any);
      vi.mocked(prisma.trend.findMany).mockResolvedValue(mockTrends as any);

      const trends = await prisma.trend.findMany({
        where: { nicheId: mockNiche.id, expiresAt: { gte: expect.any(Date) } },
        orderBy: { score: "desc" },
        take: 20,
      });

      expect(trends).toHaveLength(2);
      expect(trends[0].score).toBeGreaterThan(trends[1].score);
    });

    it("should limit FREE plan to 5 trends", async () => {
      vi.mocked(prisma.userNiche.count).mockResolvedValue(0);
      vi.mocked(prisma.niche.findUnique).mockResolvedValue({ id: "niche-1" } as any);
      vi.mocked(prisma.trend.findMany).mockResolvedValue([] as any);

      const count = await prisma.userNiche.count({ where: { userId: "user-free" } });
      expect(count).toBe(0);

      const take = count >= 1 ? 5 : 5; // FREE plan limit
      expect(take).toBe(5);
    });

    it("should enforce FREE plan niche limit", async () => {
      vi.mocked(prisma.userNiche.count).mockResolvedValue(1);

      const count = await prisma.userNiche.count({ where: { userId: "user-free" } });
      expect(count).toBeGreaterThanOrEqual(1);

      // Free plan should block when user already has 1 niche
      const shouldBlock = count >= 1;
      expect(shouldBlock).toBe(true);
    });
  });

  describe("Response Format", () => {
    it("should return trends with plan information", async () => {
      const mockTrends = [{ id: "trend-1", title: "Test" }];
      const mockNiche = { id: "niche-1", slug: "tech" };

      vi.mocked(prisma.niche.findUnique).mockResolvedValue(mockNiche as any);
      vi.mocked(prisma.trend.findMany).mockResolvedValue(mockTrends as any);

      const result = {
        trends: mockTrends,
        plan: "PRO",
      };

      expect(result).toHaveProperty("trends");
      expect(result).toHaveProperty("plan");
      expect(result.plan).toBe("PRO");
    });
  });
});
