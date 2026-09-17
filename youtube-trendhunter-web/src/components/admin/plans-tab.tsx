"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { fetchAdmin } from "@/components/admin/fetch-admin";

// ============================================
// PlansTab — plans + features attachées
// (GET /api/admin/plans, GET/POST /api/admin/plans/:planKey/features)
// ============================================

interface AdminPlan {
  id: string;
  key: string;
  name: string;
  price: number;
  sortOrder: number;
  isActive?: boolean;
}

interface PlanFeature {
  id: string;
  planId: string;
  featureId: string;
  enabled: boolean;
  limitValue: number | null;
  configJson: unknown;
  downgradeStrategy: string;
  sortOrder: number;
  feature: {
    key: string;
    name: string;
    type: string;
    isActive: boolean;
  };
}

interface PlanFeaturesResponse {
  data: PlanFeature[];
}

interface FeaturesResponse {
  data: Array<{ key: string; name: string; type: string; isActive: boolean }>;
}

export function PlansTab() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [planFeatures, setPlanFeatures] = useState<Record<string, PlanFeature[]>>({});
  const [features, setFeatures] = useState<FeaturesResponse["data"]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [attachFeature, setAttachFeature] = useState("");
  const [attachEnabled, setAttachEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachMsg, setAttachMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetchAdmin<{ data: AdminPlan[] }>("/api/admin/plans?limit=100");
        if (cancelled) return;
        setPlans(res.data);
        setSelectedPlan((prev) => prev || res.data[0]?.key || "");
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    fetchAdmin<FeaturesResponse>("/api/admin/features?limit=100")
      .then((res) => setFeatures(res.data))
      .catch(() => setFeatures([]));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedPlan) return;
    let cancelled = false;
    async function fetchFeatures() {
      try {
        const res = await fetchAdmin<PlanFeaturesResponse>(
          `/api/admin/plans/${selectedPlan}/features`,
        );
        if (cancelled) return;
        setPlanFeatures((prev) => ({ ...prev, [selectedPlan]: res.data }));
      } catch {
        if (cancelled) return;
        setPlanFeatures((prev) => ({ ...prev, [selectedPlan]: [] }));
      }
    }
    void fetchFeatures();
    return () => {
      cancelled = true;
    };
  }, [selectedPlan, refreshKey]);

  const handleAttach = async () => {
    if (!selectedPlan || !attachFeature) return;
    setAttachMsg(null);
    try {
      await fetchAdmin(`/api/admin/plans/${selectedPlan}/features`, {
        method: "POST",
        body: JSON.stringify({ featureKey: attachFeature, enabled: attachEnabled }),
      });
      setAttachFeature("");
      setAttachEnabled(true);
      setAttachMsg("Feature attachée au plan.");
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setAttachMsg(err instanceof Error ? err.message : "Erreur lors de l'attachement");
    }
  };

  const availableFeatures = features.filter(
    (f) => !(planFeatures[selectedPlan] || []).some((pf) => pf.feature.key === f.key),
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Plan et Features</h2>

      {error && (
        <div className="text-sm text-yt-red bg-dark-surface border border-hairline-dark p-3">
          Erreur : {error}
        </div>
      )}

      {loading ? (
        <p className="text-dark-ink-tertiary text-sm">Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <Card key={plan.id} className="bg-dark-surface border-hairline-dark">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge variant={plan.isActive === false ? "outline" : "default"}>
                      {plan.key}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-black mb-2">
                    {plan.price}€ <span className="text-sm text-dark-ink-tertiary">/mois</span>
                  </p>
                  <p className="text-xs text-dark-ink-tertiary mb-3">
                    Sort order : {plan.sortOrder}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(planFeatures[plan.key] || []).map((pf) => (
                      <Badge key={pf.id} variant={pf.enabled ? "default" : "outline"}>
                        {pf.feature.name}
                      </Badge>
                    ))}
                    {(planFeatures[plan.key] || []).length === 0 && (
                      <span className="text-xs text-dark-ink-tertiary">Aucune feature</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Attacher une feature */}
          <Card className="bg-dark-surface border-hairline-dark">
            <CardHeader>
              <CardTitle>Attacher une feature à un plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Plan</label>
                  <Select
                    value={selectedPlan}
                    onChange={(e) => {
                      setSelectedPlan(e.target.value);
                      setAttachMsg(null);
                    }}
                  >
                    {plans.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Feature</label>
                  <Select value={attachFeature} onChange={(e) => setAttachFeature(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {availableFeatures.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                    {availableFeatures.length === 0 && (
                      <option value="" disabled>
                        Toutes les features sont attachées
                      </option>
                    )}
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-dark-ink-secondary block mb-1">Activée</label>
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      checked={attachEnabled}
                      onChange={(e) => setAttachEnabled(e.target.checked)}
                      className="w-4 h-4"
                      aria-label="Feature activée sur le plan"
                    />
                    <Button
                      onClick={handleAttach}
                      disabled={!selectedPlan || !attachFeature}
                      className="bg-yt-red text-white hover:bg-yt-red-deep"
                    >
                      Attacher
                    </Button>
                  </div>
                </div>
              </div>
              {attachMsg && <p className="text-sm text-dark-ink-secondary">{attachMsg}</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
