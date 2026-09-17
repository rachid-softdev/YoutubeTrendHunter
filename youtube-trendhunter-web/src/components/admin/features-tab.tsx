"use client";

import { useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdmin } from "@/components/admin/fetch-admin";

// ============================================
// FeaturesTab — CRUD features (routes API)
// ============================================

interface AdminFeature {
  key: string;
  name: string;
  description: string | null;
  type: string;
  defaultConfig: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FeaturesResponse {
  data: AdminFeature[];
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
  key: "",
  name: "",
  description: "",
  type: "BOOLEAN",
  defaultConfig: "{}",
  isActive: true,
};

export function FeaturesTab() {
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminFeature | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (filterType !== "all") params.set("type", filterType);
        const res = await fetchAdmin<FeaturesResponse>(`/api/admin/features?${params.toString()}`);
        if (cancelled) return;
        setFeatures(res.data);
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
  }, [filterType, refreshKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (feature: AdminFeature) => {
    setEditing(feature);
    setForm({
      key: feature.key,
      name: feature.name,
      description: feature.description || "",
      type: feature.type,
      defaultConfig: JSON.stringify(feature.defaultConfig ?? {}, null, 2),
      isActive: feature.isActive,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);

    // Validate JSON config
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = form.defaultConfig.trim() ? JSON.parse(form.defaultConfig) : {};
    } catch {
      setFormError("Le champ defaultConfig contient un JSON invalide.");
      setSaving(false);
      return;
    }

    try {
      if (editing) {
        await fetchAdmin(`/api/admin/features/${editing.key}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            description: form.description || undefined,
            type: form.type,
            defaultConfig: parsedConfig,
            isActive: form.isActive,
          }),
        });
      } else {
        await fetchAdmin("/api/admin/features", {
          method: "POST",
          body: JSON.stringify({
            key: form.key,
            name: form.name,
            description: form.description || undefined,
            type: form.type,
            defaultConfig: parsedConfig,
            isActive: form.isActive,
          }),
        });
      }
      setFormOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (feature: AdminFeature) => {
    try {
      await fetchAdmin(`/api/admin/features/${feature.key}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !feature.isActive }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
        <h2 className="text-xl font-bold">Features (Feature Flags)</h2>
        <div className="flex gap-2 items-center">
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-40"
            aria-label="Filtrer par type"
          >
            <option value="all">Tous les types</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="LIMIT">LIMIT</option>
            <option value="EXPERIMENT">EXPERIMENT</option>
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
      ) : features.length === 0 ? (
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-8 text-center text-dark-ink-tertiary text-sm">
            Aucune feature.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Card key={feature.key} className="bg-dark-surface border-hairline-dark">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{feature.name}</CardTitle>
                    <p className="text-xs font-mono text-dark-ink-tertiary">{feature.key}</p>
                  </div>
                  <Badge variant={feature.isActive ? "default" : "outline"}>
                    {feature.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <Badge variant="outline">{feature.type}</Badge>
                </div>
                <p className="text-sm text-dark-ink-secondary mb-3 line-clamp-2">
                  {feature.description || "Pas de description"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(feature)}
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Éditer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleToggle(feature)}
                  >
                    {feature.isActive ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Création / Édition */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Éditer la feature" : "Créer une feature"}
        >
          <div className="relative bg-dark-surface border border-hairline-dark rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-dark-ink mb-4">
              {editing ? `Éditer : ${editing.key}` : "Créer une feature"}
            </h3>

            <div className="space-y-4">
              {!editing && (
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Key</label>
                  <Input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value })}
                    placeholder="Ex: advanced_analytics"
                    className="bg-dark-overlay border-hairline-dark"
                  />
                </div>
              )}
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Nom</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Analytics avancés"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="bg-dark-overlay border-hairline-dark"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Type</label>
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="LIMIT">LIMIT</option>
                  <option value="EXPERIMENT">EXPERIMENT</option>
                </Select>
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">
                  defaultConfig (JSON)
                </label>
                <Textarea
                  value={form.defaultConfig}
                  onChange={(e) => setForm({ ...form, defaultConfig: e.target.value })}
                  className="bg-dark-overlay border-hairline-dark font-mono text-xs"
                  rows={4}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4"
                  aria-label="Feature active"
                />
                <label className="text-sm text-dark-ink-secondary">Active</label>
              </div>

              {formError && <div className="text-sm text-yt-red">{formError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.key || !form.name}
                  className="bg-yt-red text-white hover:bg-yt-red-deep"
                >
                  {saving ? "…" : editing ? "Enregistrer" : "Créer"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
