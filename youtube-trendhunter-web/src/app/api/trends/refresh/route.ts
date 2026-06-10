import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trendsRefreshSchema } from "@/lib/schemas";
import { withRateLimit } from "@/lib/rate-limit";
import { UnauthorizedError, NotFoundError } from "@/lib/api-error";
import { createJob } from "@/lib/services/job.service";
import { invalidateCache } from "@/lib/cache";

export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "general");
  if (rateLimitResponse) return rateLimitResponse;

  // Auth via Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return UnauthorizedError("Non autorisé");
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = trendsRefreshSchema.safeParse(body);

    if (parsed.success && parsed.data.nicheSlug) {
      const niche = await prisma.niche.findUnique({ where: { slug: parsed.data.nicheSlug } });
      if (!niche) return NotFoundError("Niche");

      // Create an async job instead of processing inline
      const job = await createJob({
        type: "TREND_SCORE",
        payload: { nicheSlug: parsed.data.nicheSlug, nicheId: niche.id },
        nicheId: niche.id,
      });

      // Invalidate cached trends so next fetch gets fresh data
      await invalidateCache("trends:*");

      return NextResponse.json(
        { jobId: job.id, status: "PENDING", message: "Scoring en file d'attente" },
        { status: 202 },
      );
    }

    // Create jobs for all active niches (batch limit: 50)
    const niches = await prisma.niche.findMany({
      where: { isActive: true },
      select: { id: true, slug: true },
      take: 50,
    });

    if (niches.length === 0) {
      return NextResponse.json(
        { jobIds: [], count: 0, status: "PENDING", message: "Aucune niche active" },
        { status: 202 },
      );
    }

    // Batch with concurrency limit to avoid overwhelming the DB
    const BATCH_SIZE = 10;
    const jobs: Awaited<ReturnType<typeof createJob>>[] = [];
    for (let i = 0; i < niches.length; i += BATCH_SIZE) {
      const batch = niches.slice(i, i + BATCH_SIZE);
      const batchJobs = await Promise.all(
        batch.map((niche) =>
          createJob({
            type: "TREND_SCORE",
            payload: { nicheSlug: niche.slug, nicheId: niche.id },
            nicheId: niche.id,
          }),
        ),
      );
      jobs.push(...batchJobs);
    }

    // Invalidate cached trends so next fetch gets fresh data
    await invalidateCache("trends:*");

    return NextResponse.json(
      {
        jobIds: jobs.map((j) => j.id),
        count: jobs.length,
        status: "PENDING",
      },
      { status: 202 },
    );
  } catch (err) {
    console.error("Refresh failed:", err);
    return NextResponse.json({ error: "Erreur lors de la création des jobs" }, { status: 500 });
  }
}
