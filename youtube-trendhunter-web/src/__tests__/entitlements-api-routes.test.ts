// ============================================
// Entitlements API Routes — HTTP-level Test Suite
// Covers all 11 route handlers with success,
// error, edge-case, and cache invalidation tests.
// ============================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────
// Module Mocks (hoisted before all imports)
// ────────────────────────────────────────────────────────────

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
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    feature: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    planFeature: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    entitlementOverride: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    usageTracking: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  getFeatureGateService: vi.fn(),
  getDowngradeService: vi.fn(),
  PrismaEntitlementRepository: vi.fn(function () {
    return {};
  }),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// ────────────────────────────────────────────────────────────
// Imports (resolved against the mocked modules)
// ────────────────────────────────────────────────────────────

import { auth } from "@/lib/auth";
import { requireAdmin, AuthError } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import {
  getFeatureGateService,
  getDowngradeService,
  PrismaEntitlementRepository,
} from "@/lib/feature-flags";

// Route handlers (all 11 endpoints)
import { GET as GET_Entitlements } from "@/app/api/entitlements/route";
import { GET as GET_MeEntitlements } from "@/app/api/me/entitlements/route";
import { GET as GET_AdminFeatures, POST as POST_AdminFeatures } from "@/app/api/admin/features/route";
import { PUT as PUT_AdminFeature } from "@/app/api/admin/features/[key]/route";
import { GET as GET_AdminPlanFeatures, POST as POST_AdminPlanFeatures } from "@/app/api/admin/plans/[planKey]/features/route";
import { GET as GET_AdminOverrides, POST as POST_AdminOverrides } from "@/app/api/admin/overrides/route";
import { DELETE as DELETE_AdminOverride } from "@/app/api/admin/overrides/[id]/route";
import { GET as GET_AdminOrgEntitlements } from "@/app/api/admin/orgs/[orgId]/entitlements/route";
import { GET as GET_AdminDowngradePreview } from "@/app/api/admin/orgs/[orgId]/downgrade-preview/route";
import { POST as POST_AdminCacheInvalidate } from "@/app/api/admin/cache/invalidate/[orgId]/route";
import { GET as GET_DebugEntitlements } from "@/app/api/debug/entitlements/route";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Create a mock FeatureGateService with all methods as vi.fn().
 */
function createMockGate() {
  return {
    getAllEntitlements: vi.fn(),
    isInExperiment: vi.fn(),
    invalidateCache: vi.fn(),
    getDebugTrace: vi.fn(),
    hasFeature: vi.fn(),
    getLimit: vi.fn(),
  };
}

/**
 * Create a mock DowngradeService.
 */
function createMockDowngrade() {
  return {
    previewDowngrade: vi.fn(),
  };
}

/**
 * Create a mock PrismaEntitlementRepository instance.
 */
function createMockRepo() {
  return {
    getActiveSubscription: vi.fn(),
    getFeature: vi.fn(),
    getOverridesForOrg: vi.fn(),
    getCurrentUsage: vi.fn(),
    getAllPlans: vi.fn(),
    getPlanFeature: vi.fn(),
    getPlan: vi.fn(),
    getPlanFeatures: vi.fn(),
  };
}

/**
 * Convenience: mock auth() to return an authenticated user session.
 */
function mockAuthenticatedUser(userId = "user-1", role?: string) {
  const user: Record<string, string> = { id: userId };
  if (role) user.role = role;
  vi.mocked(auth).mockResolvedValue({ user } as any);
}

/**
 * Convenience: mock auth() to return null (unauthenticated).
 */
function mockUnauthenticated() {
  vi.mocked(auth).mockResolvedValue(null);
}

/**
 * Convenience: mock requireAdmin() to resolve successfully.
 */
function mockAdminAuthorized(id = "admin-1", email = "admin@test.com") {
  vi.mocked(requireAdmin).mockResolvedValue({ id, email });
}

/**
 * Convenience: mock requireAdmin() to reject with AuthError.
 */
function mockAdminUnauthorized(status = 401) {
  vi.mocked(requireAdmin).mockRejectedValue(new AuthError("UNAUTHORIZED", status));
}

/**
 * Convenience: parse a Next.js Response as JSON.
 */
async function json(res: Response): Promise<any> {
  return res.json();
}

// ────────────────────────────────────────────────────────────
// Test Suite
// ────────────────────────────────────────────────────────────

describe("Entitlements API Routes — HTTP-level", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ────────────────────────────────────────────────────────
  // GET /api/entitlements
  // ────────────────────────────────────────────────────────

  describe("GET /api/entitlements", () => {
    it("returns 200 with full entitlements for authenticated user with orgId", async () => {
      mockAuthenticatedUser("user-1");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: "org-1" } as any);
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        plan: "PRO",
        planKey: "pro",
      } as any);
      vi.mocked(prisma.usageTracking.findMany).mockResolvedValue([
        { featureKey: "video-export", usageCount: 3, periodEnd: new Date("2026-01-31") } as any,
      ]);
      vi.mocked(prisma.feature.findMany).mockResolvedValue([
        { key: "dark-mode-beta", type: "EXPERIMENT", isActive: true } as any,
      ]);

      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        planKey: "pro",
        features: { "video-export": true, "advanced-analytics": true },
        limits: { "video-export": 10, "team-members": 5 },
      });
      mockGate.isInExperiment.mockResolvedValue(true);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GET_Entitlements();
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.plan).toBe("PRO");
      expect(body.planKey).toBe("pro");
      expect(body.features["video-export"]).toBe(true);
      expect(body.limits["video-export"]).toBe(10);
      expect(body.usage["video-export"]).toBe(3);
      expect(body.experimentBuckets["dark-mode-beta"]).toBe(true);
      expect(body.resetAt["video-export"]).toBeTruthy();
    });

    it("returns 200 with minimal data for authenticated user without orgId", async () => {
      mockAuthenticatedUser("user-2");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: null } as any);

      const res = await GET_Entitlements();
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.plan).toBe("FREE");
      expect(body.planKey).toBe("free");
      expect(body.features).toEqual({});
      expect(body.limits).toEqual({});
      expect(body.usage).toEqual({});
      expect(body.experimentBuckets).toEqual({});
    });

    it("returns 200 with FREE defaults when no subscription exists", async () => {
      mockAuthenticatedUser("user-3");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: "org-3" } as any);
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.usageTracking.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);

      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        planKey: "free",
        features: {},
        limits: {},
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GET_Entitlements();
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.plan).toBe("FREE");
      expect(body.planKey).toBe("free");
    });

    it("returns 401 when user is not authenticated", async () => {
      mockUnauthenticated();

      const res = await GET_Entitlements();
      expect(res.status).toBe(401);

      const body = await json(res);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns 500 when prisma throws", async () => {
      mockAuthenticatedUser("user-1");
      vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("DB down"));

      const res = await GET_Entitlements();
      expect(res.status).toBe(500);

      const body = await json(res);
      expect(body.code).toBe("INTERNAL_ERROR");
    });

    it("returns 200 with empty usage when usageTracking returns empty", async () => {
      mockAuthenticatedUser("user-1");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: "org-1" } as any);
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        plan: "PRO",
        planKey: "pro",
      } as any);
      vi.mocked(prisma.usageTracking.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);

      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        planKey: "pro",
        features: { "video-export": true },
        limits: { "video-export": 10 },
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const res = await GET_Entitlements();
      const body = await json(res);
      expect(body.usage).toEqual({});
      expect(body.resetAt).toEqual({});
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/me/entitlements
  // ────────────────────────────────────────────────────────

  describe("GET /api/me/entitlements", () => {
    it("returns 200 with Cache-Control header for authenticated user", async () => {
      mockAuthenticatedUser("user-1");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: "org-1" } as any);
      vi.mocked(prisma.subscription.findFirst).mockResolvedValue({
        plan: "PRO",
        planKey: "pro",
      } as any);

      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        planKey: "pro",
        features: { "video-export": true },
        limits: {},
      });
      mockGate.isInExperiment.mockResolvedValue(false);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      vi.mocked(prisma.usageTracking.findMany).mockResolvedValue([]);
      vi.mocked(prisma.feature.findMany).mockResolvedValue([]);

      const res = await GET_MeEntitlements();
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=60, s-maxage=0");

      const body = await json(res);
      expect(body.plan).toBe("PRO");
      expect(body.planKey).toBe("pro");
    });

    it("returns 200 with minimal data when user has no orgId", async () => {
      mockAuthenticatedUser("user-2");
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ orgId: null } as any);

      const res = await GET_MeEntitlements();
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.plan).toBe("FREE");
      expect(body.planKey).toBe("free");
      expect(body.features).toEqual({});
    });

    it("returns 401 when user is not authenticated", async () => {
      mockUnauthenticated();

      const res = await GET_MeEntitlements();
      expect(res.status).toBe(401);

      const body = await json(res);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("returns 500 on internal error", async () => {
      mockAuthenticatedUser("user-1");
      vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("DB crash"));

      const res = await GET_MeEntitlements();
      expect(res.status).toBe(500);

      const body = await json(res);
      expect(body.code).toBe("INTERNAL_ERROR");
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/admin/features
  // ────────────────────────────────────────────────────────

  describe("GET /api/admin/features", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with paginated feature list", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([
        { key: "feature-a", type: "BOOLEAN", name: "Feature A" } as any,
        { key: "feature-b", type: "LIMIT", name: "Feature B" } as any,
      ]);
      vi.mocked(prisma.feature.count).mockResolvedValue(2);

      const req = new NextRequest("http://localhost/api/admin/features?page=1&limit=10");
      const res = await GET_AdminFeatures(req);
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(10);
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.hasNext).toBe(false);
      expect(body.pagination.hasPrev).toBe(false);
    });

    it("returns 200 with type filter applied", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([
        { key: "exp-feature", type: "EXPERIMENT", name: "Exp" } as any,
      ]);
      vi.mocked(prisma.feature.count).mockResolvedValue(1);

      const req = new NextRequest("http://localhost/api/admin/features?type=EXPERIMENT");
      const res = await GET_AdminFeatures(req);
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe("EXPERIMENT");
      // Verify the where clause was passed to Prisma
      expect(vi.mocked(prisma.feature.findMany).mock.calls[0][0]?.where).toEqual({
        type: "EXPERIMENT",
      });
    });

    it("returns 200 with hasNext true when more results exist", async () => {
      const manyFeatures = Array.from({ length: 25 }, (_, i) => ({
        key: `feature-${i}`,
        type: "BOOLEAN",
        name: `Feature ${i}`,
      }));
      vi.mocked(prisma.feature.findMany).mockResolvedValue(manyFeatures.slice(0, 20) as any);
      vi.mocked(prisma.feature.count).mockResolvedValue(25);

      const req = new NextRequest("http://localhost/api/admin/features?page=1&limit=20");
      const res = await GET_AdminFeatures(req);
      const body = await json(res);
      expect(body.pagination.hasNext).toBe(true);
      expect(body.pagination.totalPages).toBe(2);
    });

    it("returns 200 with hasPrev true on page 2", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.feature.count).mockResolvedValue(25);

      const req = new NextRequest("http://localhost/api/admin/features?page=2&limit=20");
      const res = await GET_AdminFeatures(req);
      const body = await json(res);
      expect(body.pagination.hasPrev).toBe(true);
    });

    it("returns 200 when page is negative — clamps to 1", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([
        { key: "a", type: "BOOLEAN" } as any,
      ]);
      vi.mocked(prisma.feature.count).mockResolvedValue(1);

      const req = new NextRequest("http://localhost/api/admin/features?page=-5&limit=20");
      const res = await GET_AdminFeatures(req);
      const body = await json(res);
      expect(body.pagination.page).toBe(1);
    });

    it("returns 200 when limit exceeds 100 — clamps to 100", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      const req = new NextRequest("http://localhost/api/admin/features?limit=999");
      const res = await GET_AdminFeatures(req);
      const body = await json(res);
      expect(body.pagination.limit).toBe(100);
    });

    it("returns 200 when limit is 0 — clamps to 1", async () => {
      vi.mocked(prisma.feature.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.feature.count).mockResolvedValue(0);

      const req = new NextRequest("http://localhost/api/admin/features?limit=0");
      const res = await GET_AdminFeatures(req);
      const body = await json(res);
      expect(body.pagination.limit).toBe(1);
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new NextRequest("http://localhost/api/admin/features");
      const res = await GET_AdminFeatures(req);
      expect(res.status).toBe(403);

      const body = await json(res);
      expect(body.error).toBe("UNAUTHORIZED");
    });

    it("returns 500 on prisma error", async () => {
      vi.mocked(prisma.feature.findMany).mockRejectedValue(new Error("db error"));

      const req = new NextRequest("http://localhost/api/admin/features");
      const res = await GET_AdminFeatures(req);
      expect(res.status).toBe(500);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/admin/features
  // ────────────────────────────────────────────────────────

  describe("POST /api/admin/features", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 201 when feature is created", async () => {
      vi.mocked(prisma.feature.create).mockResolvedValue({
        id: "feat-1",
        key: "new-feature",
        name: "New Feature",
        type: "BOOLEAN",
        isActive: true,
      } as any);

      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "new-feature", name: "New Feature", type: "BOOLEAN", isActive: true }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(201);

      const body = await json(res);
      expect(body.data.key).toBe("new-feature");
    });

    it("returns 400 when key is missing", async () => {
      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "BOOLEAN" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when type is missing", async () => {
      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test-feature" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when type is invalid", async () => {
      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test", type: "STRING" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.details).toContain("BOOLEAN");
    });

    it("returns 409 when key already exists (P2002)", async () => {
      vi.mocked(prisma.feature.create).mockRejectedValue({ code: "P2002" });

      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "duplicate", type: "BOOLEAN" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(409);

      const body = await json(res);
      expect(body.error).toBe("CONFLICT");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test", type: "BOOLEAN" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(401);
    });

    it("returns 500 on internal error", async () => {
      vi.mocked(prisma.feature.create).mockRejectedValue(new Error("unexpected"));

      const req = new NextRequest("http://localhost/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "test", type: "BOOLEAN" }),
      });
      const res = await POST_AdminFeatures(req);
      expect(res.status).toBe(500);
    });
  });

  // ────────────────────────────────────────────────────────
  // PUT /api/admin/features/[key]
  // ────────────────────────────────────────────────────────

  describe("PUT /api/admin/features/[key]", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 when feature is updated", async () => {
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "feat-1",
        key: "existing-feature",
        type: "BOOLEAN",
      } as any);
      vi.mocked(prisma.feature.update).mockResolvedValue({
        id: "feat-1",
        key: "existing-feature",
        name: "Updated Name",
        type: "BOOLEAN",
        isActive: true,
      } as any);

      const req = new NextRequest("http://localhost/api/admin/features/existing-feature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name", isActive: true }),
      });
      const params = Promise.resolve({ key: "existing-feature" });
      const res = await PUT_AdminFeature(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data.name).toBe("Updated Name");
    });

    it("returns 404 when feature is not found", async () => {
      vi.mocked(prisma.feature.findUnique).mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/admin/features/missing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      });
      const params = Promise.resolve({ key: "missing" });
      const res = await PUT_AdminFeature(req, { params });
      expect(res.status).toBe(404);

      const body = await json(res);
      expect(body.error).toBe("NOT_FOUND");
    });

    it("returns 400 when type is invalid in update", async () => {
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "feat-1",
        key: "existing",
        type: "BOOLEAN",
      } as any);

      const req = new NextRequest("http://localhost/api/admin/features/existing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "INVALID" }),
      });
      const params = Promise.resolve({ key: "existing" });
      const res = await PUT_AdminFeature(req, { params });
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new NextRequest("http://localhost/api/admin/features/x", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test" }),
      });
      const params = Promise.resolve({ key: "x" });
      const res = await PUT_AdminFeature(req, { params });
      expect(res.status).toBe(403);
    });

    it("applies partial update — only sends defined fields", async () => {
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({
        id: "feat-1",
        key: "partial",
        type: "BOOLEAN",
      } as any);
      vi.mocked(prisma.feature.update).mockResolvedValue({
        id: "feat-1",
        key: "partial",
        name: "Original",
        description: "New desc",
        type: "BOOLEAN",
        isActive: true,
      } as any);

      const req = new NextRequest("http://localhost/api/admin/features/partial", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "New desc" }),
      });
      const params = Promise.resolve({ key: "partial" });
      const res = await PUT_AdminFeature(req, { params });
      expect(res.status).toBe(200);

      // Verify only description was passed to prisma.update
      const updateCall = vi.mocked(prisma.feature.update).mock.calls[0][0];
      expect(updateCall.data).toHaveProperty("description");
      expect(updateCall.data).not.toHaveProperty("name");
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/admin/plans/[planKey]/features
  // ────────────────────────────────────────────────────────

  describe("GET /api/admin/plans/[planKey]/features", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with plan features", async () => {
      vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "plan-1", key: "pro" } as any);
      vi.mocked(prisma.planFeature.findMany).mockResolvedValue([
        { id: "pf-1", enabled: true, feature: { key: "feat-a", type: "BOOLEAN" } } as any,
      ]);

      const req = new NextRequest("http://localhost/api/admin/plans/pro/features");
      const params = Promise.resolve({ planKey: "pro" });
      const res = await GET_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data).toHaveLength(1);
    });

    it("returns 404 when plan is not found", async () => {
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/admin/plans/nonexistent/features");
      const params = Promise.resolve({ planKey: "nonexistent" });
      const res = await GET_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(404);

      const body = await json(res);
      expect(body.error).toBe("NOT_FOUND");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new NextRequest("http://localhost/api/admin/plans/pro/features");
      const params = Promise.resolve({ planKey: "pro" });
      const res = await GET_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/admin/plans/[planKey]/features
  // ────────────────────────────────────────────────────────

  describe("POST /api/admin/plans/[planKey]/features", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 201 when plan-feature is created (upsert)", async () => {
      vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "plan-1", key: "pro" } as any);
      vi.mocked(prisma.feature.findUnique).mockResolvedValue({ id: "feat-1", key: "video-export" } as any);
      vi.mocked(prisma.planFeature.upsert).mockResolvedValue({
        id: "pf-1",
        planId: "plan-1",
        featureId: "feat-1",
        enabled: true,
        limitValue: 50,
        downgradeStrategy: "GRACEFUL",
        sortOrder: 1,
      } as any);

      const req = new NextRequest("http://localhost/api/admin/plans/pro/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureKey: "video-export",
          enabled: true,
          limitValue: 50,
          downgradeStrategy: "GRACEFUL",
        }),
      });
      const params = Promise.resolve({ planKey: "pro" });
      const res = await POST_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(201);

      const body = await json(res);
      expect(body.data.enabled).toBe(true);
    });

    it("returns 400 when featureKey is missing", async () => {
      const req = new NextRequest("http://localhost/api/admin/plans/pro/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const params = Promise.resolve({ planKey: "pro" });
      const res = await POST_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.error).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when plan is not found", async () => {
      vi.mocked(prisma.plan.findUnique).mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/admin/plans/nonexistent/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: "test" }),
      });
      const params = Promise.resolve({ planKey: "nonexistent" });
      const res = await POST_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(404);

      const body = await json(res);
      expect(body.error).toBe("NOT_FOUND");
      expect(body.details).toContain("Plan");
    });

    it("returns 404 when feature is not found", async () => {
      vi.mocked(prisma.plan.findUnique).mockResolvedValue({ id: "plan-1", key: "pro" } as any);
      vi.mocked(prisma.feature.findUnique).mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/admin/plans/pro/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: "missing-feature" }),
      });
      const params = Promise.resolve({ planKey: "pro" });
      const res = await POST_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(404);

      const body = await json(res);
      expect(body.details).toContain("Feature");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new NextRequest("http://localhost/api/admin/plans/pro/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: "test" }),
      });
      const params = Promise.resolve({ planKey: "pro" });
      const res = await POST_AdminPlanFeatures(req, { params });
      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/admin/overrides
  // ────────────────────────────────────────────────────────

  describe("GET /api/admin/overrides", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with paginated overrides list", async () => {
      vi.mocked(prisma.entitlementOverride.findMany).mockResolvedValue([
        {
          id: "ovr-1",
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "video-export",
          enabled: true,
        } as any,
      ]);
      vi.mocked(prisma.entitlementOverride.count).mockResolvedValue(1);

      const req = new NextRequest("http://localhost/api/admin/overrides?page=1&limit=10");
      const res = await GET_AdminOverrides(req);
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });

    it("filters by scope query param", async () => {
      vi.mocked(prisma.entitlementOverride.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.entitlementOverride.count).mockResolvedValue(0);

      const req = new NextRequest("http://localhost/api/admin/overrides?scope=USER");
      await GET_AdminOverrides(req);

      const whereArg = vi.mocked(prisma.entitlementOverride.findMany).mock.calls[0][0]?.where;
      expect(whereArg.scope).toBe("USER");
    });

    it("filters by scopeId query param", async () => {
      vi.mocked(prisma.entitlementOverride.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.entitlementOverride.count).mockResolvedValue(0);

      const req = new NextRequest("http://localhost/api/admin/overrides?scopeId=org-42");
      await GET_AdminOverrides(req);

      const whereArg = vi.mocked(prisma.entitlementOverride.findMany).mock.calls[0][0]?.where;
      expect(whereArg.scopeId).toBe("org-42");
    });

    it("returns 200 with empty data when no overrides exist", async () => {
      vi.mocked(prisma.entitlementOverride.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.entitlementOverride.count).mockResolvedValue(0);

      const req = new NextRequest("http://localhost/api/admin/overrides");
      const res = await GET_AdminOverrides(req);
      const body = await json(res);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new NextRequest("http://localhost/api/admin/overrides");
      const res = await GET_AdminOverrides(req);
      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/admin/overrides
  // ────────────────────────────────────────────────────────

  describe("POST /api/admin/overrides", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 201 for ORG override with cache invalidation", async () => {
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue({
        id: "ovr-new",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "video-export",
        enabled: true,
        reason: "Testing override",
        expiresAt: null,
        limitValue: null,
      } as any);

      const mockGate = createMockGate();
      mockGate.invalidateCache.mockResolvedValue(undefined);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "video-export",
          enabled: true,
          reason: "Testing override",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(201);

      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");

      const body = await json(res);
      expect(body.data.scope).toBe("ORG");
      expect(body.data.reason).toBe("Testing override");
    });

    it("returns 201 for USER override without cache invalidation", async () => {
      vi.mocked(prisma.entitlementOverride.create).mockResolvedValue({
        id: "ovr-new",
        scope: "USER",
        scopeId: "user-1",
        featureKey: "beta-test",
        enabled: true,
        reason: "Beta access",
      } as any);

      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "USER",
          scopeId: "user-1",
          featureKey: "beta-test",
          enabled: true,
          reason: "Beta access",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(201);

      // Cache should NOT be invalidated for USER scope
      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });

    it("returns 400 when reason is missing", async () => {
      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "test",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.error).toBe("VALIDATION_ERROR");
      expect(body.details).toContain("reason");
    });

    it("returns 400 when reason is empty string", async () => {
      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "test",
          reason: "   ",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when scope/scopeId/featureKey are missing", async () => {
      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Testing" }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.details).toContain("scope");
    });

    it("returns 400 when scope is invalid", async () => {
      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "TEAM",
          scopeId: "team-1",
          featureKey: "test",
          reason: "Testing",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.details).toContain("ORG");
    });

    it("returns 409 when override already exists (P2002)", async () => {
      vi.mocked(prisma.entitlementOverride.create).mockRejectedValue({ code: "P2002" });

      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "video-export",
          enabled: true,
          reason: "Duplicate test",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(409);

      const body = await json(res);
      expect(body.error).toBe("CONFLICT");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new NextRequest("http://localhost/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "ORG",
          scopeId: "org-1",
          featureKey: "test",
          reason: "Testing",
        }),
      });
      const res = await POST_AdminOverrides(req);
      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────
  // DELETE /api/admin/overrides/[id]
  // ────────────────────────────────────────────────────────

  describe("DELETE /api/admin/overrides/[id]", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 and invalidates cache for ORG override", async () => {
      const mockGate = createMockGate();
      mockGate.invalidateCache.mockResolvedValue(undefined);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ovr-1",
        scope: "ORG",
        scopeId: "org-1",
        featureKey: "video-export",
        enabled: true,
        reason: "Test",
      } as any);
      vi.mocked(prisma.entitlementOverride.delete).mockResolvedValue({} as any);

      const req = new Request("http://localhost/api/admin/overrides/ovr-1", {
        method: "DELETE",
      });
      const params = Promise.resolve({ id: "ovr-1" });
      const res = await DELETE_AdminOverride(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.success).toBe(true);

      // Cache invalidation called for ORG scope
      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-1");
      expect(vi.mocked(prisma.entitlementOverride.delete)).toHaveBeenCalledWith({
        where: { id: "ovr-1" },
      });
    });

    it("returns 200 without cache invalidation for USER override", async () => {
      const mockGate = createMockGate();
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue({
        id: "ovr-2",
        scope: "USER",
        scopeId: "user-1",
        featureKey: "beta",
        enabled: true,
        reason: "Test",
      } as any);
      vi.mocked(prisma.entitlementOverride.delete).mockResolvedValue({} as any);

      const req = new Request("http://localhost/api/admin/overrides/ovr-2", {
        method: "DELETE",
      });
      const params = Promise.resolve({ id: "ovr-2" });
      const res = await DELETE_AdminOverride(req, { params });
      expect(res.status).toBe(200);

      expect(mockGate.invalidateCache).not.toHaveBeenCalled();
    });

    it("returns 404 when override is not found", async () => {
      vi.mocked(prisma.entitlementOverride.findUnique).mockResolvedValue(null);

      const req = new Request("http://localhost/api/admin/overrides/nonexistent", {
        method: "DELETE",
      });
      const params = Promise.resolve({ id: "nonexistent" });
      const res = await DELETE_AdminOverride(req, { params });
      expect(res.status).toBe(404);

      const body = await json(res);
      expect(body.error).toBe("NOT_FOUND");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new Request("http://localhost/api/admin/overrides/ovr-1", {
        method: "DELETE",
      });
      const params = Promise.resolve({ id: "ovr-1" });
      const res = await DELETE_AdminOverride(req, { params });
      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/admin/orgs/[orgId]/entitlements
  // ────────────────────────────────────────────────────────

  describe("GET /api/admin/orgs/[orgId]/entitlements", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with entitlements and usage for org", async () => {
      const mockGate = createMockGate();
      mockGate.getAllEntitlements.mockResolvedValue({
        planKey: "pro",
        features: { "video-export": true },
        limits: { "video-export": 10 },
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      // This route uses dynamic import("@/lib/prisma"), which will
      // return the mocked prisma module
      vi.mocked(prisma.usageTracking.findMany).mockResolvedValue([
        {
          featureKey: "video-export",
          usageCount: 5,
          periodEnd: new Date("2026-01-31"),
        } as any,
      ]);

      const req = new Request("http://localhost/api/admin/orgs/org-1/entitlements");
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await GET_AdminOrgEntitlements(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.planKey).toBe("pro");
      expect(body.usage["video-export"]).toBe(5);
      expect(body.resetAt["video-export"]).toBeTruthy();
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new Request("http://localhost/api/admin/orgs/org-1/entitlements");
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await GET_AdminOrgEntitlements(req, { params });
      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/admin/orgs/[orgId]/downgrade-preview
  // ────────────────────────────────────────────────────────

  describe("GET /api/admin/orgs/[orgId]/downgrade-preview", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with downgrade preview (default targetPlan=free)", async () => {
      const mockDowngrade = createMockDowngrade();
      mockDowngrade.previewDowngrade.mockResolvedValue({
        fromPlan: "pro",
        toPlan: "free",
        impactedFeatures: [],
        totalFeatures: 5,
        affectedCount: 0,
      });
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const req = new NextRequest("http://localhost/api/admin/orgs/org-1/downgrade-preview");
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await GET_AdminDowngradePreview(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data.fromPlan).toBe("pro");
      expect(body.data.toPlan).toBe("free");
      expect(body.data.totalFeatures).toBe(5);
    });

    it("returns 200 with custom targetPlan query param", async () => {
      const mockDowngrade = createMockDowngrade();
      mockDowngrade.previewDowngrade.mockResolvedValue({
        fromPlan: "pro",
        toPlan: "starter",
        impactedFeatures: [],
        totalFeatures: 5,
        affectedCount: 0,
      });
      vi.mocked(getDowngradeService).mockReturnValue(mockDowngrade);

      const req = new NextRequest(
        "http://localhost/api/admin/orgs/org-1/downgrade-preview?targetPlan=starter",
      );
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await GET_AdminDowngradePreview(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.data.toPlan).toBe("starter");

      expect(mockDowngrade.previewDowngrade).toHaveBeenCalledWith("org-1", "starter");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new NextRequest("http://localhost/api/admin/orgs/org-1/downgrade-preview");
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await GET_AdminDowngradePreview(req, { params });
      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /api/admin/cache/invalidate/[orgId]
  // ────────────────────────────────────────────────────────

  describe("POST /api/admin/cache/invalidate/[orgId]", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 and invalidates cache for org", async () => {
      const mockGate = createMockGate();
      mockGate.invalidateCache.mockResolvedValue(undefined);
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      const req = new Request("http://localhost/api/admin/cache/invalidate/org-42");
      const params = Promise.resolve({ orgId: "org-42" });
      const res = await POST_AdminCacheInvalidate(req, { params });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.orgId).toBe("org-42");

      expect(mockGate.invalidateCache).toHaveBeenCalledWith("org-42");
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(403);

      const req = new Request("http://localhost/api/admin/cache/invalidate/org-1");
      const params = Promise.resolve({ orgId: "org-1" });
      const res = await POST_AdminCacheInvalidate(req, { params });
      expect(res.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /api/debug/entitlements
  // ────────────────────────────────────────────────────────

  describe("GET /api/debug/entitlements", () => {
    beforeEach(() => {
      mockAdminAuthorized();
    });

    it("returns 200 with full debug trace", async () => {
      const mockGate = createMockGate();
      mockGate.getDebugTrace.mockResolvedValue({
        feature: "video-export",
        resolvedVia: "plan",
        value: true,
        planKey: "pro",
      });
      vi.mocked(getFeatureGateService).mockReturnValue(mockGate);

      // PrismaEntitlementRepository mock
      const mockRepo = createMockRepo();
      mockRepo.getActiveSubscription.mockResolvedValue({
        planKey: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2026-02-01"),
      });
      mockRepo.getFeature.mockResolvedValue({
        key: "video-export",
        type: "LIMIT",
        defaultConfig: null,
      });
      mockRepo.getOverridesForOrg.mockResolvedValue([
        { featureKey: "video-export", id: "ovr-1" },
        { featureKey: "other-feature", id: "ovr-2" },
      ]);
      mockRepo.getCurrentUsage.mockResolvedValue({
        usageCount: 3,
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-01-31"),
      });
      mockRepo.getAllPlans.mockResolvedValue([
        { id: "plan-1", key: "free", name: "Free" },
        { id: "plan-2", key: "pro", name: "Pro" },
      ]);
      mockRepo.getPlanFeature.mockResolvedValue({ enabled: true });
      vi.mocked(PrismaEntitlementRepository).mockImplementation(function () {
        return mockRepo as any;
      });

      const req = new NextRequest(
        "http://localhost/api/debug/entitlements?orgId=org-1&feature=video-export",
      );
      const res = await GET_DebugEntitlements(req);
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.trace.resolvedVia).toBe("plan");
      expect(body.subscription.planKey).toBe("pro");
      expect(body.feature.type).toBe("LIMIT");
      expect(body.feature.key).toBe("video-export");
      expect(body.orgOverrides).toHaveLength(1); // filtered to matching featureKey
      expect(body.usage.usageCount).toBe(3);
      expect(body.planAvailability).toEqual({ free: true, pro: true });
    });

    it("returns 400 when orgId or feature params are missing", async () => {
      const req = new NextRequest("http://localhost/api/debug/entitlements?orgId=org-1");
      const res = await GET_DebugEntitlements(req);
      expect(res.status).toBe(400);

      const body = await json(res);
      expect(body.error).toBe("VALIDATION_ERROR");
      expect(body.details).toContain("orgId");
    });

    it("returns 400 when both params are missing", async () => {
      const req = new NextRequest("http://localhost/api/debug/entitlements");
      const res = await GET_DebugEntitlements(req);
      expect(res.status).toBe(400);
    });

    it("returns 401/403 when requireAdmin fails", async () => {
      mockAdminUnauthorized(401);

      const req = new NextRequest(
        "http://localhost/api/debug/entitlements?orgId=org-1&feature=test",
      );
      const res = await GET_DebugEntitlements(req);
      expect(res.status).toBe(401);
    });
  });
});
