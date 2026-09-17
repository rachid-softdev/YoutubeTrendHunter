"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { fetchAdmin } from "@/components/admin/fetch-admin";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";

// ============================================
// OverridesTab — entitlement overrides
// (GET/POST /api/admin/overrides, DELETE /api/admin/overrides/:id)
// ============================================

interface AdminOverride {
  id: string;
  scope: "ORG" | "USER";
  scopeId: string;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  configJson: unknown;
  expiresAt: string | null;
  reason: string;
  createdAt: string;
}

interface OverridesResponse {
  data: AdminOverride[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const EMPTY_FORM = {
  scope: "ORG",
  scopeId: "",
  featureKey: "",
  enabled: true,
  limitValue: "",
  configJson: "{}",
  expiresAt: "",
  reason: "",
};

export function OverridesTab() {
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [overrideToDelete, setOverrideToDelete] = useState<AdminOverride | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (scopeFilter !== "all") params.set("scope", scopeFilter);
        const res = await fetchAdmin<OverridesResponse>(
          `/api/admin/overrides?${params.toString()}`,
        );
        if (cancelled) return;
        setOverrides(res.data);
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
  }, [scopeFilter, refreshKey]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setFormError(null);

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = form.configJson.trim() ? JSON.parse(form.configJson) : {};
    } catch {
      setFormError("Le champ configJson contient un JSON invalide.");
      setSaving(false);
      return;
    }

    try {
      await fetchAdmin("/api/admin/overrides", {
        method: "POST",
        body: JSON.stringify({
          scope: form.scope,
          scopeId: form.scopeId,
          featureKey: form.featureKey,
          enabled: form.enabled,
          limitValue: form.limitValue ? Number(form.limitValue) : null,
          configJson: parsedConfig,
          expiresAt: form.expiresAt || undefined,
          reason: form.reason,
        }),
      });
      setFormOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!overrideToDelete) return;
    setDeleting(true);
    try {
      await fetchAdmin(`/api/admin/overrides/${overrideToDelete.id}`, { method: "DELETE" });
      setOverrideToDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setOverrideToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">Overrides d&apos;entitlements</h2>
          <p className="text-sm text-dark-ink-tertiary">
            Dérogations par organisation ou utilisateur (audit trail requis)
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="w-36"
            aria-label="Filtrer par portée"
          >
            <option value="all">Tous</option>
            <option value="ORG">ORG</option>
            <option value="USER">USER</option>
          </Select>
          <Button className="bg-yt-red text-white hover:bg-yt-red-deep" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Créer
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-yt-red bg-dark-surface border border-hairline-dark p-3">
          Erreur : {error}
        </div>
      )}

      {loading ? (
        <p className="text-dark-ink-tertiary text-sm">Chargement…</p>
      ) : overrides.length === 0 ? (
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-8 text-center text-dark-ink-tertiary text-sm">
            Aucun override.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-hairline-dark">
              <tr className="text-left">
                <th className="p-3 font-medium">Scope</th>
                <th className="p-3 font-medium">scopeId</th>
                <th className="p-3 font-medium">Feature</th>
                <th className="p-3 font-medium">État</th>
                <th className="p-3 font-medium">Limit</th>
                <th className="p-3 font-medium">Expire</th>
                <th className="p-3 font-medium">Motif</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
                >
                  <td className="p-3">
                    <Badge variant={o.scope === "ORG" ? "default" : "outline"}>{o.scope}</Badge>
                  </td>
                  <td className="p-3 font-mono text-xs">{o.scopeId}</td>
                  <td className="p-3 font-mono text-xs">{o.featureKey}</td>
                  <td className="p-3">
                    <Badge variant={o.enabled ? "default" : "destructive"}>
                      {o.enabled ? "Activé" : "Désactivé"}
                    </Badge>
                  </td>
                  <td className="p-3">{o.limitValue ?? "-"}</td>
                  <td className="p-3 text-xs text-dark-ink-tertiary">
                    {o.expiresAt ? new Date(o.expiresAt).toLocaleDateString("fr-FR") : "-"}
                  </td>
                  <td
                    className="p-3 text-xs text-dark-ink-tertiary max-w-[200px] truncate"
                    title={o.reason}
                  >
                    {o.reason}
                  </td>
                  <td className="p-3">
                    <button
                      className="p-1 hover:text-yt-red"
                      title="Supprimer"
                      onClick={() => setOverrideToDelete(o)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Création */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Créer un override"
        >
          <div className="relative bg-dark-surface border border-hairline-dark rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-dark-ink mb-4">Créer un override</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Scope</label>
                  <Select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  >
                    <option value="ORG">ORG</option>
                    <option value="USER">USER</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Feature key</label>
                  <Input
                    value={form.featureKey}
                    onChange={(e) => setForm({ ...form, featureKey: e.target.value })}
                    placeholder="Ex: advanced_analytics"
                    className="bg-dark-overlay border-hairline-dark"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">scopeId</label>
                <Input
                  value={form.scopeId}
                  onChange={(e) => setForm({ ...form, scopeId: e.target.value })}
                  placeholder="ID de l'organisation ou de l'utilisateur"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Activé</label>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    className="w-4 h-4"
                    aria-label="Override activé"
                  />
                </div>
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">
                    Limit value (optionnel)
                  </label>
                  <Input
                    type="number"
                    value={form.limitValue}
                    onChange={(e) => setForm({ ...form, limitValue: e.target.value })}
                    className="bg-dark-overlay border-hairline-dark"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">
                  configJson (optionnel)
                </label>
                <Input
                  value={form.configJson}
                  onChange={(e) => setForm({ ...form, configJson: e.target.value })}
                  className="bg-dark-overlay border-hairline-dark font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">
                  Expiration (optionnel)
                </label>
                <Input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">
                  Motif (audit trail) *
                </label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Motif (audit trail)"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>

              {formError && <div className="text-sm text-yt-red">{formError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving || !form.scopeId || !form.featureKey || !form.reason}
                  className="bg-yt-red text-white hover:bg-yt-red-deep"
                >
                  {saving ? "…" : "Créer"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!overrideToDelete}
        title="Supprimer l'override ?"
        message={
          overrideToDelete
            ? `Supprimer l'override de « ${overrideToDelete.featureKey} » (${overrideToDelete.scope}: ${overrideToDelete.scopeId}) ?`
            : ""
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setOverrideToDelete(null)}
      />
    </div>
  );
}
