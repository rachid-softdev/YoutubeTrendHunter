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

  const nicheSlug = req.nextUrl.searchParams.get("niche") ?? "tech-ia";
  const plan = await getUserPlan(result.userId);

  // Parse pagination params
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const planLimit = plan === "FREE" ? 5 : 20;
  const requestedLimit = Math.min(
    Math.max(1, parseInt(limitParam || String(planLimit), 10) || planLimit),
    100,
  );
  const take = Math.min(requestedLimit, planLimit) + 1;

  // Check cache only for first page (no cursor)
  if (!cursor) {
    const cacheKey = `trends:ext:${nicheSlug}:${plan}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } });
  if (!niche) {
    return NextResponse.json({ trends: [], plan, nextCursor: null });
  }

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = trends.length > take - 1;
  const results = hasMore ? trends.slice(0, take - 1) : trends;
  const nextCursor: string | null = hasMore ? results[results.length - 1].id : null;

  const responseData = {
    trends: results,
    plan,
    nextCursor,
  };

  if (!cursor) {
    await setCached(`trends:ext:${nicheSlug}:${plan}:${result.userId}`, responseData, 300);
  }

  return NextResponse.json(responseData);
}
