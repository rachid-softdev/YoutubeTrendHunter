import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alertUpdateSchema } from "@/lib/schemas";
import { updateAlert, deleteAlert } from "@/lib/alerts";
import { auditLog } from "@/lib/audit-log";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const alert = await prisma.alert.findFirst({
      where: { id, userId: session.user.id },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: "Alerte introuvable" }, { status: 404 });
    }

    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Error fetching alert:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    // Verify ownership
    const existing = await prisma.alert.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Alerte introuvable" }, { status: 404 });
    }

    // Validate body
    const parsed = alertUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Build update data
    const updateData: Parameters<typeof updateAlert>[2] = {};
    if (parsed.data.nicheId !== undefined) updateData.nicheId = parsed.data.nicheId || null;
    if (parsed.data.type !== undefined) updateData.type = parsed.data.type;
    if (parsed.data.threshold !== undefined) updateData.threshold = parsed.data.threshold;
    if (parsed.data.channel !== undefined) updateData.channel = parsed.data.channel;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    const alert = await updateAlert(id, session.user.id, updateData);

    // Fetch full alert for response
    const fullAlert = await prisma.alert.findUnique({
      where: { id: alert.id },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json({ alert: fullAlert });
  } catch (error) {
    console.error("Error updating alert:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Verify ownership
    const existing = await prisma.alert.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Alerte introuvable" }, { status: 404 });
    }

    // Store for audit before deletion
    const alertType = existing.type;
    const alertNicheId = existing.nicheId;

    // Get niche name for audit
    let nicheSlug: string | undefined;
    if (alertNicheId) {
      const niche = await prisma.niche.findUnique({
        where: { id: alertNicheId },
        select: { slug: true },
      });
      nicheSlug = niche?.slug;
    }

    await deleteAlert(id, session.user.id);

    // Audit log
    await auditLog("alert_delete", session.user.id, {
      alertType,
      niche: nicheSlug || "all",
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting alert:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
