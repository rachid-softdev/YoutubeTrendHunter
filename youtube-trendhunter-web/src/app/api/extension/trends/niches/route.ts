// ============================================
// Extension: Available Niches
// GET /api/extension/trends/niches
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-tokens";
import { getUserPlan } from "@/lib/services/subscription.service";
import { withRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getCached, setCached } from "@/lib/redis";
import { UnauthorizedError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "extension");
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return UnauthorizedError("Token manquant");
  }

  const result = await verifyApiToken(token);
  if (!result) {
    return UnauthorizedError("Token invalide");
  }

  // Check cache
  const cacheKey = `niches:ext:${result.userId}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const plan = await getUserPlan(result.userId);

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      language: true,
      _count: {
        select: {
          trends: {
            where: { expiresAt: { gt: new Date() } },
          },
        },
      },
    },
  });

  const responseData = {
    niches: niches.map((n) => ({
      id: n.id,
      name: n.name,
      slug: n.slug,
      description: n.description,
      language: n.language,
      trendCount: n._count.trends,
    })),
    plan,
  };

  // Cache for 5 minutes
  await setCached(cacheKey, responseData, 300);

  return NextResponse.json(responseData);
}
