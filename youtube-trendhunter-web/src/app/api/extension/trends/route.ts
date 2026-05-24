import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/plan-check";
import { verifyApiToken } from "@/lib/api-tokens";
import { withRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "extension");
  if (rateLimitResponse) return rateLimitResponse;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  const result = await verifyApiToken(token);
  if (!result) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }

  const nicheSlug = req.nextUrl.searchParams.get("niche") ?? "tech-ia";
  const plan = await getUserPlan(result.userId);

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } });
  if (!niche) return NextResponse.json({ trends: [], plan });

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take: plan === "FREE" ? 5 : 20,
  });

  return NextResponse.json({
    trends,
    plan,
    user: { name: result.user.name, email: result.user.email },
  });
}
