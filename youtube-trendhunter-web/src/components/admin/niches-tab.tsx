"use client";

import { useEffect, useState } from "react";
import { Settings, Ban, CheckCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdmin } from "@/components/admin/fetch-admin";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";

// ============================================
// NichesTab — CRUD niches (routes API admin)
// ============================================

interface AdminNiche {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  keywords: string[];
  language: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { trends?: number; alerts?: number };
}

interface NichesResponse {
  niches: AdminNiche[];
}

const EMPTY_FORM = { name: "", slug: "", description: "", keywords: "", language: "fr" };

export function NichesTab() {
  const [niches, setNiches] = useState<AdminNiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal ajout/édition
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminNiche | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation suppression
  const [nicheToDelete, setNicheToDelete] = useState<AdminNiche | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetchAdmin<NichesResponse>("/api/admin/niches");
        if (cancelled) return;
        setNiches(res.niches);
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
  }, [refreshKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (niche: AdminNiche) => {
    setEditing(niche);
    setForm({
      name: niche.name,
      slug: niche.slug,
      description: niche.description || "",
      keywords: (niche.keywords || []).join(", "),
      language: niche.language,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        keywords: form.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        language: form.language,
      };
      if (editing) {
        await fetchAdmin(`/api/admin/niches/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchAdmin("/api/admin/niches", {
          method: "POST",
          body: JSON.stringify(payload),
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

  const handleToggle = async (niche: AdminNiche) => {
    try {
      await fetchAdmin(`/api/admin/niches/${niche.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !niche.isActive }),
      });
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  const handleDelete = async () => {
    if (!nicheToDelete) return;
    setDeleting(true);
    try {
      await fetchAdmin(`/api/admin/niches/${nicheToDelete.id}`, { method: "DELETE" });
      setNicheToDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setNicheToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestion des Niches</h2>
        <Button className="bg-yt-red text-white hover:bg-yt-red-deep" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Ajouter une niche
        </Button>
      </div>

      {error && (
        <div className="text-sm text-yt-red bg-dark-surface border border-hairline-dark p-3">
          Erreur : {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-dark-surface border-hairline-dark animate-pulse">
              <CardContent className="p-6 h-44" />
            </Card>
          ))}
        </div>
      ) : niches.length === 0 ? (
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-8 text-center text-dark-ink-tertiary text-sm">
            Aucune niche. Cliquez sur « Ajouter une niche » pour commencer.
          </CardContent>
        </Card>
      ) : (
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
                  <span>Tendances: {niche._count?.trends ?? 0}</span>
                  <span>Alertes: {niche._count?.alerts ?? 0}</span>
                </div>
                <div className="text-xs font-mono text-dark-ink-tertiary mb-3">
                  Langue: {niche.language}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(niche)}
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Éditer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleToggle(niche)}
                  >
                    {niche.isActive ? (
                      <Ban className="w-3 h-3 mr-1" />
                    ) : (
                      <CheckCircle className="w-3 h-3 mr-1" />
                    )}
                    {niche.isActive ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-yt-red hover:text-yt-red"
                    onClick={() => setNicheToDelete(niche)}
                    aria-label={`Supprimer ${niche.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Ajout / Édition */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Éditer la niche" : "Ajouter une niche"}
        >
          <div className="relative bg-dark-surface border border-hairline-dark rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-dark-ink mb-4">
              {editing ? "Éditer la niche" : "Ajouter une niche"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Nom</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Tech & IA"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Slug</label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="Ex: tech-ia"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description de la niche"
                  className="bg-dark-overlay border-hairline-dark"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">
                  Mots-clés (séparés par des virgules)
                </label>
                <Input
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="IA, Programmation"
                  className="bg-dark-overlay border-hairline-dark"
                />
              </div>
              <div>
                <label className="text-sm text-dark-ink-secondary block mb-1">Langue</label>
                <Input
                  value={form.language}
                  onChange={(e) =>
                    setForm({ ...form, language: e.target.value.toLowerCase().slice(0, 2) })
                  }
                  placeholder="fr"
                  maxLength={2}
                  className="bg-dark-overlay border-hairline-dark w-20"
                />
              </div>

              {formError && <div className="text-sm text-yt-red">{formError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.slug}
                  className="bg-yt-red text-white hover:bg-yt-red-deep"
                >
                  {saving ? "…" : editing ? "Enregistrer" : "Créer"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!nicheToDelete}
        title="Supprimer la niche ?"
        message={
          nicheToDelete
            ? `Supprimer définitivement « ${nicheToDelete.name} » ? Ses tendances et abonnements utilisateurs seront également supprimés.`
            : ""
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setNicheToDelete(null)}
      />
    </div>
  );
}
