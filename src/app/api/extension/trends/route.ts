import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserPlan, getTrendsTake } from "@/lib/plan-check"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 })
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { token },
  })

  if (!apiToken) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 })
  }

  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token expiré" }, { status: 401 })
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  })

  const nicheSlug = req.nextUrl.searchParams.get("niche") ?? "tech"
  const plan = await getUserPlan(apiToken.userId)

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
  if (!niche) return NextResponse.json({ trends: [], plan })

  const hasAccess = await prisma.userNiche.findUnique({
    where: { userId_nicheId: { userId: apiToken.userId, nicheId: niche.id } },
  })
  if (plan === "FREE" && !hasAccess) {
    return NextResponse.json({ error: "Niche non suivie" }, { status: 403 })
  }

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take: getTrendsTake(plan),
  })

  return NextResponse.json({ trends, plan })
}