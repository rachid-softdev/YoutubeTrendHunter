/**
 * RED metrics (Rate, Errors, Duration) observability collector.
 *
 * Singleton with in-memory per-endpoint counters that auto-flushes
 * to the log every 60 seconds and persists to Redis every 10 records.
 *
 * Usage (from proxy or route handlers):
 *   import { metrics } from "@/lib/observability";
 *   metrics.record("GET /api/trends", 142, 200);
 */

import redis from "@/lib/redis";

export interface MetricPoint {
  count: number;
  errors: number;
  totalDuration: number;
  lastMinute: number;
}

interface HistoryEntry {
  /** timestamp in ms */
  t: number;
  /** duration in ms */
  d: number;
  /** HTTP status code */
  s: number;
}

interface PersistedMetrics {
  metrics: Record<string, MetricPoint>;
  history: Record<string, HistoryEntry[]>;
  savedAt: string;
}

export interface EnrichedMetricPoint extends MetricPoint {
  p50: number;
  p95: number;
  p99: number;
  statusCodes: Record<number, number>;
  errorRate: number;
  avgDuration: number;
}

export interface EnrichedStats {
  endpoints: Record<string, EnrichedMetricPoint>;
  totals: {
    requests: number;
    errors: number;
    errorRate: number;
    byStatus: Record<string, number>;
  };
  /** per-minute request counts for the last 5 minutes */
  rateHistory: { minutes: string[]; counts: number[] };
}

export interface EndpointHistory {
  timestamps: number[];
  durations: number[];
  statusCodes: number[];
}

const REDIS_KEY = "metrics:snapshot";
const REDIS_TTL = 604_800; // 7 days
const PERSIST_INTERVAL = 10;
const MAX_HISTORY_PER_ENDPOINT = 2000;

class MetricsCollector {
  private metrics: Map<string, MetricPoint>;
  private history: Map<string, HistoryEntry[]>;
  private flushTimer: ReturnType<typeof setInterval> | null;
  private recordCount: number = 0;
  private loadedFromRedis: boolean = false;

  constructor() {
    this.metrics = new Map();
    this.history = new Map();
    this.flushTimer = null;
    this.startAutoFlush();
  }

  /**
   * Record a single request observation.
   *
   * @param endpoint  - Normalised endpoint key, e.g. "GET /api/trends"
   * @param durationMs - Response time in milliseconds
   * @param statusCode - HTTP status code returned
   */
  record(endpoint: string, durationMs: number, statusCode: number): void {
    const point = this.metrics.get(endpoint);
    const isError = statusCode >= 400;

    if (point) {
      point.count += 1;
      point.totalDuration += durationMs;
      if (isError) point.errors += 1;
    } else {
      this.metrics.set(endpoint, {
        count: 1,
        errors: isError ? 1 : 0,
        totalDuration: durationMs,
        lastMinute: Date.now(),
      });
    }

    // Track individual history entry for time-series analysis
    let entries = this.history.get(endpoint);
    if (!entries) {
      entries = [];
      this.history.set(endpoint, entries);
    }
    entries.push({ t: Date.now(), d: durationMs, s: statusCode });
    if (entries.length > MAX_HISTORY_PER_ENDPOINT) {
      entries.splice(0, entries.length - MAX_HISTORY_PER_ENDPOINT);
    }

    // Periodically persist to Redis (debounced — avoid writing on every request)
    this.recordCount++;
    if (this.recordCount % PERSIST_INTERVAL === 0) {
      this.persistToRedis().catch((err) => console.warn("[Metrics] Redis persist failed:", err));
    }
  }

  /**
   * Return a shallow copy of every metric point currently tracked.
   */
  getStats(): Record<string, MetricPoint> {
    const snapshot: Record<string, MetricPoint> = {};
    for (const [key, val] of this.metrics) {
      snapshot[key] = { ...val };
    }
    return snapshot;
  }

  /**
   * Return history entries for a specific endpoint within the last `minutes`.
   */
  getEndpointHistory(endpoint: string, minutes: number = 5): EndpointHistory {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const entries = this.history.get(endpoint) || [];
    const filtered = entries.filter((e) => e.t >= cutoff);

    return {
      timestamps: filtered.map((e) => e.t),
      durations: filtered.map((e) => e.d),
      statusCodes: filtered.map((e) => e.s),
    };
  }

  /**
   * Return history for all endpoints within the last `minutes`.
   */
  getAllEndpointHistory(minutes: number = 5): Record<string, EndpointHistory> {
    const result: Record<string, EndpointHistory> = {};
    for (const endpoint of this.history.keys()) {
      result[endpoint] = this.getEndpointHistory(endpoint, minutes);
    }
    return result;
  }

  /**
   * Compute a percentile from an unsorted array of numbers.
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Return enriched stats including latency percentiles and status code
   * breakdown, plus a per-minute request-rate history for the last 5 minutes.
   */
  getEnrichedStats(): EnrichedStats {
    const stats = this.getStats();
    const endpoints: Record<string, EnrichedMetricPoint> = {};

    let totalRequests = 0;
    let totalErrors = 0;
    const statusTotals: Record<string, number> = { "2xx": 0, "4xx": 0, "5xx": 0 };

    // Gather all timestamps across endpoints for rate history
    const allTimestamps: number[] = [];
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;

    for (const [endpoint, point] of Object.entries(stats)) {
      const hist = this.history.get(endpoint) || [];
      const durations = hist.map((e) => e.d);
      const statusCodes: Record<number, number> = {};

      for (const entry of hist) {
        statusCodes[entry.s] = (statusCodes[entry.s] || 0) + 1;
        if (entry.t >= fiveMinAgo) {
          allTimestamps.push(entry.t);
        }
      }

      // Status code family counts
      for (const code of Object.keys(statusCodes).map(Number)) {
        if (code >= 500) statusTotals["5xx"] += statusCodes[code];
        else if (code >= 400) statusTotals["4xx"] += statusCodes[code];
        else statusTotals["2xx"] += statusCodes[code];
      }

      const errorRate = point.count > 0 ? (point.errors / point.count) * 100 : 0;
      const avgDuration = point.count > 0 ? point.totalDuration / point.count : 0;

      endpoints[endpoint] = {
        ...point,
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        statusCodes,
        errorRate,
        avgDuration,
      };

      totalRequests += point.count;
      totalErrors += point.errors;
    }

    // Build per-minute buckets for the last 5 minutes
    const rateHistory = this.buildRateHistory(allTimestamps, now);

    return {
      endpoints,
      totals: {
        requests: totalRequests,
        errors: totalErrors,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
        byStatus: statusTotals,
      },
      rateHistory,
    };
  }

  /**
   * Split timestamps into per-minute buckets for the last 5 minutes.
   */
  private buildRateHistory(
    timestamps: number[],
    now: number,
  ): { minutes: string[]; counts: number[] } {
    const minutes: string[] = [];
    const counts: number[] = [];

    for (let i = 4; i >= 0; i--) {
      const bucketStart = now - (i + 1) * 60 * 1000;
      const bucketEnd = now - i * 60 * 1000;
      const count = timestamps.filter((t) => t >= bucketStart && t < bucketEnd).length;

      const date = new Date(bucketEnd);
      const label = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      minutes.push(label);
      counts.push(count);
    }

    return { minutes, counts };
  }

  /**
   * Persist current metrics snapshot to Redis with a 7-day TTL.
   */
  async persistToRedis(): Promise<void> {
    const snapshot: PersistedMetrics = {
      metrics: this.getStats(),
      history: {},
      savedAt: new Date().toISOString(),
    };

    // Keep only the last 100 entries per endpoint for Redis storage
    for (const [endpoint, entries] of this.history) {
      snapshot.history[endpoint] = entries.slice(-100);
    }

    try {
      await redis.set(REDIS_KEY, snapshot, { ex: REDIS_TTL });
    } catch (error) {
      console.warn("[Metrics] Failed to persist to Redis:", error);
    }
  }

  /**
   * Load metrics snapshot from Redis (called once on startup).
   */
  async loadFromRedis(): Promise<void> {
    if (this.loadedFromRedis) return;
    this.loadedFromRedis = true;

    try {
      const data = await redis.get<PersistedMetrics>(REDIS_KEY);
      if (!data) return;

      // Restore metrics
      if (data.metrics) {
        for (const [key, val] of Object.entries(data.metrics)) {
          // Don't overwrite metrics that were already recorded before load
          if (!this.metrics.has(key)) {
            this.metrics.set(key, val);
          }
        }
      }

      // Restore history
      if (data.history) {
        for (const [endpoint, entries] of Object.entries(data.history)) {
          if (!this.history.has(endpoint)) {
            this.history.set(endpoint, entries);
          }
        }
      }

      // Restore record count from the loaded data size
      let totalEntries = 0;
      for (const entries of data.history ? Object.values(data.history) : []) {
        totalEntries += entries.length;
      }
      this.recordCount = totalEntries % PERSIST_INTERVAL;
    } catch (error) {
      console.warn("[Metrics] Failed to load from Redis:", error);
    }
  }

  /**
   * Log all accumulated metrics as structured JSON via console.warn
   * (matching the project's existing logging pattern) and reset counters.
   *
   * NOTE: `this.history` is intentionally NOT cleared here — the monitoring
   * dashboard relies on historical entries to compute latency percentiles and
   * status code distributions. History is pruned by a rolling window (last
   * MAX_HISTORY_PER_ENDPOINT entries per endpoint) in the `record()` method.
   */
  flush(): void {
    const snapshot = this.getStats();
    if (Object.keys(snapshot).length === 0) return;

    console.warn(
      JSON.stringify({
        type: "red_metrics",
        timestamp: new Date().toISOString(),
        metrics: snapshot,
      }),
    );

    this.metrics.clear();
  }

  // ── lifecycle ──────────────────────────────────────────────────────

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => this.flush(), 60_000);
    // Allow the process to exit cleanly even while the timer is active
    if (this.flushTimer && typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Tear down the auto-flush interval (useful in tests).
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.metrics.clear();
    this.history.clear();
  }
}

// Singleton — imported throughout the app so all code shares one collector
export const metrics = new MetricsCollector();

// Attempt to restore persisted state on startup (non-blocking, best-effort)
metrics.loadFromRedis().catch(() => {});
