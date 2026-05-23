import { NextRequest, NextResponse } from "next/server";
import { processAllNiches } from "@/lib/trend-pipeline";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    log("warn", "Cron unauthorized attempt", { ip: req.headers.get("x-forwarded-for") });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    log("info", "Starting trend processing via cron");

    const results = await processAllNiches();

    const totalTrends = Object.values(results).reduce((sum, count) => sum + count, 0);
    const duration = Date.now() - startTime;

    log("info", "Trend processing completed", {
      results,
      totalTrends,
      durationMs: duration,
    });

    await prisma.auditLog
      .create({
        data: {
          userId: "system-cron",
          action: "CRON_TRENDS_PROCESSED",
          metadata: { results, totalTrends, durationMs: duration },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      results,
      totalTrends,
      durationMs: duration,
    });
  } catch (error) {
    log("error", "Trend processing cron failed", { error: String(error) });

    return NextResponse.json(
      {
        error: "Processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
