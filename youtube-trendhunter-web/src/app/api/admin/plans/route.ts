// ============================================
// Admin: Plans Management
// GET /api/admin/plans
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface PlanItem {
  key?: string;
  name?: string;
  sortOrder?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
    const sort = searchParams.get("sort") || "sortOrder:asc";

    // @ts-expect-error - using new plan model
    const plans = await prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // Simple sort
    // @ts-expect-error - new plan model without full type def
    const sortedPlans = [...plans].sort((a: PlanItem, b: PlanItem) => {
      if (sort === "key:asc") return a.key?.localeCompare(b.key);
      if (sort === "name:asc") return a.name?.localeCompare(b.name);
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    // Pagination
    const start = (page - 1) * limit;
    const paginatedPlans = sortedPlans.slice(start, start + limit);

    return NextResponse.json({
      data: paginatedPlans,
      pagination: {
        page,
        limit,
        total: sortedPlans.length,
        totalPages: Math.ceil(sortedPlans.length / limit),
        hasNext: start + limit < sortedPlans.length,
        hasPrev: page > 1,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error("[Admin/Plans] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
