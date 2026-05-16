import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Play, Users, CreditCard, TrendingUp, Bell, BarChart3, Settings, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Administration - TrendHunter",
}

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || []

export default async function AdminPage() {
  const session = await auth()

  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    redirect("/dashboard")
  }

  const [
    totalUsers,
    totalSubscriptions,
    proCount,
    teamCount,
    totalTrends,
    activeAlerts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count(),
    prisma.subscription.count({ where: { plan: "PRO" } }),
    prisma.subscription.count({ where: { plan: "TEAM" } }),
    prisma.trend.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.alert.count({ where: { isActive: true } }),
  ])

  const mrrEstimate = (proCount * 15) + (teamCount * 39)

  const stats = [
    {
      title: "Total Utilisateurs",
      value: totalUsers.toLocaleString(),
      icon: Users,
      color: "text-blue-400",
    },
    {
      title: "Abonnés Actifs",
      value: totalSubscriptions.toString(),
      icon: CreditCard,
      color: "text-green-400",
    },
    {
      title: "MRR Estimé",
      value: `${mrrEstimate}€`,
      icon: BarChart3,
      color: "text-yellow-400",
    },
    {
      title: "Tendances Actives",
      value: totalTrends.toString(),
      icon: TrendingUp,
      color: "text-purple-400",
    },
    {
      title: "Alertes Actives",
      value: activeAlerts.toString(),
      icon: Bell,
      color: "text-red-400",
    },
  ]

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-yt-red p-2">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Administration</h1>
            <p className="text-dark-ink-secondary">Tableau de bord administrateur</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {stats.map((stat, idx) => (
            <Card key={idx} className="bg-dark-surface border-hairline-dark">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <p className="text-2xl font-black">{stat.value}</p>
                <p className="text-sm text-dark-ink-secondary">{stat.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Subscription breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-dark-surface border-hairline-dark">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">Plan Free</h3>
                <Badge variant="outline">{totalSubscriptions - proCount - teamCount}</Badge>
              </div>
              <p className="text-dark-ink-secondary text-sm">Utilisateurs sans abonnement</p>
            </CardContent>
          </Card>
          <Card className="bg-dark-surface border-hairline-dark">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">Plan Pro</h3>
                <Badge className="bg-yt-red/20 text-yt-red border-yt-red/30">{proCount}</Badge>
              </div>
              <p className="text-dark-ink-secondary text-sm">15€/mois • Accès complet</p>
            </CardContent>
          </Card>
          <Card className="bg-dark-surface border-hairline-dark">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">Plan Team</h3>
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">{teamCount}</Badge>
              </div>
              <p className="text-dark-ink-secondary text-sm">39€/mois • Équipes</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle>Actions Rapides</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <a
                href="/api/admin/niches"
                className="px-4 py-2 bg-dark-canvas border border-hairline-dark hover:border-yt-red/50 transition-colors"
              >
                <Settings className="w-4 h-4 inline mr-2" />
                Gérer les Niches
              </a>
              <a
                href="/api/admin/stats"
                className="px-4 py-2 bg-dark-canvas border border-hairline-dark hover:border-yt-red/50 transition-colors"
              >
                <BarChart3 className="w-4 h-4 inline mr-2" />
                Statistiques API
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}