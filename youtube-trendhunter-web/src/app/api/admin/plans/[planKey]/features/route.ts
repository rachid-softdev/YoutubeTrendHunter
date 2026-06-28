// ============================================
// Admin: Plan Features Management
// POST /api/admin/plans/:planKey/features  — attach feature to plan
// GET  /api/admin/plans/:planKey/features  — list plan features
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── GET /api/admin/plans/:planKey/features ───

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ planKey: string }> },
) {
  try {
    await requireAdmin();
    const { planKey } = await params;

    const plan = await prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) {
      return NextResponse.json({ error: "NOT_FOUND", details: "Plan not found" }, { status: 404 });
    }

    const planFeatures = await prisma.planFeature.findMany({
      where: { planId: plan.id },
      include: { feature: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: planFeatures });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/PlanFeatures] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// ─── POST /api/admin/plans/:planKey/features ───

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planKey: string }> },
) {
  try {
    await requireAdmin();
    const { planKey } = await params;
    const body = await req.json();

    const { featureKey, enabled, limitValue, configJson, downgradeStrategy, sortOrder } = body;

    if (!featureKey) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "featureKey is required" },
        { status: 400 },
      );
    }

    const plan = await prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) {
      return NextResponse.json({ error: "NOT_FOUND", details: "Plan not found" }, { status: 404 });
    }

    const feature = await prisma.feature.findUnique({ where: { key: featureKey } });
    if (!feature) {
      return NextResponse.json({ error: "NOT_FOUND", details: "Feature not found" }, { status: 404 });
    }

    // Upsert the plan-feature association
    const planFeature = await prisma.planFeature.upsert({
      where: {
        planId_featureId: { planId: plan.id, featureId: feature.id },
      },
      create: {
        planId: plan.id,
        featureId: feature.id,
        enabled: enabled ?? false,
        limitValue: limitValue ?? null,
        configJson: configJson ?? undefined,
        downgradeStrategy: downgradeStrategy ?? "GRACEFUL",
        sortOrder: sortOrder ?? 0,
      },
      update: {
        enabled: enabled ?? undefined,
        limitValue: limitValue ?? null,
        configJson: configJson ?? undefined,
        downgradeStrategy: downgradeStrategy ?? undefined,
        sortOrder: sortOrder ?? undefined,
      },
    });

    // Invalidate cache for all orgs on this plan
    log("info", "[Admin] Plan feature updated, cache will be invalidated on next read", {
      planKey,
      featureKey,
    });

    return NextResponse.json({ data: planFeature }, { status: 201 });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/PlanFeatures] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
