import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 })
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!apiToken) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 })
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  })

  const nicheSlug = req.nextUrl.searchParams.get("niche") ?? "tech-ia"
  const plan = await getUserPlan(apiToken.userId)

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
  if (!niche) return NextResponse.json({ trends: [], plan })

  const trends = await prisma.trend.findMany({
    where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
    orderBy: { score: "desc" },
    take: plan === "FREE" ? 5 : 20,
  })

  return NextResponse.json({
    trends,
    plan,
    user: { name: apiToken.user.name, email: apiToken.user.email },
  })
}