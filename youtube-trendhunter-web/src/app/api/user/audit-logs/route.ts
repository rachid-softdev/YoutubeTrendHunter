import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit-log";
import { UnauthorizedError, ForbiddenError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  const userId = req.nextUrl.searchParams.get("userId");
  // Users can only see their own logs (unless admin)
  if (userId && userId !== session.user.id) {
    return ForbiddenError();
  }

  const logs = await getAuditLogs(session.user.id);
  return NextResponse.json({ logs });
}
