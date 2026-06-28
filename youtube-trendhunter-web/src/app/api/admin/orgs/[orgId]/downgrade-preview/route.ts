// ============================================
// Admin: Downgrade Preview
// GET /api/admin/orgs/:orgId/downgrade-preview?targetPlan=free
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDowngradeService } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    await requireAdmin();
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const targetPlan = searchParams.get("targetPlan") || "free";

    const downgradeService = getDowngradeService();
    const preview = await downgradeService.previewDowngrade(orgId, targetPlan);

    return NextResponse.json({ data: preview });
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    if (error.message === "UNAUTHORIZED" || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: error.status || 401 });
    }
    console.error("[Admin/DowngradePreview] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
