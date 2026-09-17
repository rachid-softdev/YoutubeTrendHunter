"use client";

import { useEffect, useState } from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchAdmin } from "@/components/admin/fetch-admin";

// ============================================
// LogsTab — journal d'audit (GET /api/admin/logs)
// Filtre par action, pagination, export CSV client
// ============================================

interface AdminLog {
  id: string;
  userId: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { email: string; name: string | null } | null;
}

interface LogsResponse {
  data: AdminLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const ACTION_OPTIONS = [
  "USER_SIGNUP",
  "USER_LOGIN",
  "USER_LOGOUT",
  "PLAN_UPGRADE",
  "PLAN_DOWNGRADE",
  "SUBSCRIPTION_CANCEL",
  "SUBSCRIPTION_REACTIVATE",
  "API_TOKEN_CREATE",
  "API_TOKEN_DELETE",
  "ALERT_CREATE",
  "ALERT_DELETE",
  "DATA_EXPORT",
  "ACCOUNT_DELETE",
  "NICHE_SELECT",
  "NICHE_DESELECT",
  "CRON_TRENDS_PROCESSED",
];

export function LogsTab() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [pagination, setPagination] = useState<LogsResponse["pagination"] | null>(null);
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const params = new URLSearchParams({ page: String(page), limit: "50" });
        if (action !== "all") params.set("action", action);
        const res = await fetchAdmin<LogsResponse>(`/api/admin/logs?${params.toString()}`);
        if (cancelled) return;
        setLogs(res.data);
        setPagination(res.pagination);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, action]);

  const handleExport = () => {
    const rows = [
      ["date", "utilisateur", "action", "ip", "metadonnees"],
      ...logs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.user?.email || log.userId || "",
        log.action,
        log.ipAddress || "",
        log.metadata ? JSON.stringify(log.metadata) : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-dark-surface border border-hairline-dark rounded-lg text-sm text-dark-ink"
            aria-label="Filtrer par action"
          >
            <option value="all">Toutes les actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleExport}
          disabled={logs.length === 0}
        >
          <Download className="w-4 h-4" />
          Exporter
        </Button>
      </div>

      {error && (
        <div className="text-sm text-yt-red bg-dark-surface border border-hairline-dark p-3">
          Erreur : {error}
        </div>
      )}

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
            {loading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-dark-ink-tertiary">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-dark-ink-tertiary">
                  Aucun journal
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
                >
                  <td className="p-3 text-dark-ink-tertiary text-xs">
                    {new Date(log.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-3">
                    {log.userId === "system-cron" ? (
                      <Badge variant="outline">System</Badge>
                    ) : (
                      <span className="text-xs">{log.user?.email || log.userId}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        log.action.includes("CANCEL") || log.action.includes("DELETE")
                          ? "destructive"
                          : "outline"
                      }
                    >
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

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-dark-ink-tertiary">
            {pagination.total} entrées — page {pagination.page}/{pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrev || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" /> Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
