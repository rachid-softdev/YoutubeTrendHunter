import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // Optionally require a health check secret
  const healthSecret = process.env.HEALTH_CHECK_SECRET;
  if (healthSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${healthSecret}`) {
      // Reduced info for unauthorized requests
      return NextResponse.json({ status: "ok" });
    }
  }

  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  // Only include detailed service status for authorized requests
  if (!healthSecret || req.headers.get("authorization") === `Bearer ${healthSecret}`) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.services = { database: "ok" };
    } catch {
      health.services = { database: "error" };
      health.status = "degraded";
    }
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
