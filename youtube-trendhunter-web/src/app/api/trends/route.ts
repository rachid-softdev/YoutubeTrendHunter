import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check";
import { trendsQuerySchema } from "@/lib/schemas";
import { getCached, setCached } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Validate query params
  const nicheSlug = req.nextUrl.searchParams.get("niche");
  const parsed = trendsQuerySchema.safeParse({ niche: nicheSlug });
  if (!parsed.success) {
    return NextResponse.json({ error: "Niche requise" }, { status: 400 });
  }

  const plan = await getUserPlan(session.user.id);
  const limits = PLAN_LIMITS[plan];

  // Check cache first
  const cacheKey = `trends:list:${parsed.data.niche}:${plan}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const niche = await prisma.niche.findUnique({ where: { slug: parsed.data.niche } });
  if (!niche) return NextResponse.json({ error: "Niche introuvable" }, { status: 404 });

  if (plan === "FREE") {
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: session.user.id },
      select: { nicheId: true },
    });

    // FREE users can follow exactly 1 niche
    if (userNiches.length >= 1) {
      // If they already follow a different niche, block
      if (!userNiches.some((un) => un.nicheId === niche.id)) {
        return NextResponse.json(
          { error: "Limite plan Free atteinte — vous suivez déjà une niche" },
          { status: 403 },
        );
      }
    }
  }

  const trends = await prisma.trend.findMany({
    where: {
      nicheId: niche.id,
      expiresAt: { gte: new Date() },
    },
    orderBy: { score: "desc" },
    take: plan === "FREE" ? limits.trendsPerNiche : 20,
  });

  const result = { trends, plan };
  await setCached(cacheKey, result, 300); // 5 min cache
  return NextResponse.json(result);
}
