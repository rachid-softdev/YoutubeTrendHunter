// ============================================
// Admin: Update Feature
// PUT /api/admin/features/:key
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    await requireAdmin();
    const { key } = await params;
    const body = await req.json();

    const existing = await prisma.feature.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND", details: "Feature not found" }, { status: 404 });
    }

    const { name, description, type, defaultConfig, isActive } = body;

    if (type && !["BOOLEAN", "LIMIT", "EXPERIMENT"].includes(type)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "type must be BOOLEAN, LIMIT, or EXPERIMENT" },
        { status: 400 },
      );
    }

    const feature = await prisma.feature.update({
      where: { key },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(type !== undefined && { type }),
        ...(defaultConfig !== undefined && { defaultConfig }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ data: feature });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED" || err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: err.status || 401 });
    }
    console.error("[Admin/Features] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
