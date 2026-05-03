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
  const getStatusColor = (status: string) => {
    switch (status) {
      case "PEAK": return "bg-red-500"
      case "GROWING": return "bg-yellow-500"
      case "FADING": return "bg-gray-500"
      default: return "bg-green-500"
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl border hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 ${getStatusColor(trend.status)}`}
        >
          {trend.score}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{trend.title}</h3>
          {trend.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{trend.description}</p>
          )}

          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
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

          {trend.contentAngles && trend.contentAngles.length > 0 && (
            <div className="mt-3 space-y-1">
              {trend.contentAngles.slice(0, 2).map((angle, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Play className="w-3 h-3 mt-1 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-600">{angle}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Badge variant={trend.score >= 75 ? "destructive" : trend.score >= 50 ? "default" : "secondary"}>
          {trend.status}
        </Badge>
      </div>
    </div>
  )
}