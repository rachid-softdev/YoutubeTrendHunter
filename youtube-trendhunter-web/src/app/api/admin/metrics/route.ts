// ============================================
// Admin: RED Metrics Snapshot
// GET /api/admin/metrics
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { metrics } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    return NextResponse.json({
      data: metrics.getStats(),
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as { status?: number; message?: string };
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Admin/Metrics] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
