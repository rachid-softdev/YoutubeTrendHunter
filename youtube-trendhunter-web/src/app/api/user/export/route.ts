import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check";
import { getAuditLogs } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // Check plan - FREE users cannot export
    const plan = await getUserPlan(userId);
    const limits = PLAN_LIMITS[plan];

    if (!limits.export) {
      return NextResponse.json(
        { error: "L'export de données est disponible à partir du plan Pro." },
        { status: 403 },
      );
    }

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        createdAt: true,
        image: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    // Get watched niches
    const watchedNiches = await prisma.userNiche.findMany({
      where: { userId },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Get alerts
    const alerts = await prisma.alert.findMany({
      where: { userId },
      include: {
        niche: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    // Get API tokens (names + dates only, no raw tokens)
    const apiTokens = await prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    // Get subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    // Get last 100 audit logs
    const auditLogs = await getAuditLogs(userId, 100);

    // Check format parameter
    const format = req.nextUrl.searchParams.get("format") || "json";
    const includeTrends = req.nextUrl.searchParams.get("trends") === "true";

    // Build export data
    const exportData = {
      profile: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        avatarUrl: user.image,
      },
      watchedNiches: watchedNiches.map((un) => ({
        id: un.niche.id,
        name: un.niche.name,
        slug: un.niche.slug,
        followedAt: un.createdAt.toISOString(),
      })),
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        threshold: a.threshold,
        channel: a.channel,
        isActive: a.isActive,
        nicheId: a.nicheId,
        nicheName: a.niche?.name,
        createdAt: a.createdAt.toISOString(),
        lastSentAt: a.lastSentAt?.toISOString() || null,
      })),
      apiTokens: apiTokens.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() || null,
        expiresAt: t.expiresAt?.toISOString() || null,
      })),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            stripeCurrentPeriodEnd: subscription.stripeCurrentPeriodEnd.toISOString(),
            createdAt: subscription.createdAt.toISOString(),
          }
        : null,
      auditLogs: auditLogs.map((l) => ({
        action: l.action,
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    };

    // CSV export - trends per niche
    if (format === "csv" && includeTrends) {
      const trendsData = [];

      for (const un of watchedNiches) {
        const trends = await prisma.trend.findMany({
          where: {
            nicheId: un.niche.id,
            expiresAt: { gt: new Date() },
          },
          orderBy: { score: "desc" },
          take: 50,
        });

        for (const trend of trends) {
          trendsData.push({
            niche: un.niche.name,
            title: trend.title,
            score: trend.score,
            status: trend.status,
            avgViews: trend.avgViews || 0,
            contentAngles: (trend.contentAngles || []).join(" | "),
            detectedAt: trend.detectedAt.toISOString(),
          });
        }
      }

      const headers = [
        "niche",
        "title",
        "score",
        "status",
        "avgViews",
        "contentAngles",
        "detectedAt",
      ];
      const csvRows = [headers.join(",")];

      for (const row of trendsData) {
        const values = headers.map((h) => {
          const val = row[h as keyof typeof row];
          if (
            typeof val === "string" &&
            (val.includes(",") || val.includes('"') || val.includes("\n"))
          ) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val ?? "";
        });
        csvRows.push(values.join(","));
      }

      const filename = `trendhunter-trends-${new Date().toISOString().split("T")[0]}.csv`;

      return new NextResponse(csvRows.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // CSV export - summary
    if (format === "csv") {
      const csvRows = [
        "Type,Nom,Détails,Date",
        `Profile,${user.name || "N/A"},${user.email},${user.createdAt.toISOString()}`,
        ...watchedNiches.map(
          (un) => `Niche,${un.niche.name},${un.niche.slug},${un.createdAt.toISOString()}`,
        ),
        ...alerts.map((a) => `Alerte,${a.type},${a.channel},${a.createdAt.toISOString()}`),
        ...apiTokens.map(
          (t) => `Token,${t.name},ID:${t.id.slice(0, 8)},${t.createdAt.toISOString()}`,
        ),
      ];

      const filename = `trendhunter-export-${new Date().toISOString().split("T")[0]}.csv`;

      return new NextResponse(csvRows.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Generate filename
    const filename = `trendhunter-export-${new Date().toISOString().split("T")[0]}.json`;

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting data:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
