import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { getAuditLogs } from "@/lib/audit-log"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  try {
    const userId = session.user.id

    // Check plan - FREE users cannot export
    const plan = await getUserPlan(userId)
    const limits = PLAN_LIMITS[plan]

    if (!limits.export) {
      return NextResponse.json(
        { error: "L'export de données est disponible à partir du plan Pro." },
        { status: 403 }
      )
    }

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        createdAt: true,
        image: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
    }

    // Get watched niches
    const watchedNiches = await prisma.userNiche.findMany({
      where: { userId },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    // Get alerts
    const alerts = await prisma.alert.findMany({
      where: { userId },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    // Get API tokens (names + dates only, no raw tokens)
    const apiTokens = await prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    })

    // Get subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    })

    // Get last 100 audit logs
    const auditLogs = await getAuditLogs(userId, 100)

    // Build export data
    const exportData = {
      profile: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        avatarUrl: user.image,
      },
      watchedNiches: watchedNiches.map((un) => ({
        id: un.niche.id,
        name: un.niche.name,
        slug: un.niche.slug,
        followedAt: un.createdAt.toISOString(),
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        threshold: a.threshold,
        channel: a.channel,
        isActive: a.isActive,
        nicheId: a.nicheId,
        nicheName: a.niche?.name,
        createdAt: a.createdAt.toISOString(),
        lastSentAt: a.lastSentAt?.toISOString() || null,
      })),
      apiTokens: apiTokens.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() || null,
        expiresAt: t.expiresAt?.toISOString() || null,
      })),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            stripeCurrentPeriodEnd: subscription.stripeCurrentPeriodEnd.toISOString(),
            createdAt: subscription.createdAt.toISOString(),
          }
        : null,
      auditLogs: auditLogs.map((l) => ({
        action: l.action,
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    }

    // Generate filename
    const filename = `trendhunter-export-${new Date().toISOString().split("T")[0]}.json`

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error exporting data:", error)
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 })
  }
}