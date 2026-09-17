import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/auth/require-admin";
import { UnauthorizedError, ForbiddenError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  const requestedUserId = req.nextUrl.searchParams.get("userId");
  const targetUserId = requestedUserId ?? session.user.id;

  // Un utilisateur ne peut consulter que ses propres logs, sauf admin
  if (targetUserId !== session.user.id) {
    try {
      await requireAdmin();
    } catch {
      return ForbiddenError();
    }
  }

  const logs = await getAuditLogs(targetUserId);
  return NextResponse.json({ logs });
}
