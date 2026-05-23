import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check";
import { auditLog } from "@/lib/audit-log";
import { z } from "@/lib/schemas";

const nicheFollowSchema = z.object({
  nicheId: z.string().min(1, "ID de niche requis"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    // Get user's followed niches with trend counts
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: session.user.id },
      include: {
        niche: {
          include: {
            _count: {
              select: { trends: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get all available niches
    const availableNiches = await prisma.niche.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      niches: userNiches,
      followed: userNiches.map((un) => un.nicheId),
      available: availableNiches,
    });
  } catch (error) {
    console.error("Error fetching niches:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    // Validate body
    const body = await req.json();
    const parsed = nicheFollowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { nicheId } = parsed.data;

    // Check plan limits
    const plan = await getUserPlan(session.user.id);
    const limits = PLAN_LIMITS[plan];

    const currentCount = await prisma.userNiche.count({
      where: { userId: session.user.id },
    });

    // FREE plan: max 1 niche
    if (plan === "FREE" && currentCount >= 1) {
      return NextResponse.json(
        {
          error:
            "Limite du plan FREE atteinte (1 niche). Passez à Pro pour suivre des niches illimitées.",
        },
        { status: 403 },
      );
    }

    // Check if already following
    const existing = await prisma.userNiche.findUnique({
      where: {
        userId_nicheId: {
          userId: session.user.id,
          nicheId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Vous suive déjà cette niche" }, { status: 400 });
    }

    // Verify niche exists
    const niche = await prisma.niche.findUnique({
      where: { id: nicheId },
    });

    if (!niche) {
      return NextResponse.json({ error: "Niche introuvable" }, { status: 404 });
    }

    // Create UserNiche
    const userNiche = await prisma.userNiche.create({
      data: {
        userId: session.user.id,
        nicheId,
      },
      include: { niche: true },
    });

    // Audit log
    await auditLog("niche_select", session.user.id, {
      niche: niche.slug,
      nicheName: niche.name,
      plan,
    });

    return NextResponse.json({ userNiche }, { status: 201 });
  } catch (error) {
    console.error("Error following niche:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
