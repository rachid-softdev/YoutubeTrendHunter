import { auth } from "@/lib/auth";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { NicheGrid } from "@/components/dashboard/niche-grid";
import { getCached, setCached } from "@/lib/redis";
import { getUserNiches, getAllActiveNichesWithUserStatus } from "@/lib/services/niche.service";
import type { Niche, UserNiche } from "@prisma/client";

type NicheWithUserStatus = Niche & {
  userNiches: UserNiche[];
  _count: { trends: number };
};

export default async function NichesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const plan = await getUserPlan(session.user.id);
  const limits = PLAN_LIMITS[plan];

  // Try cache first
  const cacheKey = `niches:user:${session.user.id}`;
  const cached = await getCached<{
    allNiches: NicheWithUserStatus[];
    userNiches: { niche: Niche }[];
  }>(cacheKey);

  let allNiches: NicheWithUserStatus[];
  let userNiches: { niche: Niche }[];

  if (cached) {
    allNiches = cached.allNiches;
    userNiches = cached.userNiches;
  } else {
    // Use service layer instead of direct Prisma
    allNiches = await getAllActiveNichesWithUserStatus(session.user.id);
    userNiches = await getUserNiches(session.user.id);

    await setCached(cacheKey, { allNiches, userNiches }, 300);
  }

  const currentCount = userNiches.length;
  const maxCount = plan === "FREE" ? limits.niches : -1; // -1 means unlimited

  return (
    <NicheGrid
      allNiches={allNiches}
      userNiches={userNiches}
      plan={plan}
      currentCount={currentCount}
      maxCount={maxCount}
    />
  );
}
