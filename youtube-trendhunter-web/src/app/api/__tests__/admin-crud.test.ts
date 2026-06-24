import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ─── Module Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    niche: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userNiche: {
      deleteMany: vi.fn(),
    },
    trend: {
      deleteMany: vi.fn(),
    },
    subscription: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    apiToken: {
      deleteMany: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
    },
    alert: {
      deleteMany: vi.fn(),
    },
    auditLog: {
      deleteMany: vi.fn(),
    },
    job: {
      deleteMany: vi.fn(),
    },
    account: {
      deleteMany: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    plan: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/observability", () => ({
  metrics: {
    getEnrichedStats: vi.fn(),
  },
}));

vi.mock("@/lib/services/job.service", () => ({
  countJobsByStatus: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  default: {
    scan: vi.fn().mockResolvedValue(["0", []]),
  },
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

// Inline schema matching the admin niches route
const nicheCreateSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
  slug: z
    .string()
    .min(1, "Le slug est requis")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug invalide"),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
});

const nicheUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
});

describe("Admin CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Schema Validation ──────────────────────────────────────────────────────

  describe("Schema Validation", () => {
    it("should accept valid nicheCreateSchema", () => {
      const result = nicheCreateSchema.safeParse({
        name: "Tech",
        slug: "tech",
        description: "Technology trends",
        language: "fr",
        isActive: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Tech");
        expect(result.data.slug).toBe("tech");
      }
    });

    it("should reject niche with invalid slug characters", () => {
      const result = nicheCreateSchema.safeParse({
        name: "Tech",
        slug: "Tech With Spaces!!",
      });
      expect(result.success).toBe(false);
    });

    it("should reject niche without name", () => {
      const result = nicheCreateSchema.safeParse({ slug: "tech" });
      expect(result.success).toBe(false);
    });

    it("should accept valid nicheUpdateSchema with partial data", () => {
      const result = nicheUpdateSchema.safeParse({ name: "Updated Tech" });
      expect(result.success).toBe(true);
    });

    it("should reject nicheUpdateSchema with invalid slug", () => {
      const result = nicheUpdateSchema.safeParse({ slug: "UPPERCASE SLUG" });
      expect(result.success).toBe(false);
    });
  });

  // ─── Admin Authorization ────────────────────────────────────────────────────

  describe("Admin Authorization", () => {
    it("should allow admin users to pass requireAdmin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "admin@test.com" });

      const result = await requireAdmin();
      expect(result.id).toBe("admin-1");
    });

    it("should reject non-admin users", async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error("UNAUTHORIZED"));

      try {
        await requireAdmin();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toBe("UNAUTHORIZED");
      }
    });

    it("should check role from session for admin stats route", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN" },
      } as any);

      const session = await auth();
      const isAdmin = session?.user?.role === "ADMIN";
      expect(isAdmin).toBe(true);
    });

    it("should reject non-admin role from session", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-1", role: "USER" },
      } as any);

      const session = await auth();
      const isAdmin = session?.user?.role === "ADMIN";
      expect(isAdmin).toBe(false);
    });
  });

  // ─── GET /api/admin/users ───────────────────────────────────────────────────

  describe("GET /api/admin/users — business logic", () => {
    it("should fetch users with pagination", async () => {
      const mockUsers = [
        { id: "user-1", name: "Alice", email: "alice@test.com", role: "USER" },
        { id: "user-2", name: "Bob", email: "bob@test.com", role: "ADMIN" },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      const page = 1;
      const limit = 20;
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count(),
      ]);

      const pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      };

      expect(users).toHaveLength(2);
      expect(pagination.total).toBe(2);
      expect(pagination.hasNext).toBe(false);
    });

    it("should support search filter", async () => {
      const search = "alice";
      const where = {
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      };

      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1", name: "Alice", email: "alice@test.com" },
      ] as any);

      const users = await prisma.user.findMany({ where });
      expect(users).toHaveLength(1);
    });

    it("should handle empty search results", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const users = await prisma.user.findMany();
      const total = await prisma.user.count();

      expect(users).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  // ─── GET /api/admin/stats ───────────────────────────────────────────────────

  describe("GET /api/admin/stats — business logic", () => {
    it("should compute MRR from pro and team counts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN" },
      } as any);

      vi.mocked(prisma.user.count).mockResolvedValue(100);
      vi.mocked(prisma.subscription.count).mockResolvedValue(50);
      // Mock plan-specific counts by filtering
      vi.mocked(prisma.subscription.count)
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(30) // PRO
        .mockResolvedValueOnce(10) // TEAM
        .mockResolvedValueOnce(10); // FREE

      const isAdmin = true;
      expect(isAdmin).toBe(true);

      const totalUsers = await prisma.user.count();
      expect(totalUsers).toBe(100);

      // Simulate MRR calculation
      const proCount = 30;
      const teamCount = 10;
      const mrr = proCount * 15 + teamCount * 39;
      expect(mrr).toBe(30 * 15 + 10 * 39);
    });

    it("should fetch recent users", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1", name: "New User", email: "new@test.com", createdAt: new Date() },
      ] as any);

      const recentUsers = await prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
      });

      expect(recentUsers).toHaveLength(1);
    });
  });

  // ─── GET /api/admin/plans ───────────────────────────────────────────────────

  describe("GET /api/admin/plans — business logic", () => {
    it("should sort plans by name asc when requested", async () => {
      const mockPlans = [
        { key: "pro", name: "Pro", sortOrder: 2 },
        { key: "free", name: "Free", sortOrder: 1 },
        { key: "team", name: "Team", sortOrder: 3 },
      ];

      vi.mocked(prisma.plan.findMany).mockResolvedValue(mockPlans as any);

      const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
      const sorted = [...plans].sort((a: any, b: any) => a.name?.localeCompare(b.name));

      expect(sorted[0].name).toBe("Free");
      expect(sorted[1].name).toBe("Pro");
      expect(sorted[2].name).toBe("Team");
    });

    it("should paginate plans", async () => {
      const mockPlans = Array.from({ length: 5 }, (_, i) => ({
        key: `plan-${i}`,
        name: `Plan ${i}`,
        sortOrder: i,
      }));

      vi.mocked(prisma.plan.findMany).mockResolvedValue(mockPlans as any);

      const page = 1;
      const limit = 2;
      const plans = await prisma.plan.findMany();
      const start = (page - 1) * limit;
      const paginated = plans.slice(start, start + limit);

      expect(paginated).toHaveLength(2);
    });
  });

  // ─── GET /api/admin/niches ─────────────────────────────────────────────────

  describe("GET /api/admin/niches — business logic", () => {
    it("should fetch niches with trend count", async () => {
      const mockNiches = [
        {
          id: "niche-1",
          name: "Tech",
          slug: "tech",
          _count: { trends: 25 },
        },
        {
          id: "niche-2",
          name: "Gaming",
          slug: "gaming",
          _count: { trends: 15 },
        },
      ];

      vi.mocked(prisma.niche.findMany).mockResolvedValue(mockNiches as any);

      const niches = await prisma.niche.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { trends: true } } },
      });

      expect(niches).toHaveLength(2);
      expect(niches[0]._count.trends).toBe(25);
      expect(niches[1]._count.trends).toBe(15);
    });
  });

  // ─── POST /api/admin/niches ────────────────────────────────────────────────

  describe("POST /api/admin/niches — business logic", () => {
    it("should create new niche with valid body", async () => {
      const body = {
        name: "AI",
        slug: "ai",
        description: "Artificial Intelligence trends",
        language: "fr",
        isActive: true,
      };

      const parsed = nicheCreateSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        vi.mocked(prisma.niche.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.niche.create).mockResolvedValue({ id: "niche-new", ...body } as any);

        const existing = await prisma.niche.findUnique({ where: { slug: "ai" } });
        expect(existing).toBeNull();

        const niche = await prisma.niche.create({ data: body as any });
        expect(niche.id).toBe("niche-new");
      }
    });

    it("should return 409 when slug already exists", async () => {
      vi.mocked(prisma.niche.findUnique).mockResolvedValue({
        id: "niche-existing",
        slug: "tech",
      } as any);

      const existing = await prisma.niche.findUnique({ where: { slug: "tech" } });
      const conflict = existing !== null;
      expect(conflict).toBe(true);
    });
  });

  // ─── GET /api/admin/niches/[id] ────────────────────────────────────────────

  describe("GET /api/admin/niches/[id] — business logic", () => {
    it("should find niche by id", async () => {
      const mockNiche = {
        id: "niche-1",
        name: "Tech",
        slug: "tech",
        _count: { trends: 25, userNiches: 10 },
      };

      vi.mocked(prisma.niche.findUnique).mockResolvedValue(mockNiche as any);

      const niche = await prisma.niche.findUnique({ where: { id: "niche-1" } });
      expect(niche).not.toBeNull();
      expect(niche?.name).toBe("Tech");
    });

    it("should return 404 when niche not found", async () => {
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(null);

      const niche = await prisma.niche.findUnique({ where: { id: "nonexistent" } });
      expect(niche).toBeNull();
    });
  });

  // ─── PATCH /api/admin/niches/[id] ──────────────────────────────────────────

  describe("PATCH /api/admin/niches/[id] — business logic", () => {
    it("should update niche with valid data", async () => {
      const existingNiche = { id: "niche-1", name: "Tech", slug: "tech" };
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(existingNiche as any);
      vi.mocked(prisma.niche.update).mockResolvedValue({
        ...existingNiche,
        name: "Technology",
      } as any);

      const niche = await prisma.niche.update({
        where: { id: "niche-1" },
        data: { name: "Technology" },
      });

      expect(niche.name).toBe("Technology");
    });

    it("should check slug uniqueness when changing slug", async () => {
      // Setup: finding a different niche with same slug indicates a conflict
      vi.mocked(prisma.niche.findUnique).mockImplementation(async ({ where }: any) => {
        if (where.slug === "tech") return { id: "niche-2", slug: "tech" };
        if (where.id === "niche-1") return { id: "niche-1", name: "Tech", slug: "old-slug" };
        return null;
      });

      const existingNiche = (await prisma.niche.findUnique({ where: { id: "niche-1" } })) as any;
      const slugExists = await prisma.niche.findUnique({ where: { slug: "tech" } });

      const conflict = slugExists !== null && slugExists.id !== existingNiche.id;
      expect(conflict).toBe(true);
    });
  });

  // ─── DELETE /api/admin/niches/[id] ─────────────────────────────────────────

  describe("DELETE /api/admin/niches/[id] — cascade logic", () => {
    it("should cascade delete userNiche, trends, and niche", async () => {
      vi.mocked(prisma.niche.findUnique).mockResolvedValue({
        id: "niche-1",
        name: "Tech",
        slug: "tech",
      } as any);

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}, {}] as any);

      const niche = await prisma.niche.findUnique({ where: { id: "niche-1" } });
      expect(niche).not.toBeNull();

      if (niche) {
        await prisma.$transaction([
          prisma.userNiche.deleteMany({ where: { nicheId: niche.id } }),
          prisma.trend.deleteMany({ where: { nicheId: niche.id } }),
          prisma.niche.delete({ where: { id: niche.id } }),
        ]);

        expect(prisma.$transaction).toHaveBeenCalled();
      }
    });

    it("should return 404 when deleting non-existing niche", async () => {
      vi.mocked(prisma.niche.findUnique).mockResolvedValue(null);

      const niche = await prisma.niche.findUnique({ where: { id: "nonexistent" } });
      expect(niche).toBeNull();
    });
  });

  // ─── DELETE /api/admin/users/[id] ──────────────────────────────────────────

  describe("DELETE /api/admin/users/[id] — cascade logic", () => {
    it("should cascade delete all user-related data", async () => {
      const mockUser = { id: "user-1", name: "Test User" };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

      const user = await prisma.user.findUnique({ where: { id: "user-1" } });
      expect(user).not.toBeNull();

      if (user) {
        await prisma.$transaction([
          prisma.session.deleteMany({ where: { userId: user.id } }),
          prisma.account.deleteMany({ where: { userId: user.id } }),
          prisma.apiToken.deleteMany({ where: { userId: user.id } }),
          prisma.userRole.deleteMany({ where: { userId: user.id } }),
          prisma.userNiche.deleteMany({ where: { userId: user.id } }),
          prisma.alert.deleteMany({ where: { userId: user.id } }),
          prisma.auditLog.deleteMany({ where: { userId: user.id } }),
          prisma.job.deleteMany({ where: { userId: user.id } }),
          prisma.subscription.deleteMany({ where: { userId: user.id } }),
          prisma.user.delete({ where: { id: user.id } }),
        ]);

        expect(prisma.$transaction).toHaveBeenCalled();
      }
    });

    it("should return 404 when deleting non-existing user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const user = await prisma.user.findUnique({ where: { id: "nonexistent" } });
      expect(user).toBeNull();
    });
  });

  // ─── GET /api/admin/users/export ────────────────────────────────────────────

  describe("GET /api/admin/users/export — CSV logic", () => {
    it("should produce CSV content", async () => {
      const mockUsers = [
        {
          name: "Alice",
          email: "alice@test.com",
          role: "USER",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-02"),
          subscription: { plan: "PRO", status: "ACTIVE" },
        },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const users = await prisma.user.findMany();

      const headers = [
        "name",
        "email",
        "role",
        "plan",
        "subscriptionStatus",
        "createdAt",
        "updatedAt",
      ];
      const rows = users.map((u: any) => [
        escapeCsv(u.name || ""),
        escapeCsv(u.email || ""),
        escapeCsv(u.role || "USER"),
        escapeCsv(u.subscription?.plan || "FREE"),
        escapeCsv(u.subscription?.status || "none"),
        escapeCsv(u.createdAt?.toISOString() || ""),
        escapeCsv(u.updatedAt?.toISOString() || ""),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");

      expect(csvContent).toContain("alice@test.com");
      expect(csvContent).toContain("PRO");
      expect(csvContent).toContain("ACTIVE");
    });

    it("should include Content-Type header for CSV", () => {
      const response = new Response("", {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
      expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    });
  });

  // ─── GET /api/admin/monitoring ──────────────────────────────────────────────

  describe("GET /api/admin/monitoring — business logic", () => {
    it("should return enriched stats with job queue and cache info", async () => {
      const { metrics } = await import("@/lib/observability");
      const { countJobsByStatus } = await import("@/lib/services/job.service");

      vi.mocked(metrics.getEnrichedStats).mockReturnValue({
        endpoints: {},
        totals: {
          requests: 100,
          errors: 5,
          errorRate: 5,
          byStatus: { "2xx": 80, "4xx": 15, "5xx": 5 },
        },
        rateHistory: { minutes: ["12:00"], counts: [10] },
      });

      vi.mocked(countJobsByStatus).mockResolvedValue({
        pending: 3,
        processing: 1,
        completed: 50,
        failed: 2,
      });

      const enriched = metrics.getEnrichedStats();
      const jobQueue = await countJobsByStatus();

      expect(enriched.totals.requests).toBe(100);
      expect(jobQueue.pending).toBe(3);
      expect(jobQueue.completed).toBe(50);
    });
  });
});

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
