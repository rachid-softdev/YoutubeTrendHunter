import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost" | "subscribe" | "subscribed"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          // Base styles - YouTube Roboto, pill shape
          "inline-flex items-center justify-center font-roboto text-sm font-medium tracking-wide rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yt-link disabled:pointer-events-none disabled:opacity-50",
          // Variant styles - YouTube design tokens
          {
            // Primary - Ink (near-black) pill
            default: "bg-ink text-white hover:bg-ink-secondary",
            // Subscribe - YouTube Red
            subscribe: "bg-yt-red text-white hover:bg-yt-red-deep",
            // Subscribed - Dark chip
            subscribed: "bg-dark-chip text-dark-ink hover:bg-dark-overlay",
            // Destructive
            destructive: "bg-red-500 text-white hover:bg-red-600",
            // Outline
            outline: "border border-hairline bg-transparent hover:bg-surface-chip text-ink",
            // Ghost
            ghost: "bg-transparent hover:bg-surface-chip text-ink",
          }[variant],
          // Size styles
          {
            default: "h-9 px-4 py-2",
            sm: "h-8 px-3 py-1.5 text-xs",
            lg: "h-11 px-6 py-2.5",
            icon: "h-10 w-10",
          }[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }