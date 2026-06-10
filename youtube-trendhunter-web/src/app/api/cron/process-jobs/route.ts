import { NextRequest, NextResponse } from "next/server";
import { claimJobs, completeJob, failJob } from "@/lib/services/job.service";
import { collectAndScoreTrends } from "@/lib/trend-pipeline";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { acquireLock, releaseLock } from "@/lib/redis";

export const dynamic = "force-dynamic";
const WORKER_ID = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    log("warn", "Process-jobs cron unauthorized attempt", {
      ip: req.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Distributed lock to prevent concurrent cron runs (e.g., retries or overlap)
  const lockKey = "cron:process-jobs";
  const acquired = await acquireLock(lockKey, 300);
  if (!acquired) {
    log("warn", "Process-jobs cron skipped: another worker holds the lock");
    return NextResponse.json({ success: true, skipped: true, reason: "lock held" });
  }

  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  try {
    const jobs = await claimJobs(WORKER_ID);

    for (const job of jobs) {
      try {
        if (job.type === "TREND_SCORE") {
          const payload = job.payload as { nicheSlug?: string; nicheId?: string };
          let nicheId = payload.nicheId;

          if (!nicheId && payload.nicheSlug) {
            const niche = await prisma.niche.findUnique({
              where: { slug: payload.nicheSlug },
            });
            nicheId = niche?.id;
          }

          if (!nicheId) {
            await failJob(job.id, "Niche introuvable");
            failed++;
            continue;
          }

          const niche = await prisma.niche.findUnique({ where: { id: nicheId } });
          if (!niche) {
            await failJob(job.id, "Niche introuvable");
            failed++;
            continue;
          }

          const trendsCreated = await collectAndScoreTrends(niche);
          await completeJob(job.id, {
            trendsCreated,
            nicheSlug: niche.slug,
            completedAt: new Date().toISOString(),
          });
          processed++;
        } else if (job.type === "VIDEO_SCORE") {
          await failJob(job.id, "VIDEO_SCORE not yet implemented");
          failed++;
        } else {
          await failJob(job.id, `Unknown job type: ${job.type}`);
          failed++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log("error", "Job processing failed", { jobId: job.id, error: errorMsg });
        await failJob(job.id, errorMsg);
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    log("info", "Process-jobs completed", {
      processed,
      failed,
      durationMs: duration,
    });

    return NextResponse.json({
      success: true,
      processed,
      failed,
      durationMs: duration,
    });
  } catch (err) {
    log("error", "Process-jobs cron failed", { error: String(err) });
    return NextResponse.json({ error: "Processing failed", details: String(err) }, { status: 500 });
  } finally {
    await releaseLock(lockKey);
  }
}
