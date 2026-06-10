import { auth } from "@/lib/auth";
import { getUserPlan } from "@/lib/services/subscription.service";
import { TrendCard } from "@/components/dashboard/trend-card";
import { NicheSelector } from "@/components/dashboard/niche-selector";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Zap } from "lucide-react";
import type { Trend, Niche } from "@prisma/client";
import { getCached, setCached } from "@/lib/redis";
import { getTrendsForDashboard } from "@/lib/services/trend.service";
import { getAllActiveNiches } from "@/lib/services/niche.service";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>;
}) {
  const { niche: nicheQuery } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const plan = await getUserPlan(session.user.id);
  const nicheSlug = nicheQuery ?? "tech";

  // Try cache first — key includes nicheSlug so switching niches gets correct data
  const cacheKey = `dashboard:user:${session.user.id}:${plan}:${nicheSlug}`;
  const cached = await getCached<{ trends: Trend[]; niches: Niche[] }>(cacheKey);

  let trends: Trend[];
  let niches: Niche[];

  if (cached) {
    trends = cached.trends;
    niches = cached.niches;
  } else {
    [trends, niches] = await Promise.all([
      getTrendsForDashboard(nicheSlug, plan),
      getAllActiveNiches(),
    ]);

    await setCached(cacheKey, { trends, niches }, 300);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
        <h1 className="text-3xl font-black tracking-tighter italic">Tendances.</h1>
        <NicheSelector niches={niches} current={nicheSlug} />
      </div>

      {plan === "FREE" && (
        <Alert variant="warning" className="mb-6">
          <Zap className="h-4 w-4" />
          <AlertTitle>Plan Free</AlertTitle>
          <AlertDescription>
            5 tendances visibles.{" "}
            <a href="/pricing" className="font-medium underline">
              Passer Pro →
            </a>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {trends.map((trend) => (
          <TrendCard key={trend.id} trend={trend} />
        ))}
      </div>
    </div>
  );
}
