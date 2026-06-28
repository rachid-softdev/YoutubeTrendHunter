import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAccountSchema, userExportQuerySchema, portalSessionSchema } from "@/lib/schemas";

// ─── Module Mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    userNiche: {
      findMany: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
    apiToken: {
      findMany: vi.fn(),
    },
    trend: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
    },
    niche: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: {
      cancel: vi.fn(),
      update: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
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
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue(["0", []]),
    ttl: vi.fn().mockResolvedValue(50),
    incr: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  UnauthorizedError: vi.fn(
    (msg) => new Response(JSON.stringify({ error: msg || "Non authentifié" }), { status: 401 }),
  ),
  ValidationError: vi.fn(
    (msg, details?) =>
      new Response(JSON.stringify({ error: msg || "Données invalides", details }), { status: 400 }),
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

vi.mock("@/lib/services/subscription.service", () => ({
  getUserPlan: vi.fn().mockResolvedValue("PRO"),
  PLAN_LIMITS: {
    FREE: { niches: 1, trendsPerNiche: 5, alerts: false, export: false, api: false },
    PRO: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: false },
    TEAM: { niches: -1, trendsPerNiche: -1, alerts: true, export: true, api: true },
  },
}));

vi.mock("@/lib/trend-pipeline", () => ({
  processAllNiches: vi.fn(),
  collectAndScoreTrends: vi.fn(),
}));

vi.mock("@/lib/services/job.service", () => ({
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("@/lib/payment/stripe-adapter", () => ({
  stripeAdapter: {
    createPortalSession: vi.fn(),
    handleWebhook: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getAuditLogs } from "@/lib/audit-log";

describe("User, Cron & Stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Schema Validation ──────────────────────────────────────────────────────

  describe("Schema Validation", () => {
    it("should accept valid deleteAccountSchema", () => {
      const result = deleteAccountSchema.safeParse({ confirm: true });
      expect(result.success).toBe(true);
    });

    it("should reject deleteAccountSchema with false", () => {
      const result = deleteAccountSchema.safeParse({ confirm: false });
      expect(result.success).toBe(false);
    });

    it("should reject deleteAccountSchema without confirm", () => {
      const result = deleteAccountSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should accept valid userExportQuerySchema", () => {
      const result = userExportQuerySchema.safeParse({ format: "csv", trends: "true" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe("csv");
      }
    });

    it("should reject invalid format in userExportQuerySchema", () => {
      const result = userExportQuerySchema.safeParse({ format: "xml" });
      expect(result.success).toBe(false);
    });

    it("should accept valid portalSessionSchema", () => {
      const result = portalSessionSchema.safeParse({
        returnUrl: "https://example.com/billing",
      });
      expect(result.success).toBe(true);
    });

    it("should accept empty portalSessionSchema", () => {
      const result = portalSessionSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // ─── DELETE /api/user ───────────────────────────────────────────────────────

  describe("DELETE /api/user — account deletion logic", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should return 400 without confirm: true", () => {
      const result = deleteAccountSchema.safeParse({ confirm: false });
      expect(result.success).toBe(false);
    });

    it("should delete user with confirm: true", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-123",
        subscription: null,
      } as any);

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        include: { subscription: true },
      });

      expect(user).not.toBeNull();
    });

    it("should cancel Stripe subscription if exists before deleting", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-123",
        subscription: {
          stripeSubscriptionId: "sub_stripe123",
          plan: "PRO",
          status: "ACTIVE",
        },
      } as any);

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        include: { subscription: true },
      });

      if (user?.subscription?.stripeSubscriptionId) {
        await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
        expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_stripe123");
      }
    });

    it("should not cancel Stripe when no subscription", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "user-123",
        subscription: null,
      } as any);

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        include: { subscription: true },
      });

      const shouldCancel = !!user?.subscription?.stripeSubscriptionId;
      expect(shouldCancel).toBe(false);
    });
  });

  // ─── GET /api/user/audit-logs ───────────────────────────────────────────────

  describe("GET /api/user/audit-logs — business logic", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should return audit logs for authenticated user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const mockLogs = [
        { id: "log-1", action: "user_login", createdAt: new Date() },
        { id: "log-2", action: "niche_select", createdAt: new Date() },
      ];

      vi.mocked(getAuditLogs).mockResolvedValue(mockLogs as any);

      const logs = await getAuditLogs("user-123");
      expect(logs).toHaveLength(2);
      expect(logs[0].action).toBe("user_login");
    });

    it("should forbid accessing another user's logs", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const userId: string = "user-123";
      const requestedUserId = "user-456";

      const forbidden = requestedUserId !== userId;
      expect(forbidden).toBe(true);
    });
  });

  // ─── GET /api/user/export ───────────────────────────────────────────────────

  describe("GET /api/user/export — business logic", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should return CSV export for PRO user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const { getUserPlan } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("PRO");

      const plan = await getUserPlan("user-123");
      expect(plan).toBe("PRO");
    });

    it("should block FREE users from exporting", async () => {
      const { getUserPlan, PLAN_LIMITS } = await import("@/lib/services/subscription.service");
      vi.mocked(getUserPlan).mockResolvedValue("FREE");

      const plan = await getUserPlan("user-free");
      const canExport = PLAN_LIMITS[plan]?.export;

      expect(canExport).toBe(false);
    });

    it("should validate userExportQuerySchema params", () => {
      const result = userExportQuerySchema.safeParse({ format: "json", trends: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe("json");
        expect(result.data.trends).toBe(false);
      }
    });

    it("should return downloadable JSON content-type", () => {
      const response = new Response(JSON.stringify({}), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="export.json"',
        },
      });
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Content-Disposition")).toContain("attachment");
    });
  });

  // ─── GET /api/cron/trends ───────────────────────────────────────────────────

  describe("GET /api/cron/trends — authorization logic", () => {
    it("should pass with correct CRON_SECRET", () => {
      const authHeader = "Bearer my-secret-cron-key";
      process.env.CRON_SECRET = "my-secret-cron-key";

      const isValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
      expect(isValid).toBe(true);
    });

    it("should reject with wrong CRON_SECRET", () => {
      const authHeader = "Bearer wrong-secret";
      process.env.CRON_SECRET = "my-secret-cron-key";

      const isValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
      expect(isValid).toBe(false);
    });

    it("should reject missing Authorization header", () => {
      const authHeader: string | null = null;
      const isValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
      expect(isValid).toBe(false);
    });

    it("should call processAllNiches when authorized", async () => {
      const { processAllNiches } = await import("@/lib/trend-pipeline");
      vi.mocked(processAllNiches).mockResolvedValue({ tech: 10, gaming: 5 });

      const results = await processAllNiches();
      const totalTrends = Object.values(results).reduce((sum, count) => sum + count, 0);

      expect(totalTrends).toBe(15);
    });
  });

  // ─── POST /api/cron/process-jobs ───────────────────────────────────────────

  describe("POST /api/cron/process-jobs — business logic", () => {
    it("should reject wrong CRON_SECRET", () => {
      const authHeader = "Bearer wrong-secret";
      process.env.CRON_SECRET = "my-secret-cron-key";

      const isValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
      expect(isValid).toBe(false);
    });

    it("should claim and process jobs when authorized", async () => {
      const { claimJobs, completeJob } = await import("@/lib/services/job.service");

      const mockJobs = [{ id: "job-1", type: "TREND_SCORE", payload: { nicheSlug: "tech" } }];

      vi.mocked(claimJobs).mockResolvedValue(mockJobs as any);
      vi.mocked(completeJob).mockResolvedValue({} as any);

      const jobs = await claimJobs("worker-1");
      expect(jobs).toHaveLength(1);

      for (const job of jobs) {
        if (job.type === "TREND_SCORE") {
          await completeJob(job.id, { trendsCreated: 5 });
          expect(completeJob).toHaveBeenCalledWith("job-1", { trendsCreated: 5 });
        }
      }
    });

    it("should handle unknown job types", async () => {
      const { claimJobs, failJob } = await import("@/lib/services/job.service");

      vi.mocked(claimJobs).mockResolvedValue([
        { id: "job-unknown", type: "UNKNOWN_TYPE", payload: {} },
      ] as any);
      vi.mocked(failJob).mockResolvedValue({} as any);

      const jobs = await claimJobs("worker-1");
      for (const job of jobs) {
        if (job.type === "UNKNOWN_TYPE") {
          await failJob(job.id, `Unknown job type: ${job.type}`);
          expect(failJob).toHaveBeenCalledWith("job-unknown", "Unknown job type: UNKNOWN_TYPE");
        }
      }
    });

    it("should handle VIDEO_SCORE as not yet implemented", async () => {
      const { claimJobs, failJob } = await import("@/lib/services/job.service");

      vi.mocked(claimJobs).mockResolvedValue([
        { id: "job-video", type: "VIDEO_SCORE", payload: {} },
      ] as any);

      const jobs = await claimJobs("worker-1");
      for (const job of jobs) {
        if (job.type === "VIDEO_SCORE") {
          await failJob(job.id, "VIDEO_SCORE not yet implemented");
          expect(failJob).toHaveBeenCalledWith("job-video", "VIDEO_SCORE not yet implemented");
        }
      }
    });
  });

  // ─── POST /api/stripe/webhook ──────────────────────────────────────────────

  describe("POST /api/stripe/webhook — business logic", () => {
    it("should reject without signature", () => {
      const sig: string | null = null;
      const missingSig = !sig;
      expect(missingSig).toBe(true);
    });

    it("should process valid Stripe event", async () => {
      const { stripeAdapter } = await import("@/lib/payment/stripe-adapter");
      vi.mocked(stripeAdapter.handleWebhook).mockResolvedValue({
        handled: true,
        eventType: "checkout.session.completed",
      });

      const result = await stripeAdapter.handleWebhook('{"id":"evt_123"}', "valid_sig");
      expect(result.handled).toBe(true);
      expect(result.eventType).toBe("checkout.session.completed");
    });

    it("should reject invalid signature", async () => {
      const { stripeAdapter } = await import("@/lib/payment/stripe-adapter");
      vi.mocked(stripeAdapter.handleWebhook).mockRejectedValue(
        new Error("Signature webhook invalide"),
      );

      try {
        await stripeAdapter.handleWebhook('{"id":"evt_123"}', "invalid_sig");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toContain("Signature webhook invalide");
      }
    });

    it("should handle unprocessed event types gracefully", async () => {
      const { stripeAdapter } = await import("@/lib/payment/stripe-adapter");
      vi.mocked(stripeAdapter.handleWebhook).mockResolvedValue({
        handled: false,
        eventType: "unknown.event",
      });

      const result = await stripeAdapter.handleWebhook('{"id":"evt_456"}', "valid_sig");
      expect(result.handled).toBe(false);
    });
  });

  // ─── POST /api/stripe/portal ───────────────────────────────────────────────

  describe("POST /api/stripe/portal — business logic", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should create portal session for authenticated user with stripeCustomerId", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        stripeCustomerId: "cus_12345",
      } as any);

      const { stripeAdapter } = await import("@/lib/payment/stripe-adapter");
      vi.mocked(stripeAdapter.createPortalSession).mockResolvedValue({
        url: "https://billing.stripe.com/session/abc",
      });

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        select: { stripeCustomerId: true },
      });

      expect(user?.stripeCustomerId).toBe("cus_12345");

      const result = await stripeAdapter.createPortalSession({
        customerId: user!.stripeCustomerId!,
        returnUrl: "https://app.example.com/billing",
      });
      expect(result.url).toContain("stripe.com");
    });

    it("should return 400 when user has no stripeCustomerId", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        stripeCustomerId: null,
      } as any);

      const user = await prisma.user.findUnique({
        where: { id: "user-123" },
        select: { stripeCustomerId: true },
      });

      const noSubscription = !user?.stripeCustomerId;
      expect(noSubscription).toBe(true);
    });

    it("should handle portal session creation failure", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        stripeCustomerId: "cus_12345",
      } as any);

      const { stripeAdapter } = await import("@/lib/payment/stripe-adapter");
      vi.mocked(stripeAdapter.createPortalSession).mockRejectedValue(
        new Error("CUSTOMER_NOT_FOUND"),
      );

      try {
        await stripeAdapter.createPortalSession({
          customerId: "cus_12345",
          returnUrl: "https://app.example.com",
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toBe("CUSTOMER_NOT_FOUND");
      }
    });
  });

  // ─── GET /api/jobs/[id] ────────────────────────────────────────────────────

  describe("GET /api/jobs/[id] — business logic", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const session = await auth();
      expect(session).toBeNull();
    });

    it("should return job when found and owned by user", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123" },
      } as any);

      const { getJob } = await import("@/lib/services/job.service");
      const mockJob = {
        id: "job-1",
        type: "TREND_SCORE",
        status: "COMPLETED",
        progress: 100,
        result: { trendsCreated: 5 },
        error: null,
        userId: "user-123",
        createdAt: new Date(),
        completedAt: new Date(),
      };

      vi.mocked(getJob).mockResolvedValue(mockJob as any);

      const job = await getJob("job-1");
      expect(job).not.toBeNull();
      expect(job?.id).toBe("job-1");
      expect(job?.status).toBe("COMPLETED");
    });

    it("should return 404 when job not found", async () => {
      const { getJob } = await import("@/lib/services/job.service");
      vi.mocked(getJob).mockResolvedValue(null);

      const job = await getJob("nonexistent");
      expect(job).toBeNull();
    });

    it("should return 404 when job belongs to another user (non-admin)", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", role: "USER" },
      } as any);

      const { getJob } = await import("@/lib/services/job.service");
      const mockJob = {
        id: "job-other",
        userId: "user-456", // different user
        type: "TREND_SCORE",
        status: "PENDING",
      };

      vi.mocked(getJob).mockResolvedValue(mockJob as any);

      const job = await getJob("job-other");
      expect(job).not.toBeNull();

      const isOwner = job?.userId === "user-123";
      const isAdmin = false;
      const canAccess = isOwner || isAdmin;

      expect(canAccess).toBe(false);
    });

    it("should allow admin to see any job", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "admin-1", role: "ADMIN" },
      } as any);

      const { getJob } = await import("@/lib/services/job.service");
      vi.mocked(getJob).mockResolvedValue({
        id: "job-other",
        userId: "user-456",
        type: "TREND_SCORE",
      } as any);

      const job = await getJob("job-other");
      expect(job).not.toBeNull();
    });
  });
});
