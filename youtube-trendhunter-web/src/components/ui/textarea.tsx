import * as React from "react";

import { cn } from "@youtube-trendhunter/ui";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-none border border-hairline-dark bg-dark-canvas px-3 py-2 text-sm text-dark-ink placeholder:text-dark-ink-tertiary focus:outline-none focus:ring-2 focus:ring-yt-link focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
