// ============================================
// GET /api/me/entitlements
// Returns current user's entitlements (cached 60s client-side)
// ============================================

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/lib/feature-flags";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // Get the user's organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    const orgId = user?.orgId;

    if (!orgId) {
      return NextResponse.json({
        plan: "FREE",
        planKey: "free",
        features: {},
        limits: {},
        usage: {},
        resetAt: {},
        experimentBuckets: {},
      });
    }

    const gate = getFeatureGateService();
    const entitlements = await gate.getAllEntitlements(orgId);

    // Get usage for all limit features
    const usageRecords = await prisma.usageTracking.findMany({
      where: {
        orgId,
        periodEnd: { gte: new Date() },
      },
    });

    const usage: Record<string, number> = {};
    const resetAt: Record<string, string | null> = {};
    for (const u of usageRecords) {
      usage[u.featureKey] = u.usageCount;
      resetAt[u.featureKey] = u.periodEnd.toISOString();
    }

    // Get experiment buckets (user-specific)
    const experimentBuckets: Record<string, boolean> = {};
    const features = await prisma.feature.findMany({
      where: { type: "EXPERIMENT", isActive: true },
    });
    for (const feat of features) {
      experimentBuckets[feat.key] = await gate.isInExperiment(userId, feat.key);
    }

    const sub = await prisma.subscription.findFirst({
      where: { orgId, status: { in: ["ACTIVE", "TRIALING"] } },
    });

    const data = {
      plan: sub?.plan ?? "FREE",
      planKey: entitlements.planKey,
      features: entitlements.features,
      limits: entitlements.limits,
      usage,
      resetAt,
      experimentBuckets,
    };

    log("info", "[Me/Entitlements] Fetched", {
      userId,
      orgId,
      planKey: entitlements.planKey,
    });

    // Cache on client for 60 seconds
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=60, s-maxage=0",
      },
    });
  } catch (error) {
    console.error("[Me/Entitlements] Error:", error);
    return NextResponse.json({ error: "Erreur interne", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
