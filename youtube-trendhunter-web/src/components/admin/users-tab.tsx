"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAdmin } from "@/components/admin/fetch-admin";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";

// ============================================
// UsersTab — liste, recherche, pagination,
// export CSV et suppression (via routes API)
// ============================================

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  subscription: { plan: string; status: string } | null;
  _count: { apiTokens: number; alerts: number; auditLogs: number };
  userRoles?: Array<{ role: string }>;
}

interface UsersResponse {
  data: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

function formatPlanBadge(plan: string | undefined) {
  if (plan === "FREE" || !plan) return "outline";
  if (plan === "PRO") return "default";
  return "destructive";
}

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<UsersResponse["pagination"] | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce la recherche (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
        });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetchAdmin<UsersResponse>(`/api/admin/users?${params.toString()}`);
        if (cancelled) return;
        setUsers(res.data);
        setPagination(res.pagination);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, refreshKey]);

  const handleDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await fetchAdmin(`/api/admin/users/${userToDelete.id}`, { method: "DELETE" });
      setUserToDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setUserToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    // Ouvre l'export CSV dans un nouvel onglet (download direct)
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    window.open(`/api/admin/users/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-ink-tertiary" />
            <Input
              placeholder="Rechercher par email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 w-64 bg-dark-surface border-hairline-dark"
            />
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Exporter CSV
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
            {loading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-dark-ink-tertiary">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-dark-ink-tertiary">
                  Aucun utilisateur trouvé
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
                >
                  <td className="p-3 font-mono text-xs">{user.email}</td>
                  <td className="p-3">{user.name || "-"}</td>
                  <td className="p-3">
                    <Badge variant={formatPlanBadge(user.subscription?.plan)}>
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
                  <td className="p-3">{user._count?.alerts ?? 0}</td>
                  <td className="p-3 text-dark-ink-tertiary">
                    {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        className="p-1 hover:text-yt-red"
                        title="Supprimer"
                        onClick={() => setUserToDelete(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-dark-ink-tertiary">
            {pagination.total} utilisateurs — page {pagination.page}/{pagination.totalPages}
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

      <ConfirmDialog
        open={!!userToDelete}
        title="Supprimer l'utilisateur ?"
        message={
          userToDelete
            ? `Supprimer définitivement ${userToDelete.email} ? Toutes ses données (abonnement, alertes, tokens) seront supprimées.`
            : ""
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
