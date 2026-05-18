import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getAuditLogs } from "@/lib/audit-log"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = req.nextUrl.searchParams.get("userId")
  // Users can only see their own logs (unless admin)
  if (userId && userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const logs = await getAuditLogs(session.user.id)
  return NextResponse.json({ logs })
}