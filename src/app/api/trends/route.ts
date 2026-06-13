import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, PLAN_LIMITS, getTrendsTake } from "@/lib/plan-check"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const nicheSlug = req.nextUrl.searchParams.get("niche")
  if (!nicheSlug) {
    return NextResponse.json({ error: "Niche requise" }, { status: 400 })
  }

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  const niche = await prisma.niche.findUnique({ where: { slug: nicheSlug } })
  if (!niche) return NextResponse.json({ error: "Niche introuvable" }, { status: 404 })

  if (plan === "FREE") {
    const userNiches = await prisma.userNiche.count({
      where: { userId: session.user.id },
    })
    if (userNiches > limits.niches) {
      return NextResponse.json({ error: "Limite plan Free atteinte" }, { status: 403 })
    }
  }

  const trends = await prisma.trend.findMany({
    where: {
      nicheId: niche.id,
      expiresAt: { gte: new Date() },
    },
    orderBy: { score: "desc" },
    take: getTrendsTake(plan),
  })

  return NextResponse.json({ trends, plan })
}