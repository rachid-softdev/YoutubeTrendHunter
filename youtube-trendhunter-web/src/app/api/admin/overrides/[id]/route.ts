// ============================================
// Admin: Delete Override
// DELETE /api/admin/overrides/:id
// ============================================

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { getFeatureGateService } from "@/lib/feature-flags";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    // Get the override first to know scopeId for cache invalidation
    const existing = await prisma.entitlementOverride.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "NOT_FOUND", details: "Override not found" },
        { status: 404 },
      );
    }

    await prisma.entitlementOverride.delete({ where: { id } });

    // Invalidate cache if it was an ORG-level override
    if (existing.scope === "ORG") {
      const gate = getFeatureGateService();
      await gate.invalidateCache(existing.scopeId);
    }

    log("info", "[Admin] Override deleted", {
      id,
      scope: existing.scope,
      scopeId: existing.scopeId,
      featureKey: existing.featureKey,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number };
    if (error.message === "UNAUTHORIZED" || error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: error.status || 401 });
    }
    console.error("[Admin/Overrides] Error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
