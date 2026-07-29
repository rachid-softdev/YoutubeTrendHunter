import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/services/subscription.service";
import { auditLog } from "@/lib/audit-log";
import { invalidateCache } from "@/lib/cache";
import { getNicheById, updateNiche } from "@/lib/services/niche.service";
import { UnauthorizedError, NotFoundError, ValidationError, InternalError } from "@/lib/api-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    const { id } = await params;
    const niche = await getNicheById(id);
    if (!niche) return NotFoundError("Niche");
    return NextResponse.json({ niche });
  } catch (error) {
    console.error("Error fetching niche:", error);
    return InternalError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

  try {
    const { id } = await params;

    // Verify the niche exists
    const niche = await getNicheById(id);
    if (!niche) return NotFoundError("Niche");

    const body = await req.json();
    const { name, description, language, isActive, keywords } = body;

    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return ValidationError("Le nom de la niche est requis");
    }

    const updated = await updateNiche(id, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(language !== undefined && { language }),
      ...(isActive !== undefined && { isActive }),
      ...(keywords !== undefined && { keywords }),
    });

    await invalidateCache("niches:*");

    return NextResponse.json({ niche: updated });
  } catch (error) {
    console.error("Error updating niche:", error);
    return InternalError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

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

    if (!userNiche) return NotFoundError("Niche");

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
    return InternalError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return UnauthorizedError();

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

    if (!userNiche) return NotFoundError("Niche");

    // Invalidate cached niches
    await invalidateCache("niches:*");

    return NextResponse.json({ userNiche });
  } catch (error) {
    console.error("Error updating niche:", error);
    return InternalError();
  }
}
