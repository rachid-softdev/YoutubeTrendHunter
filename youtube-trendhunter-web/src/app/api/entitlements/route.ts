import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";

export interface EntitlementData {
  plan: string;
  planKey: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
  resetAt: Record<string, string | null>;
  experimentBuckets: Record<string, boolean>;
}

/**
 * GET /api/entitlements
 *
 * Returns the current user's entitlements: plan info, feature flags, limits,
 * current usage, and experiment buckets.
 *
 * Used by the client-side EntitlementsProvider hook (use-entitlements.tsx).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // Determine the user's effective plan
    const plan = await getUserPlan(userId);
    const planKey = plan.toLowerCase();

    // Get the user's organization (for org-level features/limits)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });
    const orgId = user?.orgId;

    // Try to load feature definitions from the database (PlanFeature + Feature)
    // Fall back to static PLAN_LIMITS if no DB config exists
    const dbPlan = await prisma.plan.findUnique({
      where: { key: planKey },
      include: {
        planFeatures: {
          include: { feature: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    // Build features and limits maps
    const features: Record<string, boolean> = {};
    const limits: Record<string, number | null> = {};
    const experimentBuckets: Record<string, boolean> = {};
    const resetAt: Record<string, string | null> = {};
    const usage: Record<string, number> = {};

    if (dbPlan) {
      // Use database-defined features
      for (const pf of dbPlan.planFeatures) {
        const key = pf.feature.key;

        if (pf.feature.type === "BOOLEAN") {
          features[key] = pf.enabled;
        } else if (pf.feature.type === "LIMIT") {
          features[key] = true; // limit features are "enabled", constrained by limitValue
          limits[key] = pf.limitValue;
        } else if (pf.feature.type === "EXPERIMENT") {
          // Experiments are bucketed — for now, all users get false by default
          // A real implementation would hash the userId into the experiment config
          experimentBuckets[key] = false;
        }

        // Apply overrides from EntitlementOverride table
        if (orgId) {
          const override = await prisma.entitlementOverride.findFirst({
            where: {
              scope: "ORG",
              scopeId: orgId,
              featureKey: key,
              AND: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
            },
          });

          if (override) {
            if (override.enabled !== undefined) features[key] = override.enabled;
            if (override.limitValue !== undefined) limits[key] = override.limitValue;
          }
        }

        // Track usage for limit-type features
        if (pf.feature.type === "LIMIT" && orgId) {
          try {
            const trackUsage = await prisma.usageTracking.findFirst({
              where: {
                orgId,
                featureKey: key,
                periodEnd: { gte: new Date() },
              },
              orderBy: { periodEnd: "desc" },
            });
            usage[key] = trackUsage?.usageCount ?? 0;
            if (trackUsage?.periodEnd) {
              resetAt[key] = trackUsage.periodEnd.toISOString();
            }
          } catch {
            // Silently fall back to 0 usage
            usage[key] = 0;
          }
        }
      }
    } else {
      // Fall back to static PLAN_LIMITS
      const staticLimits = PLAN_LIMITS[plan];
      features["niches"] = true;
      features["trends"] = true;
      features["alerts"] = staticLimits.alerts;
      features["export"] = staticLimits.export;
      features["api"] = staticLimits.api;

      limits["niches.max"] = staticLimits.niches === -1 ? null : staticLimits.niches;
      limits["trends.perNiche"] =
        staticLimits.trendsPerNiche === -1 ? null : staticLimits.trendsPerNiche;

      // Try to calculate actual usage from the database
      try {
        const watchedNicheCount = await prisma.userNiche.count({ where: { userId } });
        usage["niches.max"] = watchedNicheCount;

        // Get trend count across all watched niches
        const watchedNiches = await prisma.userNiche.findMany({
          where: { userId },
          select: { nicheId: true },
        });
        const nicheIds = watchedNiches.map((wn) => wn.nicheId);
        if (nicheIds.length > 0) {
          const trendCount = await prisma.trend.count({
            where: { nicheId: { in: nicheIds }, expiresAt: { gte: new Date() } },
          });
          usage["trends.perNiche"] = trendCount;
        } else {
          usage["trends.perNiche"] = 0;
        }
      } catch {
        usage["niches.max"] = 0;
        usage["trends.perNiche"] = 0;
      }

      // Monthly reset for FREE plan limits
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      resetAt["niches.max"] = nextMonth.toISOString();
      resetAt["trends.perNiche"] = nextMonth.toISOString();
    }

    // Build the response matching EntitlementData interface
    const entitlements: EntitlementData = {
      plan,
      planKey,
      features,
      limits,
      usage,
      resetAt,
      experimentBuckets,
    };

    return NextResponse.json(entitlements);
  } catch (error) {
    console.error("Error fetching entitlements:", error);
    return NextResponse.json({ error: "Erreur interne", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
