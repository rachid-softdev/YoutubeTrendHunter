import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import redis from "@/lib/redis";
import { stripe } from "@/lib/stripe";

type ServiceStatus = "ok" | "error";

interface ServiceCheck {
  status: ServiceStatus;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: ServiceCheck;
    redis: ServiceCheck;
    stripe: ServiceCheck;
  };
}

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

  // Run all service checks independently with individual try/catch
  let dbStatus: ServiceStatus = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  let redisStatus: ServiceStatus = "ok";
  try {
    await redis.ping();
  } catch {
    redisStatus = "error";
  }

  let stripeStatus: ServiceStatus = "ok";
  try {
    // Lightweight call — only retrieves the account balance (no mutations)
    await stripe.balance.retrieve();
  } catch {
    stripeStatus = "error";
  }

  // Determine overall status based on which services are down
  const errors = [dbStatus, redisStatus, stripeStatus].filter((s) => s === "error").length;
  let overallStatus: HealthResponse["status"] = "healthy";
  if (errors === 3) {
    overallStatus = "unhealthy";
  } else if (errors > 0) {
    overallStatus = "degraded";
  }

  const health: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus },
      redis: { status: redisStatus },
      stripe: { status: stripeStatus },
    },
  };

  const statusCode = overallStatus === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
