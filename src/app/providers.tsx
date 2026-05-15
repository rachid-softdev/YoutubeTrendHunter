"use client"
import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"

export function PostHogProvider({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider>{children}</PostHogProvider>
}