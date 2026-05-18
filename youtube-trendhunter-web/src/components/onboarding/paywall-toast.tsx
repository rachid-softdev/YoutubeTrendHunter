"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { X, ArrowRight, Zap, Bell, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PaywallToastProps {
  context: "trends-viewed" | "alerts" | "export"
  limit?: number
  className?: string
}

const messages: Record<string, { message: string | ((limit: number) => string); icon: React.ComponentType<{ className?: string }> }> = {
  "trends-viewed": {
    message: (limit: number) =>
      `Vous avez vu ${limit} tendances. Déblockez les tendances illimitées →`,
    icon: Zap,
  },
  "alerts": {
    message: "Les alertes sont reservées aux utilisateurs Pro →",
    icon: Bell,
  },
  "export": {
    message: "Export CSV disponible sur Pro →",
    icon: Download,
  },
}

export function PaywallToast({ context, limit = 5, className }: PaywallToastProps) {
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  const { message: messageFn, icon: Icon } = messages[context]
  const message = typeof messageFn === "function" ? messageFn(limit) : messageFn

  useEffect(() => {
    // Check if already shown
    const shown = localStorage.getItem(`paywall-toast-${context}-shown`)
    if (shown) {
      setIsDismissed(true)
      return
    }

    // Show after a delay
    const timer = setTimeout(() => setIsVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [context])

  useEffect(() => {
    // Auto-dismiss after 10 seconds
    if (isVisible) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [isVisible])

  const handleDismiss = () => {
    setIsVisible(false)
    setIsDismissed(true)
    localStorage.setItem(`paywall-toast-${context}-shown`, "true")
  }

  const handleUpgrade = () => {
    router.push("/pricing")
  }

  // Don't show if dismissed
  if (isDismissed) {
    return null
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4"
      } ${className || ""}`}
    >
      <div className="bg-dark-surface border border-hairline-dark rounded-lg shadow-xl p-4 min-w-[320px] max-w-[400px]">
        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-yt-red/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-yt-red" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dark-ink">
              {message}
            </p>

            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={handleUpgrade}
                size="sm"
                className="bg-yt-red hover:bg-yt-red-deep text-white font-bold"
              >
                Passer Pro
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <button
                onClick={handleDismiss}
                className="text-sm text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors px-2"
              >
                Plus tard
              </button>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}