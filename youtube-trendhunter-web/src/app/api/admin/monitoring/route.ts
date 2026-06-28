// ============================================
// Admin: Monitoring Dashboard JSON
// GET /api/admin/monitoring
//
// Enriched with RED metrics, job queue status,
// and cache statistics.
// ============================================

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { metrics } from "@/lib/observability";
import { countJobsByStatus } from "@/lib/services/job.service";
import redis from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const enriched = metrics.getEnrichedStats();

    // Gather job queue metrics (best-effort, non-blocking)
    let jobQueue = { pending: 0, processing: 0, completed: 0, failed: 0 };
    try {
      jobQueue = await countJobsByStatus();
    } catch {
      // Non-critical — silently degrade
    }

    // Gather Redis cache stats (best-effort)
    let cacheSize = 0;
    try {
      // Approximate number of keys cached by the application
      const scanResult = await redis.scan(0, { match: "cache:*", count: 10000 });
      cacheSize = Array.isArray(scanResult[1]) ? (scanResult[1] as string[]).length : 0;
    } catch {
      // Non-critical — silently degrade
    }

    return NextResponse.json({
      ...enriched,
      jobQueue,
      cache: {
        approximateKeyCount: cacheSize,
      },
      collectedAt: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as { status?: number; message?: string };
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Admin/Monitoring] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
