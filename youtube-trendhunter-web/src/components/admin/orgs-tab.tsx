"use client";

import { useState } from "react";
import { Search, RefreshCcw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdmin } from "@/components/admin/fetch-admin";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";

// ============================================
// OrgsTab — entitlements d'une organisation
// (GET entitlements, GET downgrade-preview, POST cache/invalidate)
// ============================================

interface EntitlementsResponse {
  planKey: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  experiments?: Record<string, { percentage: number; seed: string }>;
  usage: Record<string, number>;
  resetAt: Record<string, string>;
}

interface DowngradePreviewResponse {
  data?: {
    impacts?: Array<{
      featureKey: string;
      featureName: string;
      currentValue: boolean | number | null;
      newValue: boolean | number | null;
      strategy: string;
      action: string;
    }>;
    blockedFeatures?: Array<{ featureKey: string; reason: string }>;
    currentPlan?: string;
    targetPlan?: string;
  };
}

export function OrgsTab() {
  const [orgId, setOrgId] = useState("");
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DowngradePreviewResponse["data"] | null>(null);
  const [targetPlan, setTargetPlan] = useState("free");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cacheConfirm, setCacheConfirm] = useState(false);
  const [cacheMsg, setCacheMsg] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!orgId.trim()) return;
    setLoading(true);
    setError(null);
    setEntitlements(null);
    setPreview(null);
    try {
      const res = await fetchAdmin<EntitlementsResponse>(
        `/api/admin/orgs/${encodeURIComponent(orgId.trim())}/entitlements`,
      );
      setEntitlements(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await fetchAdmin<DowngradePreviewResponse>(
        `/api/admin/orgs/${encodeURIComponent(orgId.trim())}/downgrade-preview?targetPlan=${targetPlan}`,
      );
      setPreview(res.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleInvalidateCache = async () => {
    setCacheConfirm(false);
    setCacheMsg(null);
    try {
      await fetchAdmin(`/api/admin/cache/invalidate/${encodeURIComponent(orgId.trim())}`, {
        method: "POST",
      });
      setCacheMsg("Cache invalidé avec succès.");
    } catch (err: unknown) {
      setCacheMsg(err instanceof Error ? `Erreur : ${err.message}` : "Erreur inconnue");
    }
  };

  const featureEntries = entitlements
    ? Object.entries(entitlements.features).map(([key, enabled]) => ({
        key,
        enabled,
        limit: entitlements.limits[key] ?? null,
        usage: entitlements.usage[key] ?? null,
        resetAt: entitlements.resetAt[key] ?? null,
      }))
    : [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Organisations</h2>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-ink-tertiary" />
          <Input
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="ID de l'organisation (orgId)"
            className="pl-10 bg-dark-surface border-hairline-dark"
          />
        </div>
        <Button
          type="submit"
          disabled={!orgId.trim() || loading}
          className="bg-yt-red text-white hover:bg-yt-red-deep"
        >
          {loading ? "Chargement…" : "Rechercher"}
        </Button>
      </form>

      {error && (
        <div className="text-sm text-yt-red bg-dark-surface border border-hairline-dark p-3">
          Erreur : {error}
        </div>
      )}

      {entitlements && (
        <>
          <Card className="bg-dark-surface border-hairline-dark">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Entitlements</CardTitle>
                <Badge variant={entitlements.planKey === "FREE" ? "outline" : "default"}>
                  Plan : {entitlements.planKey}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {featureEntries.length === 0 ? (
                <p className="text-sm text-dark-ink-tertiary">Aucun entitlement.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-hairline-dark">
                      <tr className="text-left">
                        <th className="p-3 font-medium">Feature</th>
                        <th className="p-3 font-medium">Valeur</th>
                        <th className="p-3 font-medium">Usage / Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {featureEntries.map((f) => (
                        <tr
                          key={f.key}
                          className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
                        >
                          <td className="p-3 font-mono text-xs">{f.key}</td>
                          <td className="p-3">
                            <Badge variant={f.enabled ? "default" : "outline"}>
                              {f.enabled ? "Activé" : "Désactivé"}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-dark-ink-tertiary">
                            {f.limit === null
                              ? "-"
                              : `${f.usage ?? 0} / ${f.limit}${f.resetAt ? ` (reset ${new Date(f.resetAt).toLocaleDateString("fr-FR")})` : ""}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Downgrade preview */}
          <Card className="bg-dark-surface border-hairline-dark">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Preview Downgrade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 items-end">
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Plan cible</label>
                  <Select value={targetPlan} onChange={(e) => setTargetPlan(e.target.value)}>
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="team">team</option>
                  </Select>
                </div>
                <Button variant="outline" onClick={handlePreview} disabled={previewLoading}>
                  <RefreshCcw className="w-4 h-4" />
                  {previewLoading ? "Calcul…" : "Prévisualiser"}
                </Button>
              </div>

              {preview && (
                <div className="text-sm space-y-2">
                  {preview.impacts && preview.impacts.length > 0 ? (
                    preview.impacts.map((impact, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-dark-overlay p-2 border border-hairline-dark"
                      >
                        <span className="font-medium">{impact.featureName}</span>
                        <span className="text-dark-ink-tertiary">
                          {String(impact.currentValue)} → {String(impact.newValue)} ({impact.action}
                          )
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-dark-ink-tertiary">Aucun impact détecté.</p>
                  )}
                  {preview.blockedFeatures && preview.blockedFeatures.length > 0 && (
                    <div className="text-amber-400">
                      {preview.blockedFeatures.map((b, i) => (
                        <p key={i}>
                          {b.featureKey} : {b.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cache invalidation */}
          <Card className="bg-dark-surface border-hairline-dark">
            <CardHeader className="pb-2">
              <CardTitle>Cache</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="text-yt-red border-yt-red/40 hover:bg-yt-red/10"
                onClick={() => setCacheConfirm(true)}
              >
                Purger le cache
              </Button>
              {cacheMsg && <p className="text-sm text-dark-ink-secondary mt-2">{cacheMsg}</p>}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={cacheConfirm}
        title="Purger le cache ?"
        message={`Invalidation du cache d'entitlements de l'organisation ${orgId}. Action à impact production.`}
        confirmLabel="Purger"
        danger={false}
        onConfirm={handleInvalidateCache}
        onCancel={() => setCacheConfirm(false)}
      />
    </div>
  );
}
