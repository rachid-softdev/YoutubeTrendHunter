/**
 * PrismaEntitlementRepository integration tests — run against a real PostgreSQL.
 *
 * These tests validate that the raw SQL paths ($executeRawUnsafe, $queryRawUnsafe)
 * in PrismaEntitlementRepository execute correctly against PostgreSQL.
 *
 * SETUP:
 *   1. Create a PostgreSQL test database and run migrations:
 *      DATABASE_URL=postgresql://... npx prisma db push
 *   2. Set TEST_DATABASE_URL to point to the test database:
 *      $env:TEST_DATABASE_URL="postgresql://..."
 *   3. Run tests:
 *      pnpm test
 *
 * If TEST_DATABASE_URL is not set, these tests are skipped automatically.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaEntitlementRepository } from "@/lib/feature-flags/entitlement-repository";

// ─── Skip if no test database is configured ───
// Safety: require explicit TEST_DATABASE_URL (not DATABASE_URL) to avoid
// accidental runs against production.
const describeIf = process.env.TEST_DATABASE_URL ? describe : describe.skip;

// ─── Test IDs ───
const TEST_PREFIX = "inttest_";
const orgId = `${TEST_PREFIX}org_1`;
const userId = `${TEST_PREFIX}user_1`;
const featureKey = `${TEST_PREFIX}feature_pdf_export`;
const planKey = "free";
const eventId1 = `${TEST_PREFIX}evt_customer_created`;
const eventType1 = "customer.subscription.created";
const eventId2 = `${TEST_PREFIX}evt_invoice_paid`;

describeIf("PrismaEntitlementRepository Integration", () => {
  let prisma: PrismaClient;
  let repo: PrismaEntitlementRepository;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new PrismaEntitlementRepository(prisma);

    // Clean any leftover test data from previous runs
    await cleanTestData(prisma);

    // Seed minimal test data
    await prisma.organization.create({
      data: { id: orgId, name: "Test Org" },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: `${TEST_PREFIX}user@example.com`,
        name: "Test User",
        orgId,
      },
    });
    // Create a free plan + feature setup
    const plan = await prisma.plan.upsert({
      where: { key: planKey },
      update: {},
      create: {
        key: planKey,
        name: "Free",
        priceMonthly: 0,
        isActive: true,
        sortOrder: 0,
      },
    });
    const feature = await prisma.feature.upsert({
      where: { key: featureKey },
      update: {},
      create: {
        key: featureKey,
        name: "PDF Export",
        type: "LIMIT",
        isActive: true,
        defaultConfig: {},
      },
    });
    // Link plan + feature
    await prisma.planFeature.upsert({
      where: { planId_featureId: { planId: plan.id, featureId: feature.id } },
      update: { enabled: true, limitValue: 100 },
      create: {
        planId: plan.id,
        featureId: feature.id,
        enabled: true,
        limitValue: 100,
        downgradeStrategy: "GRACEFUL",
      },
    });

    // Create active subscription
    await prisma.subscription.create({
      data: {
        userId,
        orgId,
        planKey,
        plan: "FREE",
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Create a usage tracking period
    await prisma.usageTracking.create({
      data: {
        orgId,
        featureKey,
        usageCount: 5,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await prisma.$disconnect();
  });

  // ─── StripeEvent Idempotency ───

  describe("StripeEvent idempotency (real SQL path)", () => {
    it("should return false for unknown event", async () => {
      const result = await repo.hasStripeEventBeenProcessed("evt_nonexistent");
      expect(result).toBe(false);
    });

    it("should mark and detect a processed event", async () => {
      await repo.markStripeEventProcessed(eventId1, eventType1);
      const result = await repo.hasStripeEventBeenProcessed(eventId1);
      expect(result).toBe(true);
    });

    it("should be idempotent: marking the same event twice does not error", async () => {
      await repo.markStripeEventProcessed(eventId1, eventType1);
      await repo.markStripeEventProcessed(eventId1, eventType1); // second call, no error
      const result = await repo.hasStripeEventBeenProcessed(eventId1);
      expect(result).toBe(true);
    });

    it("should handle multiple distinct events independently", async () => {
      await repo.markStripeEventProcessed(eventId2, "invoice.payment_succeeded");
      expect(await repo.hasStripeEventBeenProcessed(eventId1)).toBe(true);
      expect(await repo.hasStripeEventBeenProcessed(eventId2)).toBe(true);
      expect(await repo.hasStripeEventBeenProcessed("evt_unrelated")).toBe(false);
    });
  });

  // ─── Usage Tracking (atomic SQL) ───

  describe("Usage tracking (atomic UPDATE ... RETURNING)", () => {
    it("should consume usage and return updated count", async () => {
      const result = await repo.consumeUsage(orgId, featureKey, 1);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.usageCount).toBeGreaterThanOrEqual(6);
    });

    it("should enforce TOCTOU guard via SQL WHERE clause", async () => {
      // The feature has limitValue=100 and current usage is ~6
      // Consume 200 which should exceed limit → repository returns null (TOCTOU)
      const result = await repo.consumeUsage(orgId, featureKey, 200, 100);
      expect(result).toBeNull();
    });

    it("should reject non-positive amounts", async () => {
      const result = await repo.consumeUsage(orgId, featureKey, 0);
      expect(result).toBeNull();

      const resultNeg = await repo.consumeUsage(orgId, featureKey, -1);
      expect(resultNeg).toBeNull();
    });

    it("should allow consumption within limits", async () => {
      // Current usage is ~6, limit is 100
      const result = await repo.consumeUsage(orgId, featureKey, 10, 100);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.usageCount).toBeGreaterThanOrEqual(16);
    });

    it("should create a new usage period if none exists", async () => {
      const newFeatureKey = `${TEST_PREFIX}feature_new_api`;
      // Ensure no usage for this feature
      const existing = await repo.getCurrentUsage(orgId, newFeatureKey);
      if (existing) {
        await prisma.usageTracking.delete({ where: { id: existing.id } });
      }

      const result = await repo.consumeUsage(orgId, newFeatureKey, 3);
      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      // Should have created a new period with usage = 3
      expect(result!.usageCount).toBe(3);
    });

    it("should handle concurrent consumption atomically", async () => {
      const usageFeatureKey = `${TEST_PREFIX}feature_concurrent`;
      // Pre-create a usage record so all calls hit the atomic UPDATE path
      const existing = await repo.getCurrentUsage(orgId, usageFeatureKey);
      if (!existing) {
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await repo.createUsage(orgId, usageFeatureKey, now, periodEnd);
      } else {
        await prisma.usageTracking.update({
          where: { id: existing.id },
          data: { usageCount: 0 },
        });
      }

      // Run multiple concurrent consumptions
      const results = await Promise.all([
        repo.consumeUsage(orgId, usageFeatureKey, 1),
        repo.consumeUsage(orgId, usageFeatureKey, 1),
        repo.consumeUsage(orgId, usageFeatureKey, 1),
        repo.consumeUsage(orgId, usageFeatureKey, 1),
        repo.consumeUsage(orgId, usageFeatureKey, 1),
      ]);

      const successes = results.filter((r) => r?.success).length;
      expect(successes).toBe(5);

      // Each concurrent call atomically incremented by 1
      const final = await repo.getCurrentUsage(orgId, usageFeatureKey);
      expect(final).not.toBeNull();
      expect(final!.usageCount).toBe(5);
    });
  });

  // ─── Full CRUD Lifecycle ───

  describe("Full CRUD lifecycle", () => {
    it("should get active subscription for org", async () => {
      const sub = await repo.getActiveSubscription(orgId);
      expect(sub).not.toBeNull();
      expect(sub!.orgId).toBe(orgId);
      expect(sub!.status).toBe("ACTIVE");
      expect(["FREE", "free"]).toContain(sub!.plan);
    });

    it("should get plan by key", async () => {
      const plan = await repo.getPlan(planKey);
      expect(plan).not.toBeNull();
      expect(plan!.key).toBe(planKey);
      expect(plan!.isActive).toBe(true);
    });

    it("should get feature by key", async () => {
      const feature = await repo.getFeature(featureKey);
      expect(feature).not.toBeNull();
      expect(feature!.key).toBe(featureKey);
      expect(feature!.isActive).toBe(true);
      expect(feature!.type).toBe("LIMIT");
    });

    it("should create, read, update, and delete an override", async () => {
      const overrideKey = `${TEST_PREFIX}feature_override_1`;

      // Create
      const created = await repo.createOverride({
        scope: "ORG",
        scopeId: orgId,
        featureKey: overrideKey,
        enabled: true,
        reason: "Integration test override",
        limitValue: 50,
      });
      expect(created).not.toBeNull();
      expect(created.enabled).toBe(true);
      expect(created.limitValue).toBe(50);

      // Read
      const read = await repo.getOverride("ORG", orgId, overrideKey);
      expect(read).not.toBeNull();
      expect(read!.enabled).toBe(true);

      // Update
      const updated = await repo.updateOverride(created.id, { enabled: false });
      expect(updated.enabled).toBe(false);

      // Delete
      await repo.deleteOverride(created.id);
      const deleted = await repo.getOverride("ORG", orgId, overrideKey);
      expect(deleted).toBeNull();
    });

    it("should track usage for a period", async () => {
      const usage = await repo.getCurrentUsage(orgId, featureKey);
      expect(usage).not.toBeNull();
      expect(usage!.orgId).toBe(orgId);
      expect(usage!.featureKey).toBe(featureKey);
      expect(usage!.usageCount).toBeGreaterThanOrEqual(6);
    });
  });
});

// ─── Helpers ───

async function cleanTestData(prisma: PrismaClient) {
  // Clean only test-prefixed data
  await prisma.$executeRawUnsafe(
    `DELETE FROM "UsageTracking" WHERE "orgId" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "StripeEvent" WHERE "eventId" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "EntitlementOverride" WHERE "scopeId" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Subscription" WHERE "orgId" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "PlanFeature" WHERE "planId" IN (SELECT id FROM "Plan" WHERE "key" = 'free')`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "User" WHERE "id" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Organization" WHERE "id" LIKE '${TEST_PREFIX}%'`,
  ).catch(() => {});
}
