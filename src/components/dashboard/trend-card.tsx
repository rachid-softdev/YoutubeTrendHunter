"use client"

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

export function TrendCard({ trend, source = "dashboard" }: TrendCardProps) {
  // YouTube-style score colors
  const getScoreColor = (score: number) => {
    if (score >= 75) return "bg-yt-red"
    if (score >= 50) return "bg-amber-500"
    return "bg-green-500"
  }

  // YouTube-style status badge
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "PEAK": return "live"
      case "GROWING": return "default"
      case "FADING": return "members"
      default: return "default"
    }
  }

  const isHot = trend.score >= 75

  const handleClick = () => {
    // Track analytics event
    analytics.trendViewed(
      trend.id,
      trend.niche?.slug || "unknown",
      trend.score,
      source
    )
  }

  return (
    <div
      onClick={handleClick}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick()
        }
      }}
    >
      <Card className={`transition-all duration-300 hover:shadow-lg group border-hairline-dark ${isHot ? "border-yt-red/30" : "hover:border-dark-ink-tertiary"} rounded-none`}>
        <CardContent className="flex items-start gap-3 p-4">
          {/* Score Badge - YouTube style */}
          <div
            className={`w-12 h-12 rounded-none flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg ${getScoreColor(trend.score)}`}
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
                {trend.velocity > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : trend.velocity < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <Minus className="w-4 h-4" />
                )}
                {Math.abs(trend.velocity).toFixed(1)}%
              </span>
              {trend.videoCount && (
                <span>{trend.videoCount} vidéos</span>
              )}
            </div>

            {/* Content Angles - YouTube caption style */}
            {trend.contentAngles && trend.contentAngles.length > 0 && (
              <div className="mt-3 space-y-1">
                {trend.contentAngles.slice(0, 2).map((angle, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Play className="w-3 h-3 mt-0.5 text-dark-ink-tertiary flex-shrink-0" />
                    <span className="text-dark-ink-secondary">{angle}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Badge - YouTube badge style */}
          <Badge variant={getStatusVariant(trend.status) as any}>
            {trend.status}
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}