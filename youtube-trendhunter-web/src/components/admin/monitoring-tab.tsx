"use client";

// ============================================
// Monitoring Dashboard Tab — live RED metrics
// ============================================

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────

interface MetricPoint {
  count: number;
  errors: number;
  totalDuration: number;
  lastMinute: number;
}

interface EnrichedMetricPoint extends MetricPoint {
  p50: number;
  p95: number;
  p99: number;
  statusCodes: Record<number, number>;
  errorRate: number;
  avgDuration: number;
}

interface EnrichedStats {
  endpoints: Record<string, EnrichedMetricPoint>;
  totals: {
    requests: number;
    errors: number;
    errorRate: number;
    byStatus: Record<string, number>;
  };
  rateHistory: { minutes: string[]; counts: number[] };
  collectedAt?: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const POLL_INTERVAL = 5000; // 5 seconds

// ── React Component ────────────────────────────────────────────────────

export default function MonitoringTab() {
  const [stats, setStats] = useState<EnrichedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingSSE, setUsingSSE] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const handleData = useCallback((data: EnrichedStats) => {
    setStats(data);
    setLoading(false);
    setError(null);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setLoading(false);
  }, []);

  // ── Setup SSE or polling ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    // Try SSE first
    if (typeof EventSource !== "undefined") {
      const es = new EventSource("/api/admin/monitoring/stream");
      sseRef.current = es;

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data) as EnrichedStats;
          handleData(data);
          setUsingSSE(true);
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        // SSE failed — fall back to polling
        if (cancelled) return;
        es.close();
        sseRef.current = null;
        setUsingSSE(false);
        startPolling();
      };
    } else {
      // EventSource not available — poll directly
      startPolling();
    }

    function startPolling() {
      if (cancelled) return;

      // Fetch immediately
      fetchMonitoringData();

      // Then poll every 5 seconds
      pollTimerRef.current = setInterval(() => {
        if (!cancelled) fetchMonitoringData();
      }, POLL_INTERVAL);
    }

    async function fetchMonitoringData() {
      try {
        const res = await fetch("/api/admin/monitoring");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as EnrichedStats;
        if (!cancelled) handleData(data);
      } catch (err) {
        if (!cancelled) {
          handleError(err instanceof Error ? err.message : "Erreur de chargement");
        }
      }
    }

    // Initial fetch if polling (SSE sends immediately on connect)
    // (already handled by EventSource onmessage for SSE)

    return () => {
      cancelled = true;
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [handleData, handleError]);

  // ── Derived values ──────────────────────────────────────────────────

  const endpointEntries = stats
    ? Object.entries(stats.endpoints).sort(([, a], [, b]) => b.count - a.count)
    : [];

  const maxRateCount = stats ? Math.max(...stats.rateHistory.counts, 1) : 1;

  const statusTotal =
    stats &&
    stats.totals.byStatus["2xx"] + stats.totals.byStatus["4xx"] + stats.totals.byStatus["5xx"];

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-20 text-dark-ink-secondary">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-yt-red border-t-transparent rounded-full animate-spin" />
            <span>Chargement du monitoring…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="space-y-6">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-8 text-center">
            <p className="text-red-400 mb-2">Erreur de chargement</p>
            <p className="text-sm text-dark-ink-secondary">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-8 text-center">
            <p className="text-dark-ink-secondary">Aucune donnée de monitoring disponible.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: status badges */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className={
            usingSSE
              ? "border-green-500/30 text-green-400 bg-green-500/10"
              : "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
          }
        >
          {usingSSE ? "Temps réel (SSE)" : "Polling 5s"}
        </Badge>
        <span className="text-xs text-dark-ink-tertiary">
          Dernière mise à jour :{" "}
          {stats.collectedAt ? new Date(stats.collectedAt).toLocaleTimeString("fr-FR") : "—"}
        </span>
      </div>

      {/* Totals cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-4">
            <p className="text-2xl font-black">{stats.totals.requests}</p>
            <p className="text-xs text-dark-ink-secondary">Requêtes totales</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-4">
            <p className="text-2xl font-black text-red-400">{stats.totals.errors}</p>
            <p className="text-xs text-dark-ink-secondary">Erreurs</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-4">
            <p className="text-2xl font-black">{stats.totals.errorRate.toFixed(1)}%</p>
            <p className="text-xs text-dark-ink-secondary">Taux d&apos;erreur</p>
          </CardContent>
        </Card>
        <Card className="bg-dark-surface border-hairline-dark">
          <CardContent className="p-4">
            <p className="text-2xl font-black">
              {stats.totals.byStatus["2xx"] || 0} / {stats.totals.byStatus["4xx"] || 0} /{" "}
              {stats.totals.byStatus["5xx"] || 0}
            </p>
            <p className="text-xs text-dark-ink-secondary">2xx / 4xx / 5xx</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar Chart: request rate over last 5 minutes */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Requêtes / minute (5 dernières minutes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between h-32 gap-2">
            {stats.rateHistory.minutes.map((minute, idx) => {
              const count = stats.rateHistory.counts[idx];
              const height = (count / maxRateCount) * 100;
              return (
                <div key={minute} className="flex flex-col items-center flex-1">
                  <span className="text-xs font-medium mb-1">{count}</span>
                  <div
                    className="w-full bg-yt-red/70 hover:bg-yt-red transition-colors rounded-t"
                    style={{
                      height: `${Math.max(height, 4)}%`,
                      minHeight: count > 0 ? "4px" : "0",
                    }}
                  />
                  <span className="text-xs text-dark-ink-tertiary mt-2">{minute}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Status codes bar */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Répartition des statuts HTTP</CardTitle>
        </CardHeader>
        <CardContent>
          {statusTotal && statusTotal > 0 ? (
            <div className="space-y-2">
              <div className="flex h-6 rounded-full overflow-hidden">
                <div
                  className="bg-green-600 transition-all"
                  style={{
                    width: `${((stats.totals.byStatus["2xx"] || 0) / statusTotal) * 100}%`,
                  }}
                  title={`2xx: ${stats.totals.byStatus["2xx"] || 0}`}
                />
                <div
                  className="bg-yellow-500 transition-all"
                  style={{
                    width: `${((stats.totals.byStatus["4xx"] || 0) / statusTotal) * 100}%`,
                  }}
                  title={`4xx: ${stats.totals.byStatus["4xx"] || 0}`}
                />
                <div
                  className="bg-red-600 transition-all"
                  style={{
                    width: `${((stats.totals.byStatus["5xx"] || 0) / statusTotal) * 100}%`,
                  }}
                  title={`5xx: ${stats.totals.byStatus["5xx"] || 0}`}
                />
              </div>
              <div className="flex gap-4 text-xs text-dark-ink-secondary">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-600" /> 2xx :{" "}
                  {stats.totals.byStatus["2xx"] || 0}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" /> 4xx :{" "}
                  {stats.totals.byStatus["4xx"] || 0}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600" /> 5xx :{" "}
                  {stats.totals.byStatus["5xx"] || 0}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-dark-ink-secondary">Aucune donnée</p>
          )}
        </CardContent>
      </Card>

      {/* Endpoint table */}
      <Card className="bg-dark-surface border-hairline-dark">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Points de terminaison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {endpointEntries.length === 0 ? (
            <div className="p-6 text-center text-dark-ink-secondary text-sm">
              Aucun endpoint suivi pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-hairline-dark">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Endpoint</th>
                    <th className="p-3 font-medium text-right">Requêtes</th>
                    <th className="p-3 font-medium text-right">Erreurs</th>
                    <th className="p-3 font-medium text-right">Taux err.</th>
                    <th className="p-3 font-medium text-right">Moy. (ms)</th>
                    <th className="p-3 font-medium text-right">P50 (ms)</th>
                    <th className="p-3 font-medium text-right">P95 (ms)</th>
                    <th className="p-3 font-medium text-right">P99 (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {endpointEntries.map(([endpoint, ep]) => (
                    <tr
                      key={endpoint}
                      className="border-b border-hairline-dark/50 hover:bg-dark-surface/50"
                    >
                      <td className="p-3 font-mono text-xs max-w-[300px] truncate" title={endpoint}>
                        {endpoint}
                      </td>
                      <td className="p-3 text-right">{ep.count}</td>
                      <td className="p-3 text-right">
                        <span className={ep.errors > 0 ? "text-red-400" : ""}>{ep.errors}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={ep.errorRate > 5 ? "text-red-400" : ""}>
                          {ep.errorRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {ep.avgDuration.toFixed(0)}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{ep.p50.toFixed(0)}</td>
                      <td className="p-3 text-right font-mono text-xs">{ep.p95.toFixed(0)}</td>
                      <td className="p-3 text-right font-mono text-xs">{ep.p99.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
