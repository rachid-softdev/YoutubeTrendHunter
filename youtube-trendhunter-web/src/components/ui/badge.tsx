import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> { }

const badgeVariants = cva(
  "inline-flex items-center rounded-none border px-1 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-dark-surface-overlay text-white shadow hover:bg-dark-surface-overlay/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground border-hairline-dark",
        live: "border-transparent bg-yt-red text-white",
        new: "border-transparent bg-yt-red text-white",
        duration: "border-transparent bg-black/80 text-white",
        members: "border-transparent bg-members-only text-white",
        "plan-free": "border-transparent bg-amber-500/20 text-amber-400",
        "plan-pro": "border-transparent bg-yt-red text-white",
        "plan-team": "px-2.5 py-1 rounded-none bg-purple-100 text-purple-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

Badge.displayName = "Badge"

export { Badge, badgeVariants }