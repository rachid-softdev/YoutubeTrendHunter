// ============================================
// Frontend Hooks for Entitlements
// ============================================

"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

export interface EntitlementData {
  plan: string;
  planKey: string;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
  resetAt: Record<string, string | null>;
  experimentBuckets: Record<string, boolean>;
}

// ============================================
// Context for global entitlements
// ============================================

const EntitlementsContext = createContext<{
  entitlements: EntitlementData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [entitlements, setEntitlements] = useState<EntitlementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntitlements = useCallback(async () => {
    try {
      const res = await fetch("/api/entitlements");
      if (!res.ok) throw new Error("Failed to fetch entitlements");
      const data = await res.json();
      setEntitlements(data);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Schedule initial fetch as microtask to avoid synchronous setState in effect
    const initialTimer = setTimeout(() => {
      fetchEntitlements();
    }, 0);

    // Refresh every 60 seconds
    const interval = setInterval(() => {
      fetchEntitlements();
    }, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchEntitlements]);

  return (
    <EntitlementsContext.Provider
      value={{
        entitlements,
        isLoading,
        error,
        refetch: fetchEntitlements,
      }}
    >
      {children}
    </EntitlementsContext.Provider>
  );
}

// ============================================
// Main hook: useEntitlements
// ============================================

export function useEntitlements() {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error("useEntitlements must be used within EntitlementsProvider");
  }
  return context;
}

// ============================================
// Convenience hook: useFeature
// ============================================

export function useFeature(featureKey: string): boolean {
  const { entitlements, isLoading } = useEntitlements();

  if (isLoading) return false;
  return entitlements?.features[featureKey] ?? false;
}

// ============================================
// Convenience hook: useLimit
// ============================================

export interface LimitInfo {
  limit: number | null;
  used: number;
  resetAt: string | null;
  remaining: number | null;
}

export function useLimit(limitKey: string): LimitInfo | null {
  const { entitlements, isLoading } = useEntitlements();

  if (isLoading) return null;

  const limit = entitlements?.limits[limitKey] ?? null;
  const used = entitlements?.usage[limitKey] ?? 0;
  const resetAt = entitlements?.resetAt[limitKey] ?? null;

  return {
    limit,
    used,
    resetAt,
    remaining: limit !== null ? limit - used : null,
  };
}

// ============================================
// Check if can consume (for UI feedback)
// ============================================

export function useCanConsume(limitKey: string, amount: number = 1): boolean {
  const limitInfo = useLimit(limitKey);

  if (!limitInfo) return false;
  if (limitInfo.limit === null) return true; // unlimited

  return limitInfo.used + amount <= limitInfo.limit;
}

// ============================================
// Check experiment bucket
// ============================================

export function useInExperiment(experimentKey: string): boolean {
  const { entitlements } = useEntitlements();
  return entitlements?.experimentBuckets[experimentKey] ?? false;
}

// ============================================
// Check if plan is at least a certain level
// ============================================

export function useHasPlan(minPlan: "free" | "pro" | "team" | "enterprise"): boolean {
  const { entitlements } = useEntitlements();

  const planLevels: Record<string, number> = {
    free: 0,
    pro: 1,
    team: 2,
    enterprise: 3,
  };

  const currentLevel = planLevels[entitlements?.planKey ?? "free"];
  const requiredLevel = planLevels[minPlan];

  return currentLevel >= requiredLevel;
}
