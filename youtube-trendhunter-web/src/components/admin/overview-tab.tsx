"use client";

import { useEffect, useState } from "react";
import { Users, CreditCard, BarChart3, TrendingUp, Bell, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdmin } from "@/components/admin/fetch-admin";

// ============================================
// OverviewTab — stat cards + plan breakdown
// (données réelles via GET /api/admin/stats)
// ============================================

interface AdminStats {
  stats: {
    totalUsers: number;
    totalSubscriptions: number;
    proCount: number;
    teamCount: number;
    freeCount: number;
    totalTrends: number;
    activeAlerts: number;
    mrr: number;
    totalNiches?: number;
  };
}

export function OverviewTab() {
  const [data, setData] = useState<AdminStats["stats"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdmin<AdminStats>("/api/admin/stats")
      .then((res) => {
        if (!cancelled) setData(res.stats);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="bg-dark-surface border-hairline-dark">
        <CardContent className="p-6 text-sm text-yt-red">
          Impossible de charger les statistiques : {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="bg-dark-surface border-hairline-dark animate-pulse">
            <CardContent className="p-6 h-28" />
          </Card>
        ))}
      </div>
    );
  }

  const freeCount =
    data.freeCount ?? Math.max(0, data.totalSubscriptions - data.proCount - data.teamCount);

  const statCards = [
    { title: "Total Utilisateurs", value: data.totalUsers, icon: Users, color: "text-blue-400" },
    {
      title: "Abonnés Actifs",
      value: data.totalSubscriptions,
      icon: CreditCard,
      color: "text-green-400",
    },
    {
      title: "MRR Estimé",
      value: `${data.mrr}€`,
      icon: BarChart3,
      color: "text-yellow-400",
    },
    {
      title: "Tendances Actives",
      value: data.totalTrends,
      icon: TrendingUp,
      color: "text-purple-400",
    },
    { title: "Alertes Actives", value: data.activeAlerts, icon: Bell, color: "text-red-400" },
    { title: "Niches", value: data.totalNiches ?? "-", icon: Database, color: "text-cyan-400" },
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
            <p className="text-3xl font-black">{freeCount}</p>
            <p className="text-dark-ink-secondary text-sm">Utilisateurs sans abonnement</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-green-400">Plan Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-green-400">{data.proCount}</p>
            <p className="text-dark-ink-secondary text-sm">15€/mois • Accès complet</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardHeader>
            <CardTitle className="text-purple-400">Plan Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-black text-purple-400">{data.teamCount}</p>
            <p className="text-dark-ink-secondary text-sm">39€/mois • Équipes</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
