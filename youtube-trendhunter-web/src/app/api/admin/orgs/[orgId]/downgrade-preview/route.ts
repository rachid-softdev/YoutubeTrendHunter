// ============================================
// Admin: Downgrade Preview
// GET /api/admin/orgs/:orgId/downgrade-preview?targetPlan=free
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDowngradeService } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    await requireAdmin();
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const targetPlan = searchParams.get("targetPlan") || "free";

    const downgradeService = getDowngradeService();
    const preview = await downgradeService.previewDowngrade(orgId, targetPlan);

    return NextResponse.json({ data: preview });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/DowngradePreview] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
