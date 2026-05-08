import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "search" | "underline"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles - Roboto font, YouTube design
          "font-roboto transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yt-link disabled:cursor-not-allowed disabled:opacity-50",
          // Variant styles
          {
            // Default - border only
            default: "h-10 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-yt-link",
            // Search - YouTube style pill
            search: "h-10 w-full rounded-full border border-hairline bg-canvas px-4 py-2 text-base text-ink placeholder:text-ink-tertiary focus:border-yt-link focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]",
            // Underline - YouTube comment style
            underline: "h-auto w-full bg-transparent border-b border-hairline px-0 py-1 text-base text-ink placeholder:text-ink-tertiary focus:border-yt-link",
          }[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }