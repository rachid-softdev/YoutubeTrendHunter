// ============================================
// Admin: Features Management
// GET  /api/admin/features         — list all features
// POST /api/admin/features         — create feature
// PUT  /api/admin/features/:key    — update feature
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FeatureType } from "@/lib/feature-flags/types";

export const dynamic = "force-dynamic";

// ─── GET /api/admin/features ───

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
    const sort = searchParams.get("sort") || "key:asc";
    const typeFilter = searchParams.get("type");

    const where = typeFilter ? { type: typeFilter as FeatureType } : {};

    const [features, total] = await Promise.all([
      prisma.feature.findMany({
        where,
        orderBy: { key: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.feature.count({ where }),
    ]);

    // Apply sort
    const sorted = [...features].sort(
      (
        a: { key: string; type: string; name: string | null },
        b: { key: string; type: string; name: string | null },
      ) => {
        const [field, dir] = sort.split(":");
        const mod = dir === "desc" ? -1 : 1;
        if (field === "key") return a.key.localeCompare(b.key) * mod;
        if (field === "type") return a.type.localeCompare(b.type) * mod;
        if (field === "name") return (a.name ?? "").localeCompare(b.name ?? "") * mod;
        return 0;
      },
    );

    return NextResponse.json({
      data: sorted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    if (error.message === "UNAUTHORIZED" || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: error.status || 401 });
    }
    console.error("[Admin/Features] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// ─── POST /api/admin/features ───

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> | undefined;
  try {
    await requireAdmin();

    body = (await req.json()) as Record<string, unknown>;
    const key = body.key as string | undefined;
    const name = body.name as string | undefined;
    const description = body.description as string | undefined;
    const type = body.type as string | undefined;
    const defaultConfig = body.defaultConfig as Record<string, unknown> | undefined;
    const isActive = body.isActive as boolean | undefined;

    if (!key || !type) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "key and type are required" },
        { status: 400 },
      );
    }

    if (!["BOOLEAN", "LIMIT", "EXPERIMENT"].includes(type)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "type must be BOOLEAN, LIMIT, or EXPERIMENT" },
        { status: 400 },
      );
    }

    const feature = await prisma.feature.create({
      data: {
        key: key as string,
        name: name || (key as string),
        description: (description ?? null) as string | null,
        type: type as FeatureType,
        defaultConfig: defaultConfig as Prisma.InputJsonValue | undefined,
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json({ data: feature }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number; code?: string };
    if (error.message === "UNAUTHORIZED" || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: error.status || 401 });
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "CONFLICT", details: `Feature key '${body?.key}' already exists` },
        { status: 409 },
      );
    }
    console.error("[Admin/Features] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
