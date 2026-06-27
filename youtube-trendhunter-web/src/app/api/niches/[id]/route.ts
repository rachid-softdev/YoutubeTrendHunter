import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/services/subscription.service";
import { auditLog } from "@/lib/audit-log";
import { invalidateCache } from "@/lib/cache";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { id: nicheId } = await params;

    // Check ownership
    const userNiche = await prisma.userNiche.findUnique({
      where: {
        userId_nicheId: {
          userId: session.user.id,
          nicheId,
        },
      },
      include: { niche: true },
    });

    if (!userNiche) {
      return NextResponse.json({ error: "Vous ne suivez pas cette niche" }, { status: 404 });
    }

    // Delete
    await prisma.userNiche.delete({
      where: { id: userNiche.id },
    });

    // Audit log
    const plan = await getUserPlan(session.user.id);
    await auditLog("niche_deselect", session.user.id, {
      niche: userNiche.niche.slug,
      nicheName: userNiche.niche.name,
      plan,
    });

    // Invalidate cached niches
    await invalidateCache("niches:*");

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error unfollowing niche:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { id: nicheId } = await params;

    // Check ownership
    const userNiche = await prisma.userNiche.findUnique({
      where: {
        userId_nicheId: {
          userId: session.user.id,
          nicheId,
        },
      },
    });

    if (!userNiche) {
      return NextResponse.json({ error: "Vous ne suivez pas cette niche" }, { status: 404 });
    }

    // We don't have an isActive field on UserNiche, so we'll treat this as a no-op
    // If needed, we'd need to add it to the schema
    // For now, return success with the current state

    // Invalidate cached niches
    await invalidateCache("niches:*");

    return NextResponse.json({ userNiche });
  } catch (error) {
    console.error("Error updating niche:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
