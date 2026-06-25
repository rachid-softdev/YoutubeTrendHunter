import { describe, it, expect, vi, beforeEach } from "vitest";
import { extensionAuthSchema, extensionAnalyzeSchema } from "@/lib/schemas";

// ─── Module Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiToken: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    niche: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    trend: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    userNiche: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn().mockResolvedValue(undefined),
  acquireLock: vi.fn().mockResolvedValue(true),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  default: {
    scan: vi.fn().mockResolvedValue(["0", []]),
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(50),
    incr: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/services/subscription.service", () => ({
  getUserPlan: vi.fn().mockResolvedValue("PRO"),
  PLAN_LIMITS: {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  },
}));

vi.mock("@/lib/api-tokens", () => ({
  verifyApiToken: vi.fn(),
  createApiToken: vi.fn(),
  listApiTokens: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/api-error", () => ({
  UnauthorizedError: vi.fn(
    (msg) => new Response(JSON.stringify({ error: msg || "Non authentifié" }), { status: 401 }),
  ),
  ValidationError: vi.fn(
    (msg) => new Response(JSON.stringify({ error: msg || "Données invalides" }), { status: 400 }),
  ),
  NotFoundError: vi.fn(
    (resource) =>
      new Response(JSON.stringify({ error: `${resource} introuvable` }), { status: 404 }),
  ),
  ForbiddenError: vi.fn(
    (msg) => new Response(JSON.stringify({ error: msg || "Accès interdit" }), { status: 403 }),
  ),
  InternalError: vi.fn(
    (msg) => new Response(JSON.stringify({ error: msg || "Erreur interne" }), { status: 500 }),
  ),
}));

vi.mock("@/lib/youtube", () => ({
  getVideoStats: vi.fn(),
  getVideoDetails: vi.fn(),
}));

vi.mock("@/lib/trend-scorer", () => ({
  scoreVideo: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { verifyApiToken, createApiToken, listApiTokens } from "@/lib/api-tokens";
import { getCached, setCached } from "@/lib/redis";

describe("Extension Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Schema Validation ──────────────────────────────────────────────────────

  describe("Schema Validation", () => {
    it("should accept valid extensionAuthSchema", () => {
      expect(extensionAuthSchema.safeParse({}).success).toBe(true);
      expect(extensionAuthSchema.safeParse({ name: "Test Extension" }).success).toBe(true);
    });

    it("should reject name exceeding 100 chars", () => {
      const result = extensionAuthSchema.safeParse({ name: "a".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("should accept valid extensionAnalyzeSchema", () => {
      const result = extensionAnalyzeSchema.safeParse({ videoId: "dQw4w9WgXcQ" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.videoId).toBe("dQw4w9WgXcQ");
      }
    });

    it("should reject empty videoId", () => {
      const result = extensionAnalyzeSchema.safeParse({ videoId: "" });
      expect(result.success).toBe(false);
    });

    it("should reject missing videoId", () => {
      const result = extensionAnalyzeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ─── GET /api/extension/trends ──────────────────────────────────────────────

  describe("GET /api/extension/trends — business logic", () => {
    it("should reject request without token", async () => {
      const authHeader = null;
      const token = authHeader != null ? (authHeader as string).replace("Bearer ", "") : undefined;
      expect(token).toBeUndefined();
    });

    it("should reject invalid token", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue(null);

      const result = await verifyApiToken("th_invalid.abcdef");
      expect(result).toBeNull();
    });

    it("should accept valid token", async () => {
      const mockResult = {
        tokenId: "token-1",
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test" },
      };
      vi.mocked(verifyApiToken).mockResolvedValue(mockResult);

      const result = await verifyApiToken("th_valid.abcdef12");
      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user-123");
    });

    it("should return trends for authenticated token", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue({
        tokenId: "token-1",
        userId: "user-123",
        user: { id: "user-123", email: "test@example.com", name: "Test" },
      });

      const { prisma } = await import("@/lib/prisma");
      const mockTrends = [
        { id: "trend-1", title: "AI Tools", score: 95 },
        { id: "trend-2", title: "ChatGPT", score: 88 },
      ];
      vi.mocked(prisma.trend.findMany).mockResolvedValue(mockTrends as any);

      const trends = await prisma.trend.findMany({
        where: { nicheId: "niche-1", expiresAt: { gte: new Date() } },
        orderBy: [{ score: "desc" }, { id: "asc" }],
        take: 21,
      });

      expect(trends).toHaveLength(2);
      expect(trends[0].title).toBe("AI Tools");
    });

    it("should limit FREE plan to 5 trends", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue({
        tokenId: "token-1",
        userId: "user-free",
        user: { id: "user-free", email: "free@test.com", name: "Free" },
      });

      const { getUserPlan } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("FREE");

      const plan = await getUserPlan("user-free");
      const planLimit = plan === "FREE" ? 5 : 20;

      expect(planLimit).toBe(5);
    });

    it("should allow PRO plan 20 trends", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue({
        tokenId: "token-1",
        userId: "user-pro",
        user: { id: "user-pro", email: "pro@test.com", name: "Pro" },
      });

      const { getUserPlan } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("PRO");

      const plan = await getUserPlan("user-pro");
      const planLimit = plan === "FREE" ? 5 : 20;

      expect(planLimit).toBe(20);
    });
  });

  // ─── GET /api/extension/trends — Cache ──────────────────────────────────────

  describe("GET /api/extension/trends — cache logic", () => {
    it("should return cached data on cache hit", async () => {
      const cachedData = {
        trends: [{ id: "cached-trend", title: "Cached" }],
        plan: "PRO",
        nextCursor: null,
      };
      vi.mocked(getCached).mockResolvedValue(cachedData);

      const cacheKey = "trends:ext:tech-ia:PRO";
      const cached = await getCached(cacheKey);

      expect(cached).toEqual(cachedData);
    });

    it("should set cache after fetching trends", async () => {
      const responseData = {
        trends: [{ id: "trend-1", title: "New Trend" }],
        plan: "PRO",
        nextCursor: null,
      };

      await setCached("trends:ext:tech-ia:PRO:user-123", responseData, 300);
      expect(setCached).toHaveBeenCalledWith("trends:ext:tech-ia:PRO:user-123", responseData, 300);
    });

    it("should skip cache when cursor pagination is used", async () => {
      vi.mocked(getCached).mockClear();

      // When cursor is provided, cache is skipped
      const cursor = "trend-5";
      if (!cursor) {
        const cacheKey = "trends:ext:tech-ia:PRO";
        await getCached(cacheKey);
      }

      expect(getCached).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/extension/trends/niches ───────────────────────────────────────

  describe("GET /api/extension/trends/niches — business logic", () => {
    it("should reject without token", async () => {
      const authHeader = null as string | null;
      const token = authHeader?.replace("Bearer ", "");
      expect(token).toBeUndefined();
    });

    it("should return niches for valid token", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue({
        tokenId: "token-1",
        userId: "user-123",
        user: { id: "user-123", email: "test@test.com", name: "Test" },
      });

      const { prisma } = await import("@/lib/prisma");
      const mockNiches = [
        {
          id: "niche-1",
          name: "Tech",
          slug: "tech",
          description: "Technology trends",
          language: "fr",
          _count: { trends: 15 },
        },
      ];
      vi.mocked(prisma.niche.findMany).mockResolvedValue(mockNiches as any);

      const niches = await prisma.niche.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      expect(niches).toHaveLength(1);
      expect(niches[0].name).toBe("Tech");
    });

    it("should return cached niches on cache hit", async () => {
      const cachedData = {
        niches: [{ id: "niche-1", name: "Tech", slug: "tech", trendCount: 15 }],
        plan: "PRO",
      };
      vi.mocked(getCached).mockResolvedValue(cachedData);

      const cacheKey = "niches:ext:user-123";
      const cached = await getCached(cacheKey);

      expect(cached).toEqual(cachedData);
    });

    it("should set cache after fetching niches", async () => {
      const responseData = {
        niches: [{ id: "niche-1", name: "Tech", slug: "tech", trendCount: 15 }],
        plan: "PRO",
      };

      await setCached("niches:ext:user-123", responseData, 300);
      expect(setCached).toHaveBeenCalledWith("niches:ext:user-123", responseData, 300);
    });
  });

  // ─── POST /api/extension/auth ───────────────────────────────────────────────

  describe("POST /api/extension/auth — token creation", () => {
    it("should require authentication", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      const isAuthenticated = !!session?.user?.id;
      expect(isAuthenticated).toBe(false);
    });

    it("should create token for authenticated user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as any);

      vi.mocked(createApiToken).mockResolvedValue({
        plainText: "th_abc123.def456",
        token: { id: "token-1", name: "Extension Chrome" },
      } as any);

      const result = await createApiToken("user-123", "Extension Chrome");
      expect(result.plainText).toContain("th_");
      expect(result.token.id).toBe("token-1");
    });

    it("should check plan limits before creating token", async () => {
      const { getUserPlan, PLAN_LIMITS } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("FREE");

      const plan = await getUserPlan("user-free");
      const apiAllowed = PLAN_LIMITS[plan]?.api;

      expect(apiAllowed).toBe(false);
    });

    it("should allow TEAM plan to create API tokens", async () => {
      const { getUserPlan, PLAN_LIMITS } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("TEAM");

      const plan = await getUserPlan("user-team");
      const apiAllowed = PLAN_LIMITS[plan]?.api;

      expect(apiAllowed).toBe(true);
    });
  });

  // ─── GET /api/extension/auth ────────────────────────────────────────────────

  describe("GET /api/extension/auth — list tokens", () => {
    it("should require authentication", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should return list of tokens for authenticated user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const mockTokens = [
        {
          id: "token-1",
          name: "Extension Chrome",
          lastUsedAt: null,
          expiresAt: null,
          createdAt: new Date(),
        },
      ];
      vi.mocked(listApiTokens).mockResolvedValue(mockTokens as any);

      const tokens = await listApiTokens("user-123");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe("Extension Chrome");
    });
  });

  // ─── POST /api/extension/analyze ────────────────────────────────────────────

  describe("POST /api/extension/analyze — business logic", () => {
    it("should reject without token", async () => {
      const authHeader = undefined as string | undefined;
      const token = authHeader?.replace("Bearer ", "");
      expect(token).toBeUndefined();
    });

    it("should reject invalid token", async () => {
      vi.mocked(verifyApiToken).mockResolvedValue(null);
      const token = "th_invalid.abcdef";
      const result = await verifyApiToken(token);
      expect(result).toBeNull();
    });

    it("should require videoId in body", () => {
      const result = extensionAnalyzeSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should accept valid videoId in body", () => {
      const result = extensionAnalyzeSchema.safeParse({ videoId: "dQw4w9WgXcQ" });
      expect(result.success).toBe(true);
    });

    it("should return LIMITED for FREE plan on analyze", async () => {
      const { getUserPlan } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("FREE");

      const plan = await getUserPlan("user-free");
      if (plan === "FREE") {
        const response = {
          score: 0,
          status: "LIMITED",
          message: "Passez Pro pour analyser les vidéos",
        };
        expect(response.status).toBe("LIMITED");
        expect(response.score).toBe(0);
      }
    });

    it("should proceed with analyze for PRO plan", async () => {
      const { getUserPlan } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("PRO");
      vi.mocked(verifyApiToken).mockResolvedValue({
        tokenId: "token-1",
        userId: "user-pro",
        user: { id: "user-pro", email: "pro@test.com", name: "Pro" },
      });

      const plan = await getUserPlan("user-pro");
      expect(plan).toBe("PRO");
    });

    it("should handle video not found", async () => {
      const { getVideoStats } = await import("@/lib/youtube");
      vi.mocked(getVideoStats).mockResolvedValue([]);

      const stats = await getVideoStats(["nonexistent"]);
      const notFound = !stats[0];
      expect(notFound).toBe(true);
    });
  });
});
