"use client";

import { useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { analytics, identifyUser } from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track page views on route change
  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    analytics.pageViewed(url);
  }, [pathname, searchParams]);

  return <>{children}</>;
}

interface UseAnalyticsOptions {
  userId?: string;
  userTraits?: Record<string, unknown>;
}

export function useAnalytics(options?: UseAnalyticsOptions) {
  const trackCta = useCallback((cta: string, destination: string) => {
    analytics.ctaClicked(cta, destination);
  }, []);

  const trackEvent = useCallback((event: string, props?: Record<string, unknown>) => {
    if (typeof window !== "undefined") {
      (
        window as unknown as {
          posthog: { capture: (event: string, props?: Record<string, unknown>) => void };
        }
      ).posthog?.capture(event, props);
    }
  }, []);

  const identify = useCallback((userId: string, traits: Record<string, unknown>) => {
    identifyUser(userId, traits);
  }, []);

  return {
    trackCta,
    trackEvent,
    identify,
  };
}

export { analytics };
