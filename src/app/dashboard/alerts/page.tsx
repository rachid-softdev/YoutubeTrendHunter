import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { AlertsClient } from "@/components/dashboard/alerts-client"

export default async function AlertsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  // Get user's alerts with niche info
  const alerts = await prisma.alert.findMany({
    where: { userId: session.user.id },
    include: {
      niche: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // Get user's followed niches
  const userNiches = await prisma.userNiche.findMany({
    where: { userId: session.user.id },
    include: {
      niche: {
        select: { id: true, name: true, slug: true },
      },
    },
  })

  return (
    <AlertsClient
      alerts={alerts}
      userNiches={userNiches}
      plan={plan}
      canCreate={limits.alerts}
    />
  )
}