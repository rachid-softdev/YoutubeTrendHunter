// ============================================
// Admin: Niche CRUD by ID
// GET / PATCH / DELETE /api/admin/niches/[id]
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const nicheUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    const niche = await prisma.niche.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            trends: {
              where: { expiresAt: { gt: new Date() } },
            },
            userNiches: true,
          },
        },
      },
    });

    if (!niche) {
      return NextResponse.json({ error: "Niche non trouvée" }, { status: 404 });
    }

    return NextResponse.json({ niche });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Niches/:id] GET Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    const existing = await prisma.niche.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Niche non trouvée" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = nicheUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // If slug is being changed, check for duplicates
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugExists = await prisma.niche.findUnique({
        where: { slug: parsed.data.slug },
      });
      if (slugExists) {
        return NextResponse.json({ error: "Ce slug existe déjà" }, { status: 409 });
      }
    }

    const niche = await prisma.niche.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ niche });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Niches/:id] PATCH Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    const existing = await prisma.niche.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Niche non trouvée" }, { status: 404 });
    }

    // Cascade: remove related user niches and trends first
    await prisma.$transaction([
      prisma.userNiche.deleteMany({ where: { nicheId: id } }),
      prisma.trend.deleteMany({ where: { nicheId: id } }),
      prisma.niche.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Niches/:id] DELETE Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
