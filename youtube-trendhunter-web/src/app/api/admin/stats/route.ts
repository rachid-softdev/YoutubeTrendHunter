import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.role || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      totalUsers,
      totalSubscriptions,
      proCount,
      teamCount,
      freeCount,
      totalTrends,
      activeAlerts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { plan: "PRO" } }),
      prisma.subscription.count({ where: { plan: "TEAM" } }),
      prisma.subscription.count({ where: { plan: "FREE" } }),
      prisma.trend.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.alert.count({ where: { isActive: true } }),
    ]);

    // Get recent users
    const recentUsers = await prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        image: true,
        subscription: {
          select: { plan: true, status: true },
        },
      },
    });

    // Get MRR (monthly recurring revenue) estimate
    const mrrEstimate = proCount * 15 + teamCount * 39;

    return NextResponse.json({
      stats: {
        totalUsers,
        totalSubscriptions,
        proCount,
        teamCount,
        freeCount,
        totalTrends,
        activeAlerts,
        mrr: mrrEstimate,
      },
      recentUsers,
    });
  } catch (error) {
    console.error("[Admin/Stats] Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
