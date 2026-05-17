import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { TrendCard } from "@/components/dashboard/trend-card"
import { NicheSelector } from "@/components/dashboard/niche-selector"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Zap } from "lucide-react"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ niche?: string }>
}) {
  const { niche: nicheQuery } = await searchParams
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const nicheSlug = nicheQuery ?? "tech"

  const niche = await prisma.niche.findUnique({
    where: { slug: nicheSlug },
  })

  const trends = niche
    ? await prisma.trend.findMany({
        where: { nicheId: niche.id, expiresAt: { gte: new Date() } },
        orderBy: { score: "desc" },
        take: plan === "FREE" ? 5 : 20,
      })
    : []

  const niches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

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
  )
}