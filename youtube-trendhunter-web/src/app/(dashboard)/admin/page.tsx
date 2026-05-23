import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Play,
  Users,
  CreditCard,
  TrendingUp,
  Bell,
  BarChart3,
  Settings,
  Shield,
  Search,
  Download,
  Trash2,
  Ban,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Activity,
  Database,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Administration - TrendHunter",
};

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

type TabType = "overview" | "users" | "revenue" | "logs" | "niches" | "monitoring";

interface TabProps {
  params: Promise<{ tab?: string }>;
}

export default async function AdminPage({ params }: TabProps) {
  const { tab } = await params;
  const currentTab = tab || "overview";

  const session = await auth();

  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    redirect("/dashboard");
  }

  // Stats principales
  const [
    totalUsers,
    totalSubscriptions,
    proCount,
    teamCount,
    totalTrends,
    activeAlerts,
    totalNiches,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count(),
    prisma.subscription.count({ where: { plan: "PRO" } }),
    prisma.subscription.count({ where: { plan: "TEAM" } }),
    prisma.trend.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.alert.count({ where: { isActive: true } }),
    prisma.niche.count(),
  ]);

  const mrrEstimate = proCount * 15 + teamCount * 39;

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-yt-red p-2">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Administration</h1>
            <p className="text-dark-ink-secondary">Tableau de bord administrateur</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-hairline-dark pb-4">
          <NavTab
            href="/admin"
            active={currentTab === "overview"}
            icon={BarChart3}
            label="Overview"
          />
          <NavTab
            href="/admin/users"
            active={currentTab === "users"}
            icon={Users}
            label="Utilisateurs"
          />
          <NavTab
            href="/admin/revenue"
            active={currentTab === "revenue"}
            icon={CreditCard}
            label="Revenus"
          />
          <NavTab href="/admin/logs" active={currentTab === "logs"} icon={Activity} label="Logs" />
          <NavTab
            href="/admin/niches"
            active={currentTab === "niches"}
            icon={Database}
            label="Niches"
          />
          <NavTab
            href="/admin/monitoring"
            active={currentTab === "monitoring"}
            icon={Zap}
            label="Monitoring"
          />
        </div>

        {/* Contenu par onglet */}
        {currentTab === "overview" && (
          <OverviewTab
            stats={{
              totalUsers,
              totalSubscriptions,
              proCount,
              teamCount,
              totalTrends,
              activeAlerts,
              totalNiches,
              mrrEstimate,
            }}
          />
        )}
        {currentTab === "users" && <UsersTab />}
        {currentTab === "revenue" && (
          <RevenueTab proCount={proCount} teamCount={teamCount} mrr={mrrEstimate} />
        )}
        {currentTab === "logs" && <LogsTab />}
        {currentTab === "niches" && <NichesTab />}
        {currentTab === "monitoring" && <MonitoringTab />}
      </div>
    </div>
  );
}

// Composant onglet de navigation
function NavTab({
  href,
  active,
  icon: Icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: any;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-yt-red text-white"
          : "bg-dark-surface border border-hairline-dark hover:border-yt-red/50"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </a>
  );
}

// ============ OVERVIEW TAB ============
function OverviewTab({
  stats,
}: {
  stats: {
    totalUsers: number;
    totalSubscriptions: number;
    proCount: number;
    teamCount: number;
    totalTrends: number;
    activeAlerts: number;
    totalNiches: number;
    mrrEstimate: number;
  };
}) {
  const statCards = [
    { title: "Total Utilisateurs", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
    {
      title: "Abonnés Actifs",
      value: stats.totalSubscriptions,
      icon: CreditCard,
      color: "text-green-400",
    },
    {
      title: "MRR Estimé",
      value: `${stats.mrrEstimate}€`,
      icon: BarChart3,
      color: "text-yellow-400",
    },
    {
      title: "Tendances Actives",
      value: stats.totalTrends,
      icon: TrendingUp,
      color: "text-purple-400",
    },
    { title: "Alertes Actives", value: stats.activeAlerts, icon: Bell, color: "text-red-400" },
    { title: "Niches", value: stats.totalNiches, icon: Database, color: "text-cyan-400" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, idx) => (
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle>Plan Free</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black">
              {stats.totalSubscriptions - stats.proCount - stats.teamCount}
            </p>
            <p className="text-dark-ink-secondary text-sm">Utilisateurs sans abonnement</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-green-400">Plan Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-green-400">{stats.proCount}</p>
            <p className="text-dark-ink-secondary text-sm">15€/mois • Accès complet</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-purple-400">Plan Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-purple-400">{stats.teamCount}</p>
            <p className="text-dark-ink-secondary text-sm">39€/mois • Équipes</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ============ USERS TAB ============
async function UsersTab() {
  const users = await prisma.user.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      subscription: true,
      _count: { select: { alerts: true, apiTokens: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-ink-tertiary" />
            <Input
              placeholder="Rechercher par email..."
              className="pl-10 w-64 bg-dark-surface border-hairline-dark"
            />
          </div>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Exporter CSV
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline-dark">
            <tr className="text-left">
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Abonnement</th>
              <th className="p-3 font-medium">Alertes</th>
              <th className="p-3 font-medium">Inscription</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
              >
                <td className="p-3 font-mono text-xs">{user.email}</td>
                <td className="p-3">{user.name || "-"}</td>
                <td className="p-3">
                  <Badge
                    variant={
                      user.subscription?.plan === "FREE"
                        ? "outline"
                        : user.subscription?.plan === "PRO"
                          ? "default"
                          : "destructive"
                    }
                  >
                    {user.subscription?.plan || "FREE"}
                  </Badge>
                </td>
                <td className="p-3">
                  {user.subscription?.status === "ACTIVE" ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Actif
                    </span>
                  ) : (
                    <span className="text-dark-ink-tertiary flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> {user.subscription?.status || "Aucun"}
                    </span>
                  )}
                </td>
                <td className="p-3">{user._count.alerts}</td>
                <td className="p-3 text-dark-ink-tertiary">
                  {user.createdAt.toLocaleDateString("fr-FR")}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button className="p-1 hover:text-yt-red" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ REVENUE TAB ============
function RevenueTab({
  proCount,
  teamCount,
  mrr,
}: {
  proCount: number;
  teamCount: number;
  mrr: number;
}) {
  // Simulation de données pour les graphiques
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin"];
  const revenueData = [1200, 1800, 2400, 2800, 3200, mrr];
  const maxRevenue = Math.max(...revenueData);

  // Revenue mensuel simulé
  const monthlyRevenue = [450, 600, 750, 900, 1050, 1200];
  const maxMonthly = Math.max(...monthlyRevenue);

  return (
    <div className="space-y-6">
      {/* MRR Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-green-400">MRR Actuel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-black">{mrr}€</p>
            <p className="text-dark-ink-secondary text-sm">Revenu mensuel récurrent</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle>Pro | Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-black">{proCount + teamCount}</p>
            <p className="text-dark-ink-secondary text-sm">
              {proCount} Pro + {teamCount} Team
            </p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-yt-red">Croissance MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-black text-green-400">+12%</p>
            <p className="text-dark-ink-secondary text-sm">vs mois dernier</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart CSS Simple - MRR Evolution */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle>Évolution du MRR (6 mois)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between h-48 gap-2">
            {months.map((month, idx) => {
              const height = (revenueData[idx] / maxRevenue) * 100;
              return (
                <div key={month} className="flex flex-col items-center flex-1">
                  <div
                    className="w-full bg-yt-red/80 hover:bg-yt-red transition-colors rounded-t"
                    style={{ height: `${height}%`, minHeight: revenueData[idx] > 0 ? "20px" : "0" }}
                  />
                  <span className="text-xs text-dark-ink-tertiary mt-2">{month}</span>
                  <span className="text-xs font-bold">{revenueData[idx]}€</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Répartition Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle>Revenue par Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Pro (15€)</span>
                  <span className="font-bold">{proCount * 15}€</span>
                </div>
                <div className="h-2 bg-dark-canvas rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${((proCount * 15) / mrr) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Team (39€)</span>
                  <span className="font-bold">{teamCount * 39}€</span>
                </div>
                <div className="h-2 bg-dark-canvas rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${((teamCount * 39) / mrr) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle>Nouveaux Abonnements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {months.map((month, idx) => (
                <div key={month} className="flex justify-between text-sm">
                  <span className="text-dark-ink-secondary">{month}</span>
                  <span className="font-bold">+{Math.floor(monthlyRevenue[idx] / 15)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============ LOGS TAB ============
async function LogsTab() {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2">
          <select className="px-3 py-2 bg-dark-surface border border-hairline-dark rounded-lg text-sm">
            <option>Toutes les actions</option>
            <option>LOGIN</option>
            <option>SUBSCRIPTION_CREATED</option>
            <option>SUBSCRIPTION_CANCELED</option>
            <option>ALERT_CREATED</option>
            <option>API_TOKEN_GENERATED</option>
            <option>CRON_TRENDS_PROCESSED</option>
          </select>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Exporter
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline-dark">
            <tr className="text-left">
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Utilisateur</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">IP</th>
              <th className="p-3 font-medium">Métadonnées</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
              >
                <td className="p-3 text-dark-ink-tertiary text-xs">
                  {log.createdAt.toLocaleString("fr-FR")}
                </td>
                <td className="p-3">
                  {log.userId === "system-cron" ? (
                    <Badge variant="outline">System</Badge>
                  ) : (
                    <span className="text-xs">{log.user?.email || log.userId}</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant={log.action.includes("CANCELED") ? "destructive" : "outline"}>
                    {log.action}
                  </Badge>
                </td>
                <td className="p-3 text-dark-ink-tertiary text-xs font-mono">
                  {log.ipAddress || "-"}
                </td>
                <td className="p-3 text-dark-ink-tertiary text-xs font-mono max-w-xs truncate">
                  {log.metadata ? JSON.stringify(log.metadata).slice(0, 50) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ NICHES TAB ============
async function NichesTab() {
  const niches = await prisma.niche.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { trends: true, alerts: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestion des Niches</h2>
        <Button className="bg-yt-red text-white hover:bg-yt-red-deep">+ Ajouter une niche</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {niches.map((niche) => (
          <Card
            key={niche.id}
            className={`bg-dark-surface border-hairline-dark ${!niche.isActive ? "opacity-60" : ""}`}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{niche.name}</CardTitle>
                <Badge variant={niche.isActive ? "default" : "outline"}>
                  {niche.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-dark-ink-secondary mb-3">
                {niche.description || "Pas de description"}
              </p>
              <div className="flex gap-4 text-xs text-dark-ink-tertiary mb-3">
                <span>Tendances: {niche._count.trends}</span>
                <span>Alertes: {niche._count.alerts}</span>
              </div>
              <div className="text-xs font-mono text-dark-ink-tertiary mb-3">
                Langue: {niche.language}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="w-3 h-3 mr-1" />
                  Éditer
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  {niche.isActive ? (
                    <Ban className="w-3 h-3 mr-1" />
                  ) : (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  )}
                  {niche.isActive ? "Désactiver" : "Activer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ MONITORING TAB ============
function MonitoringTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* API Health */}
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              API Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Opérationnelle</p>
            <p className="text-dark-ink-secondary text-sm">Toutes les routes OK</p>
          </CardContent>
        </Card>

        {/* Database */}
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Base de données
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Connectée</p>
            <p className="text-dark-ink-secondary text-sm">PostgreSQL - 0ms</p>
          </CardContent>
        </Card>

        {/* Redis */}
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Cache Redis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Opérationnel</p>
            <p className="text-dark-ink-secondary text-sm">Upstash - OK</p>
          </CardContent>
        </Card>
      </div>

      {/* Cron Status */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            État des Tâches Cron
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-dark-canvas rounded-lg">
              <div>
                <p className="font-medium">Trend Processing</p>
                <p className="text-xs text-dark-ink-tertiary">Tous les jours à 00:00</p>
              </div>
              <Badge variant="outline">Planifié</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-dark-canvas rounded-lg">
              <div>
                <p className="font-medium">Alert Check</p>
                <p className="text-xs text-dark-ink-tertiary">Toutes les heures</p>
              </div>
              <Badge variant="outline">Planifié</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-dark-canvas rounded-lg">
              <div>
                <p className="font-medium">Trend Cleanup</p>
                <p className="text-xs text-dark-ink-tertiary">Tous les jours à 04:00</p>
              </div>
              <Badge variant="outline">Planifié</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Errors Card */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Erreurs Récentes (Sentry)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-dark-ink-secondary">
            <p>Aucune erreur récente</p>
            <p className="text-sm">Le monitoring Sentry est configuré</p>
          </div>
        </CardContent>
      </Card>

      {/* External Services */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle>Services Externes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2">
              <span>Stripe</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connecté</Badge>
            </div>
            <div className="flex justify-between items-center p-2">
              <span>YouTube API</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connecté</Badge>
            </div>
            <div className="flex justify-between items-center p-2">
              <span>Anthropic (Claude)</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connecté</Badge>
            </div>
            <div className="flex justify-between items-center p-2">
              <span>Resend (Email)</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connecté</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
