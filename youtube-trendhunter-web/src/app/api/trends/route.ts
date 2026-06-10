import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { trendsQuerySchema } from "@/lib/schemas";
import { getCached, setCached, cacheKeys, cacheTTL } from "@/lib/cache";
import { withRateLimit } from "@/lib/rate-limit";
import { UnauthorizedError, ValidationError, NotFoundError, ForbiddenError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "general");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  // Validate query params
  const nicheSlug = req.nextUrl.searchParams.get("niche");
  const parsed = trendsQuerySchema.safeParse({ niche: nicheSlug });
  if (!parsed.success) {
    return ValidationError("Niche requise");
  }

  const plan = await getUserPlan(session.user.id);
  const limits = PLAN_LIMITS[plan];

  // Parse pagination params
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const requestedLimit = Math.min(Math.max(1, parseInt(limitParam || "20", 10) || 20), 100);

  // Check cache only for first page (no cursor)
  if (!cursor) {
    const cacheKey = cacheKeys.trends(parsed.data.niche, plan);
    const cached = await getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const niche = await prisma.niche.findUnique({ where: { slug: parsed.data.niche } });
  if (!niche) return NotFoundError("Niche");

  if (plan === "FREE") {
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: session.user.id },
      select: { nicheId: true },
    });

    // FREE users can follow exactly 1 niche
    if (userNiches.length >= 1) {
      // If they already follow a different niche, block
      if (!userNiches.some((un) => un.nicheId === niche.id)) {
        return ForbiddenError("Limite plan Free atteinte — vous suivez déjà une niche");
      }
    }
  }

  // Appliquer les limites plan : combiner la demande client et le quota du plan
  const planLimit = limits.trendsPerNiche === -1 ? requestedLimit : limits.trendsPerNiche;
  const take = Math.min(requestedLimit, planLimit) + 1; // +1 to detect next page

  const trends = await prisma.trend.findMany({
    where: {
      nicheId: niche.id,
      expiresAt: { gte: new Date() },
    },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = trends.length > take - 1;
  const results = hasMore ? trends.slice(0, take - 1) : trends;
  const nextCursor: string | null = hasMore ? results[results.length - 1].id : null;

  const result = { trends: results, plan, nextCursor };

  // Cache only the first page
  if (!cursor) {
    await setCached(cacheKeys.trends(parsed.data.niche, plan), result, cacheTTL.trends);
  }

  return NextResponse.json(result);
}
