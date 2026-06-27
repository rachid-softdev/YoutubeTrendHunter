"use client";

import * as React from "react";

import { cn } from "@youtube-trendhunter/ui";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-none border border-hairline-dark bg-dark-canvas px-3 py-2 text-sm text-dark-ink ring-offset-background placeholder:text-dark-ink-tertiary focus:outline-none focus:ring-2 focus:ring-yt-link focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";

export { Select };
