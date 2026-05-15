import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { alertCreateSchema } from "@/lib/schemas"
import { createAlert } from "@/lib/alerts"
import { auditLog } from "@/lib/audit-log"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  try {
    const plan = await getUserPlan(session.user.id)
    const limits = PLAN_LIMITS[plan]

    // Get user's alerts with niche info
    const alerts = await prisma.alert.findMany({
      where: { userId: session.user.id },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Get user's followed niches for the alert creation form
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: session.user.id },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    return NextResponse.json({
      alerts,
      userNiches,
      plan,
      canCreate: limits.alerts,
    })
  } catch (error) {
    console.error("Error fetching alerts:", error)
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  try {
    // Check plan - FREE users cannot create alerts
    const plan = await getUserPlan(session.user.id)
    const limits = PLAN_LIMITS[plan]

    if (!limits.alerts) {
      return NextResponse.json(
        { error: "Les alertes sont disponibles à partir du plan Pro. Passez à Pro pour créer des alertes." },
        { status: 403 }
      )
    }

    // Validate body
    const body = await req.json()
    const parsed = alertCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { nicheId, type, threshold, channel } = parsed.data

    // Verify niche if provided
    if (nicheId) {
      const niche = await prisma.niche.findUnique({
        where: { id: nicheId },
      })
      if (!niche) {
        return NextResponse.json({ error: "Niche introuvable" }, { status: 404 })
      }
    }

    // Create alert
    const alert = await createAlert({
      userId: session.user.id,
      nicheId: nicheId || undefined,
      type,
      threshold,
      channel,
    })

    // Audit log
    await auditLog("alert_create", session.user.id, {
      alertType: type,
      channel,
      niche: nicheId || "all",
      plan,
    })

    // Fetch the alert with niche for response
    const fullAlert = await prisma.alert.findUnique({
      where: { id: alert.id },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    return NextResponse.json({ alert: fullAlert }, { status: 201 })
  } catch (error) {
    console.error("Error creating alert:", error)
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 })
  }
}