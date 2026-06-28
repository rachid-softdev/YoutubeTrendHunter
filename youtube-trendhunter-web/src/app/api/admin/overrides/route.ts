// ============================================
// Admin: Entitlement Overrides
// POST   /api/admin/overrides       — create override (reason required)
// DELETE /api/admin/overrides/:id   — delete override
// GET    /api/admin/overrides       — list overrides (paginated)
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/lib/feature-flags";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── GET /api/admin/overrides ───

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
    const scope = searchParams.get("scope");
    const scopeId = searchParams.get("scopeId");

    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    if (scopeId) where.scopeId = scopeId;

    const [overrides, total] = await Promise.all([
      prisma.entitlementOverride.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.entitlementOverride.count({ where }),
    ]);

    return NextResponse.json({
      data: overrides,
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
    console.error("[Admin/Overrides] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// ─── POST /api/admin/overrides ───

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { scope, scopeId, featureKey, enabled, limitValue, configJson, expiresAt, reason } = body;

    // Reason is mandatory
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "reason is required for audit trail" },
        { status: 400 },
      );
    }

    if (!scope || !scopeId || !featureKey) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "scope, scopeId, and featureKey are required" },
        { status: 400 },
      );
    }

    if (!["ORG", "USER"].includes(scope)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: "scope must be ORG or USER" },
        { status: 400 },
      );
    }

    const override = await prisma.entitlementOverride.create({
      data: {
        scope,
        scopeId,
        featureKey,
        enabled: enabled ?? false,
        limitValue: limitValue ?? null,
        configJson: configJson ?? undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason,
      },
    });

    // Invalidate cache
    if (scope === "ORG") {
      const gate = getFeatureGateService();
      await gate.invalidateCache(scopeId);
      log("info", "[Admin] Override created, cache invalidated", {
        scope,
        scopeId,
        featureKey,
        reason,
      });
    }

    return NextResponse.json({ data: override }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number; code?: string };
    if (error.message === "UNAUTHORIZED" || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: error.status || 401 });
    }
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "CONFLICT", details: "Override already exists for this scope+scopeId+featureKey" },
        { status: 409 },
      );
    }
    console.error("[Admin/Overrides] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
