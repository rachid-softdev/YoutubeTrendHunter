// ============================================
// Admin: Get Org Entitlements
// GET /api/admin/orgs/:orgId/entitlements
// ============================================

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getFeatureGateService } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    await requireAdmin();
    const { orgId } = await params;

    const gate = getFeatureGateService();
    const entitlements = await gate.getAllEntitlements(orgId);

    // Also get usage for all limit features
    const { prisma } = await import("@/lib/prisma");
    const usage = await prisma.usageTracking.findMany({
      where: {
        orgId,
        periodEnd: { gte: new Date() },
      },
    });

    const usageMap: Record<string, number> = {};
    const resetMap: Record<string, string> = {};
    for (const u of usage) {
      usageMap[u.featureKey] = u.usageCount;
      resetMap[u.featureKey] = u.periodEnd.toISOString();
    }

    return NextResponse.json({
      ...entitlements,
      usage: usageMap,
      resetAt: resetMap,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/OrgEntitlements] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
