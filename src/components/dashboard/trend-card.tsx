"use client"

import { memo, useMemo, useCallback } from "react"
import { TrendingUp, TrendingDown, Minus, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { analytics } from "@/lib/analytics"

interface TrendCardProps {
  trend: {
    id: string
    title: string
    description?: string | null
    score: number
    velocity: number
    status: string
    contentAngles?: string[] | null
    videoCount?: number | null
    niche?: { slug: string; name: string } | null
  }
  source?: string
}

// Helper functions outside component - no recreation on each render
const getScoreColor = (score: number): string => {
  if (score >= 75) return "bg-yt-red"
  if (score >= 50) return "bg-amber-500"
  return "bg-green-500"
}

const getStatusVariant = (status: string): "live" | "default" | "members" => {
  switch (status) {
    case "PEAK": return "live"
    case "GROWING": return "default"
    case "FADING": return "members"
    default: return "default"
  }
}

// Memoized component with custom comparison
export const TrendCard = memo(function TrendCard({ trend, source = "dashboard" }: TrendCardProps) {
  // Memoized derived value - only recalculated when trend.score changes
  const isHot = useMemo(() => trend.score >= 75, [trend.score])

  // Stable callback - reference stays the same between renders
  const handleClick = useCallback(() => {
    analytics.trendViewed(
      trend.id,
      trend.niche?.slug || "unknown",
      trend.score,
      source
    )
  }, [trend.id, trend.niche?.slug, trend.score, source])

  // Pre-computed values
  const scoreColor = getScoreColor(trend.score)
  const statusVariant = getStatusVariant(trend.status)
  const VelocityIcon = trend.velocity > 0 ? TrendingUp : trend.velocity < 0 ? TrendingDown : Minus
  const contentAngles = trend.contentAngles?.slice(0, 2) || []

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Card className={`transition-all duration-300 hover:shadow-lg group border-hairline-dark ${isHot ? "border-yt-red/30" : "hover:border-dark-ink-tertiary"} rounded-none`}>
        <CardContent className="flex items-start gap-3 p-4">
          {/* Score Badge - YouTube style */}
          <div
            className={`w-12 h-12 rounded-none flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg ${scoreColor}`}
          >
            {trend.score}
          </div>

          <div className="flex-1 min-w-0">
            {/* Video Title Style - YouTube */}
            <h3 className="text-sm font-medium text-dark-ink line-clamp-2">{trend.title}</h3>
            {trend.description && (
              <p className="text-sm text-dark-ink-secondary mt-1 line-clamp-2">{trend.description}</p>
            )}

            {/* Video Meta Style */}
            <div className="flex items-center gap-3 mt-2 text-sm text-dark-ink-secondary">
              <span className="flex items-center gap-1">
                {VelocityIcon && <VelocityIcon className="w-4 h-4" />}
                {Math.abs(trend.velocity).toFixed(1)}%
              </span>
              {trend.videoCount && (
                <span>{trend.videoCount} vidéos</span>
              )}
            </div>

            {/* Content Angles - YouTube caption style */}
            {contentAngles.length > 0 && (
              <div className="mt-3 space-y-1">
                {contentAngles.map((angle, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Play className="w-3 h-3 mt-0.5 text-dark-ink-tertiary flex-shrink-0" />
                    <span className="text-dark-ink-secondary">{angle}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Badge - YouTube badge style */}
          <Badge variant={statusVariant}>
            {trend.status}
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
},
// Custom comparison for optimization
(prevProps, nextProps) => {
  return (
    prevProps.trend.id === nextProps.trend.id &&
    prevProps.trend.score === nextProps.trend.score &&
    prevProps.trend.status === nextProps.trend.status &&
    prevProps.trend.velocity === nextProps.trend.velocity &&
    prevProps.trend.title === nextProps.trend.title &&
    prevProps.source === nextProps.source
  )
})