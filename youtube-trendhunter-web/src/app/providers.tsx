"use client"
import { useEffect, Suspense, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { analytics } from "@/lib/analytics"

function PostHogTracker({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [posthogLoaded, setPosthogLoaded] = useState(false)

  // Lazy load PostHog only on client side after hydration
  useEffect(() => {
    const loadPosthog = async () => {
      if (typeof window === "undefined") return

      // Only load if key is configured
      if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

      try {
        const { default: posthog } = await import("posthog-js")

        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
          api_host: "/ingest",
          person_profiles: "identified_only",
          capture_pageview: false,
          capture_pageleave: true,
          autocapture: true,
          session_recording: { maskAllInputs: true },
          loaded: (ph) => {
            if (process.env.NODE_ENV === "development") ph.opt_out_capturing()
          },
        })

        setPosthogLoaded(true)
      } catch (error) {
        console.error("Failed to load PostHog:", error)
      }
    }

    loadPosthog()
  }, [])

  // Track page views when pathname changes and PostHog is loaded
  useEffect(() => {
    if (!posthogLoaded) return

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "")
    analytics.pageViewed(url)
  }, [pathname, searchParams, posthogLoaded])

  return <>{children}</>
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<></>}>
      <PostHogTracker>{children}</PostHogTracker>
    </Suspense>
  )
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider>{children}</PostHogProvider>
}