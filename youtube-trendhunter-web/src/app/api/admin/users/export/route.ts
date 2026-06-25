// ============================================
// Admin: Users Export CSV
// GET /api/admin/users/export
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          select: { plan: true, status: true },
        },
      },
    });

    // Build CSV
    const headers = [
      "name",
      "email",
      "role",
      "plan",
      "subscriptionStatus",
      "createdAt",
      "updatedAt",
    ];
    const rows = users.map((u) => [
      escapeCsvField(u.name || ""),
      escapeCsvField(u.email || ""),
      escapeCsvField(u.role || "USER"),
      escapeCsvField(u.subscription?.plan || "FREE"),
      escapeCsvField(u.subscription?.status || "none"),
      escapeCsvField(u.createdAt?.toISOString() || ""),
      escapeCsvField(u.updatedAt?.toISOString() || ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="users-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Users/Export] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function escapeCsvField(value: string): string {
  // Prevent CSV formula injection by prefixing dangerous starting characters
  if (/^[=+\-@%\t\n]/.test(value)) {
    value = "'" + value;
  }
  // Standard CSV escaping for commas, double quotes, and newlines
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
