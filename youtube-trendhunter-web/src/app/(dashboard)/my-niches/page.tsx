import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check";
import { NicheGrid } from "@/components/dashboard/niche-grid";

export default async function NichesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const plan = await getUserPlan(session.user.id);
  const limits = PLAN_LIMITS[plan];

  // Get all available niches with user status and trend counts
  const allNiches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      userNiches: {
        where: { userId: session.user.id },
      },
      _count: {
        select: { trends: true },
      },
    },
  });

  const userNiches = await prisma.userNiche.findMany({
    where: { userId: session.user.id },
    include: { niche: true },
  });

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
