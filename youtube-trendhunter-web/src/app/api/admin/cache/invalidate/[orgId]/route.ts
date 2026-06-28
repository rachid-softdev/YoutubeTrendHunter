// ============================================
// Admin: Cache Invalidation
// POST /api/admin/cache/invalidate/:orgId
// ============================================

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getFeatureGateService } from "@/lib/feature-flags";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    await requireAdmin();
    const { orgId } = await params;

    const gate = getFeatureGateService();
    await gate.invalidateCache(orgId);

    log("info", "[Admin] Cache invalidated", { orgId });

    return NextResponse.json({ success: true, orgId });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/Cache] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
