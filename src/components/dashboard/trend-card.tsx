import { TrendingUp, TrendingDown, Minus, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
  }
}

export function TrendCard({ trend }: TrendCardProps) {
  // YouTube-style score colors
  const getScoreColor = (score: number) => {
    if (score >= 75) return "bg-yt-red"        // Hot - YouTube red
    if (score >= 50) return "bg-amber-500"      // Rising - Amber
    return "bg-green-500"                       // Cool - Green
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

  // Hot trend styling - YouTube style with subtle red border
  const isHot = trend.score >= 75

  return (
    <div className={`bg-white p-4 rounded-xl border transition-shadow hover:shadow-md ${isHot ? "border-red-200" : "border-hairline"}`}>
      <div className="flex items-start gap-3">
        {/* Score Badge - YouTube style */}
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center font-roboto font-bold text-white flex-shrink-0 ${getScoreColor(trend.score)}`}
        >
          {trend.score}
        </div>

        <div className="flex-1 min-w-0">
          {/* Video Title Style - YouTube */}
          <h3 className="font-roboto text-sm font-medium text-ink line-clamp-2">{trend.title}</h3>
          {trend.description && (
            <p className="text-sm text-ink-secondary mt-1 line-clamp-2">{trend.description}</p>
          )}

          {/* Video Meta Style */}
          <div className="flex items-center gap-3 mt-2 text-sm text-ink-secondary font-roboto">
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
                <div key={i} className="flex items-start gap-2 text-sm font-roboto">
                  <Play className="w-3 h-3 mt-0.5 text-ink-tertiary flex-shrink-0" />
                  <span className="text-ink-secondary">{angle}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Badge - YouTube badge style */}
        <Badge variant={getStatusVariant(trend.status) as any}>
          {trend.status}
        </Badge>
      </div>
    </div>
  )
}