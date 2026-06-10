import { prisma } from "@/lib/prisma";

const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;

export type JobType = "TREND_SCORE" | "VIDEO_SCORE";

export type CreateJobInput = {
  type: JobType;
  payload: Record<string, unknown>;
  nicheId?: string;
  userId?: string;
  maxAttempts?: number;
};

/**
 * Create a new job with PENDING status.
 */
export async function createJob(input: CreateJobInput) {
  return prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload,
      nicheId: input.nicheId ?? null,
      userId: input.userId ?? null,
      maxAttempts: input.maxAttempts ?? 3,
      status: "PENDING",
    },
  });
}

/**
 * Get a job by its ID.
 */
export async function getJob(jobId: string) {
  return prisma.job.findUnique({ where: { id: jobId } });
}

/**
 * Claim pending jobs for processing (optimistic lock).
 * Fetches PENDING jobs first, then tries to atomically claim each one.
 * Handles stale PROCESSING jobs (lockedAt older than timeout).
 */
export async function claimJobs(workerId: string, batchSize: number = MAX_BATCH_SIZE) {
  const cutoff = new Date(Date.now() - JOB_TIMEOUT_MS);

  // Find available jobs: PENDING ones or stale PROCESSING ones
  const available = await prisma.job.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: "PENDING" }, { status: "PROCESSING", lockedAt: { lt: cutoff } }],
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (available.length === 0) return [];

  // Atomically claim each job
  const claimed: typeof available = [];
  for (const job of available) {
    const result = await prisma.job.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: "PENDING" },
          { status: "PROCESSING", lockedAt: job.lockedAt }, // Only if lock hasn't changed
        ],
      },
      data: {
        status: "PROCESSING",
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
    if (result.count > 0) {
      claimed.push(job);
    }
  }

  return claimed;
}

/**
 * Mark a job as COMPLETED with its result.
 */
export async function completeJob(jobId: string, result: Record<string, unknown>) {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      result,
      progress: 100,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * Mark a job as FAILED with an error message.
 */
export async function failJob(jobId: string, error: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * Update job progress (0-100).
 */
export async function updateJobProgress(jobId: string, progress: number) {
  return prisma.job.update({
    where: { id: jobId },
    data: { progress: Math.min(100, Math.max(0, progress)) },
  });
}

/**
 * Clean up old completed/failed jobs (older than given days).
 */
export async function cleanupOldJobs(daysOld: number = 7) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return prisma.job.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED"] },
      updatedAt: { lt: cutoff },
    },
  });
}

/**
 * Count jobs by status.
 */
export async function countJobsByStatus() {
  const [pending, processing, completed, failed] = await Promise.all([
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.job.count({ where: { status: "PROCESSING" } }),
    prisma.job.count({ where: { status: "COMPLETED" } }),
    prisma.job.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, processing, completed, failed };
}
