import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, getTrendsTake } from "@/lib/plan-check"
import { TrendCard } from "@/components/dashboard/trend-card"
import { NicheSelector } from "@/components/dashboard/niche-selector"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { niche?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const nicheSlug = searchParams.niche ?? "tech"

  const niche = await prisma.niche.findUnique({
    where: { slug: nicheSlug },
  })

  const trends = niche
    ? await prisma.trend.findMany({
        where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
        orderBy: { score: "desc" },
        take: getTrendsTake(plan),
      })
    : []

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Tendances</h1>
        <NicheSelector niches={niches} current={nicheSlug} />
      </div>

      {plan === "FREE" && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Plan Free : 5 tendances visibles.{" "}
          <a href="/pricing" className="underline font-medium">
            Passer Pro →
          </a>
        </div>
      )}

      <div className="space-y-3">
        {trends.map((trend) => (
          <TrendCard key={trend.id} trend={trend} />
        ))}
      </div>
    </div>
  )
}