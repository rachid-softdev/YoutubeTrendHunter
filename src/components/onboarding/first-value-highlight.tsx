"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, ArrowRight, TrendingUp, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface FirstValueHighlightProps {
  trend: {
    id: string
    title: string
    description?: string | null
    score: number
    velocity: number
    status: string
    contentAngles?: string[] | null
  }
  className?: string
}

export function FirstValueHighlight({ trend, className }: FirstValueHighlightProps) {
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // Check if dismissed
    const dismissed = localStorage.getItem("first-trend-dismissed")
    if (dismissed) {
      setIsDismissed(true)
      return
    }

    // Animate entrance
    const timer = setTimeout(() => setIsVisible(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem("first-trend-dismissed", "true")
    setIsVisible(false)
  }

  // Don't show if dismissed
  if (isDismissed) {
    return null
  }

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 75) return "bg-yt-red"
    if (score >= 50) return "bg-amber-500"
    return "bg-green-500"
  }

  // Get status badge variant
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "PEAK":
        return "live"
      case "GROWING":
        return "default"
      case "FADING":
        return "members"
      default:
        return "default"
    }
  }

  return (
    <div
      className={`relative transition-all duration-500 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className || ""}`}
    >
      {/* Animated Border */}
      <div className="absolute inset-0 rounded-lg animate-pulse-border pointer-events-none" />

      <Card className="relative bg-dark-surface border-2 border-yt-red/30 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-yt-red/5 to-transparent" />

        <CardContent className="relative p-6">
          {/* Label */}
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-yt-red/10 text-yt-red text-sm font-bold rounded">
              <Play className="w-4 h-4" fill="currentColor" />
              À découvrir en priorité
            </span>
            <button
              onClick={handleDismiss}
              className="text-dark-ink-tertiary hover:text-dark-ink-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex items-start gap-4">
            {/* Score Badge */}
            <div
              className={`w-16 h-16 flex flex-col items-center justify-center font-black text-white flex-shrink-0 shadow-lg ${getScoreColor(
                trend.score
              )}`}
            >
              <span className="text-2xl">{trend.score}</span>
              <span className="text-[10px] font-medium opacity-80">SCORE</span>
            </div>

            <div className="flex-1 min-w-0">
              {/* Title */}
              <h3 className="text-lg font-bold text-dark-ink line-clamp-2 mb-1">
                {trend.title}
              </h3>

              {/* Description */}
              {trend.description && (
                <p className="text-sm text-dark-ink-secondary line-clamp-2 mb-3">
                  {trend.description}
                </p>
              )}

              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-dark-ink-secondary">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-yt-red" />
                  +{trend.velocity.toFixed(1)}%
                </span>
                <span className="px-2 py-0.5 bg-dark-overlay text-xs font-medium rounded">
                  {trend.status}
                </span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={() => router.push(`/dashboard?trend=${trend.id}`)}
              className="bg-yt-red hover:bg-yt-red-deep text-white font-bold"
            >
              Explorer cette tendance
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}