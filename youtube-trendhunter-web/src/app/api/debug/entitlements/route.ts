// ============================================
// Debug Entitlements
// GET /api/debug/entitlements?orgId=X&feature=Y
// Admin only — returns full DebugTrace
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getFeatureGateService } from "@/lib/feature-flags";
import { PrismaEntitlementRepository } from "@/lib/feature-flags";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const feature = searchParams.get("feature");

    if (!orgId || !feature) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "orgId and feature query params required" },
        { status: 400 },
      );
    }

    const gate = getFeatureGateService();

    // Get debug trace
    const trace = await gate.getDebugTrace(orgId, feature);

    // Get additional context
    const repo = new PrismaEntitlementRepository();
    const sub = await repo.getActiveSubscription(orgId);
    const featureRecord = await repo.getFeature(feature);
    const orgOverrides = await repo.getOverridesForOrg(orgId);
    const usage = await repo.getCurrentUsage(orgId, feature);
    const allPlans = await repo.getAllPlans();

    // Find which plans have this feature enabled
    const planAvailability: Record<string, boolean> = {};
    for (const plan of allPlans) {
      const pf = await repo.getPlanFeature(plan.id, feature);
      planAvailability[plan.key] = pf?.enabled ?? false;
    }

    log("info", "[Debug] Entitlement trace requested", {
      orgId,
      feature,
      resolvedVia: trace.resolvedVia,
    });

    return NextResponse.json({
      trace,
      subscription: sub
        ? {
            planKey: sub.planKey,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
          }
        : null,
      feature: featureRecord
        ? {
            key: featureRecord.key,
            type: featureRecord.type,
            defaultConfig: featureRecord.defaultConfig,
          }
        : null,
      orgOverrides: orgOverrides.filter((o) => o.featureKey === feature),
      usage: usage
        ? {
            usageCount: usage.usageCount,
            periodStart: usage.periodStart.toISOString(),
            periodEnd: usage.periodEnd.toISOString(),
          }
        : null,
      planAvailability,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Debug/Entitlements] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
