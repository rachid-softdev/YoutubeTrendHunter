"use client"
import { useEffect, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { analytics } from "@/lib/analytics"

function PostHogTracker({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
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
    }
  }, [])

  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "")
    analytics.pageViewed(url)
  }, [pathname, searchParams])

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