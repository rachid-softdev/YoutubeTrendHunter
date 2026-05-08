import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "live" | "duration" | "members" | "new" | "plan-free" | "plan-pro" | "plan-team"
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        className={cn(
          // Base styles - YouTube label style
          "inline-flex items-center font-roboto text-xs font-bold tracking-wide",
          // Variant styles
          {
            // Default
            default: "px-2 py-0.5 rounded bg-surface-chip text-ink",
            // Live badge - YouTube red pill
            live: "px-2 py-0.5 rounded-sm bg-yt-red text-white",
            // Duration badge - semi-transparent black
            duration: "px-1 py-0.5 rounded-sm bg-black/80 text-white",
            // Members only - green
            members: "px-2 py-0.5 rounded-sm bg-members-only text-white",
            // New - red
            new: "px-2 py-0.5 rounded-sm bg-yt-red text-white",
            // Plan badges - pill shape
            "plan-free": "px-2.5 py-1 rounded-full bg-amber-100 text-amber-800",
            "plan-pro": "px-2.5 py-1 rounded-full bg-blue-100 text-blue-800",
            "plan-team": "px-2.5 py-1 rounded-full bg-purple-100 text-purple-800",
          }[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }