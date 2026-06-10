import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getJob } from "@/lib/services/job.service";
import { NotFoundError, UnauthorizedError } from "@/lib/api-error";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  const { id } = await params;
  const job = await getJob(id);

  if (!job) {
    return NotFoundError("Job");
  }

  // Only the owner can see their job, or admins
  if (job.userId && job.userId !== session.user.id) {
    const isAdmin = session.user.role === "ADMIN";
    if (!isAdmin) {
      return NotFoundError("Job");
    }
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
