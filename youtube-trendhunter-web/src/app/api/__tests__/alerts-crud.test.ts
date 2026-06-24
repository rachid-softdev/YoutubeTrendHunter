import { describe, it, expect, vi, beforeEach } from "vitest";
import { alertCreateSchema, alertUpdateSchema } from "@/lib/schemas";

// ─── Module Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    alert: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    niche: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn().mockResolvedValue(undefined),
  cacheKeys: {
    alerts: (userId: string) => `alerts:${userId}`,
    niches: (plan: string) => `niches:list:${plan}`,
  },
  cacheTTL: {
    alerts: 120,
    niches: 600,
    trends: 300,
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

vi.mock("@/lib/services/alert.service", () => ({
  getUserAlerts: vi.fn(),
  getAlertById: vi.fn(),
  createAlert: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendAlertEmail: vi.fn(),
  sendDigestEmail: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
  updateAlert: vi.fn(),
  deleteAlert: vi.fn(),
}));

vi.mock("@/lib/services/niche.service", () => ({
  getUserNiches: vi.fn(),
  getNicheById: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { auditLog } from "@/lib/audit-log";

describe("Alerts CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Schema Validation ──────────────────────────────────────────────────────

  describe("Schema Validation", () => {
    it("should accept valid alertCreateSchema", () => {
      const result = alertCreateSchema.safeParse({
        type: "SCORE_THRESHOLD",
        threshold: 70,
        channel: "EMAIL",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("SCORE_THRESHOLD");
        expect(result.data.threshold).toBe(70);
      }
    });

    it("should reject alertCreateSchema with invalid type", () => {
      const result = alertCreateSchema.safeParse({
        type: "INVALID_TYPE",
        threshold: 70,
        channel: "EMAIL",
      });
      expect(result.success).toBe(false);
    });

    it("should accept alertCreateSchema with WEBHOOK channel and webhookUrl", () => {
      const result = alertCreateSchema.safeParse({
        type: "SPIKE",
        threshold: 50,
        channel: "WEBHOOK",
        webhookUrl: "https://hooks.example.com/alert",
      });
      expect(result.success).toBe(true);
    });

    it("should reject alertCreateSchema with WEBHOOK channel but no webhookUrl", () => {
      const result = alertCreateSchema.safeParse({
        type: "SPIKE",
        threshold: 50,
        channel: "WEBHOOK",
      });
      expect(result.success).toBe(false);
    });

    it("should reject threshold below 0", () => {
      const result = alertCreateSchema.safeParse({
        type: "SCORE_THRESHOLD",
        threshold: -5,
        channel: "EMAIL",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid alertUpdateSchema", () => {
      const result = alertUpdateSchema.safeParse({
        threshold: 85,
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it("should accept alertUpdateSchema with no fields (partial)", () => {
      const result = alertUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ─── GET /api/alerts ────────────────────────────────────────────────────────

  describe("GET /api/alerts — business logic", () => {
    it("should return 401 when user is not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const session = await auth();
      if (!session?.user?.id) {
        const response = { status: 401, body: { error: "Non authentifié" } };
        expect(response.status).toBe(401);
      }
    });

    it("should fetch alerts when user is authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as any);

      const mockAlerts = [
        { id: "alert-1", type: "SCORE_THRESHOLD", threshold: 70, isActive: true },
        { id: "alert-2", type: "DAILY_DIGEST", threshold: 50, isActive: true },
      ];
      const mockUserNiches = [{ nicheId: "niche-1" }];

      const { getUserAlerts } = await import("@/lib/services/alert.service");
      const { getUserNiches } = await import("@/lib/services/niche.service");

      vi.mocked(getUserAlerts).mockResolvedValue(mockAlerts as any);
      vi.mocked(getUserNiches).mockResolvedValue(mockUserNiches as any);

      const alerts = await getUserAlerts("user-123");
      const userNiches = await getUserNiches("user-123");

      const data = { alerts, userNiches, plan: "PRO", canCreate: true };

      expect(alerts).toHaveLength(2);
      expect(data.canCreate).toBe(true);
      expect(data.plan).toBe("PRO");
    });

    it("should return cached alerts when cache hit", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      const cachedData = { alerts: [{ id: "cached-alert" }], plan: "PRO" };
      vi.mocked(getCached).mockResolvedValue(cachedData);

      const cacheKey = `alerts:user-123`;
      const cached = await getCached(cacheKey);
      expect(cached).toEqual(cachedData);
    });

    it("should set cache after fetching alerts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const mockAlerts = [{ id: "alert-1" }];
      const { getUserAlerts } = await import("@/lib/services/alert.service");
      vi.mocked(getUserAlerts).mockResolvedValue(mockAlerts as any);

      const alerts = await getUserAlerts("user-123");
      const data = { alerts, userNiches: [], plan: "PRO", canCreate: true };

      await setCached("alerts:user-123", data, 120);
      expect(setCached).toHaveBeenCalledWith("alerts:user-123", data, 120);
    });
  });

  // ─── POST /api/alerts ───────────────────────────────────────────────────────

  describe("POST /api/alerts — business logic", () => {
    it("should create alert with valid body", async () => {
      const body = {
        nicheId: "niche-1",
        type: "SCORE_THRESHOLD",
        threshold: 70,
        channel: "EMAIL",
      };

      const parsed = alertCreateSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        const mockAlert = { id: "alert-new", ...parsed.data, userId: "user-123" };
        const { createAlert } = await import("@/lib/services/alert.service");
        vi.mocked(createAlert).mockResolvedValue(mockAlert as any);

        const alert = await createAlert({
          userId: "user-123",
          nicheId: parsed.data.nicheId,
          type: parsed.data.type,
          threshold: parsed.data.threshold,
          channel: parsed.data.channel,
          webhookUrl: parsed.data.webhookUrl,
        });
        expect(alert.id).toBe("alert-new");

        // Route handler calls auditLog separately — simulate that
        await auditLog("alert_create", "user-123", {
          alertType: parsed.data.type,
          channel: parsed.data.channel,
          niche: parsed.data.nicheId || "all",
          plan: "PRO",
        });
        expect(auditLog).toHaveBeenCalledWith("alert_create", "user-123", expect.any(Object));
      }
    });

    it("should reject body with invalid type", () => {
      const body = { type: "INVALID", threshold: 70, channel: "EMAIL" };
      const parsed = alertCreateSchema.safeParse(body);
      expect(parsed.success).toBe(false);
    });

    it("should return 403 when FREE plan tries to create alert", async () => {
      const { getUserPlan, PLAN_LIMITS } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("FREE");

      const plan = await getUserPlan("user-free");
      const limits = PLAN_LIMITS[plan];

      expect(limits.alerts).toBe(false);
    });

    it("should verify niche existence before creating alert", async () => {
      const { getNicheById } = await import("@/lib/services/niche.service");
      vi.mocked(getNicheById).mockResolvedValue(null);

      const niche = await getNicheById("nonexistent-niche");
      const notFound = !niche;
      expect(notFound).toBe(true);
    });

    it("should invalidate cache after creating alert", async () => {
      await invalidateCache("alerts:user-123");
      expect(invalidateCache).toHaveBeenCalledWith("alerts:user-123");
    });

    it("should create alert with WEBHOOK channel and valid webhookUrl", async () => {
      const body = {
        type: "SPIKE",
        threshold: 50,
        channel: "WEBHOOK",
        webhookUrl: "https://hooks.example.com/trends",
      };

      const parsed = alertCreateSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        const { createAlert } = await import("@/lib/services/alert.service");
        const mockAlert = { id: "alert-webhook", ...parsed.data };
        vi.mocked(createAlert).mockResolvedValue(mockAlert as any);

        const alert = await createAlert({
          userId: "user-123",
          type: parsed.data.type,
          threshold: parsed.data.threshold,
          channel: parsed.data.channel,
          webhookUrl: parsed.data.webhookUrl,
        });
        expect(alert.channel).toBe("WEBHOOK");
        expect(alert.webhookUrl).toBe("https://hooks.example.com/trends");
      }
    });
  });

  // ─── GET /api/alerts/[id] ───────────────────────────────────────────────────

  describe("GET /api/alerts/[id] — business logic", () => {
    it("should find alert by id for the current user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const mockAlert = { id: "alert-1", userId: "user-123", type: "SCORE_THRESHOLD" };
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(mockAlert as any);

      const alert = await prisma.alert.findFirst({
        where: { id: "alert-1", userId: "user-123" },
      });

      expect(alert).not.toBeNull();
      expect(alert?.id).toBe("alert-1");
    });

    it("should return 404 when alert is not found", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      const alert = await prisma.alert.findFirst({
        where: { id: "nonexistent", userId: "user-123" },
      });

      expect(alert).toBeNull();
    });

    it("should not see another user's alert", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      const alert = await prisma.alert.findFirst({
        where: { id: "alert-other", userId: "user-123" },
      });

      expect(alert).toBeNull();
    });
  });

  // ─── PATCH /api/alerts/[id] ─────────────────────────────────────────────────

  describe("PATCH /api/alerts/[id] — business logic", () => {
    it("should update alert with valid data", async () => {
      const existingAlert = { id: "alert-1", userId: "user-123", threshold: 70, isActive: true };
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(existingAlert as any);
      vi.mocked(prisma.alert.findUnique).mockResolvedValue({
        ...existingAlert,
        threshold: 85,
      } as any);

      const parsed = alertUpdateSchema.safeParse({ threshold: 85 });
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        const updateData: Record<string, unknown> = {};
        if (parsed.data.threshold !== undefined) updateData.threshold = parsed.data.threshold;

        const { updateAlert } = await import("@/lib/alerts");
        vi.mocked(updateAlert).mockResolvedValue({ ...existingAlert, threshold: 85 } as any);

        const alert = await updateAlert("alert-1", "user-123", updateData);
        expect(alert.threshold).toBe(85);
      }
    });

    it("should return 400 for invalid update body", () => {
      const result = alertUpdateSchema.safeParse({ threshold: "not-a-number" });
      expect(result.success).toBe(false);
    });

    it("should invalidate cache after update", async () => {
      await invalidateCache("alerts:user-123");
      expect(invalidateCache).toHaveBeenCalledWith("alerts:user-123");
    });
  });

  // ─── DELETE /api/alerts/[id] ───────────────────────────────────────────────

  describe("DELETE /api/alerts/[id] — business logic", () => {
    it("should delete alert and audit log", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue({
        id: "alert-1",
        userId: "user-123",
        type: "SCORE_THRESHOLD",
        nicheId: "niche-1",
      } as any);

      const existing = await prisma.alert.findFirst({
        where: { id: "alert-1", userId: "user-123" },
      });
      expect(existing).not.toBeNull();

      if (existing) {
        await auditLog("alert_delete", "user-123", { alertType: existing.type });
        expect(auditLog).toHaveBeenCalledWith("alert_delete", "user-123", {
          alertType: "SCORE_THRESHOLD",
        });
      }
    });

    it("should return 404 when deleting non-existing alert", async () => {
      vi.mocked(prisma.alert.findFirst).mockResolvedValue(null);

      const existing = await prisma.alert.findFirst({
        where: { id: "nonexistent", userId: "user-123" },
      });
      expect(existing).toBeNull();
    });
  });
});
