"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X, Cookie } from "lucide-react"
import Link from "next/link"

const COOKIE_CONSENT_KEY = "cookie_consent"
const CONSENT_DELAY = 2000

export function CookieConsent() {
  const [show, setShow] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if consent was already given
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (consent) {
      return
    }

    // Show after delay
    const timer = setTimeout(() => {
      setShow(true)
      // Trigger animation
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    }, CONSENT_DELAY)

    return () => clearTimeout(timer)
  }, [])

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted")
    setIsVisible(false)
    setTimeout(() => setShow(false), 300)

    // Fire PostHog opt-in if available
    if (typeof window !== "undefined" && (window as any).posthog) {
      ;(window as any).posthog.opt_in_capturing()
    }
  }

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "essential")
    setIsVisible(false)
    setTimeout(() => setShow(false), 300)
  }

  if (!show) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleEssentialOnly}
      />

      {/* Banner */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-dark-surface border-t border-hairline-dark p-4 transition-transform duration-300 ease-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Cookie className="w-5 h-5 text-yt-red shrink-0 mt-0.5" />
            <p className="text-sm text-dark-ink-secondary">
              Nous utilisons des cookies pour analyser le trafic et améliorer votre expérience.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/privacy"
              className="text-sm text-dark-ink-tertiary hover:text-dark-ink underline underline-offset-2"
            >
              Politique de confidentialité
            </Link>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEssentialOnly}
                className="border-hairline-dark hover:bg-dark-surface"
              >
                Essentiels seulement
              </Button>
              <Button
                variant="subscribe"
                size="sm"
                onClick={handleAccept}
                className="font-bold"
              >
                Tout accepter
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}