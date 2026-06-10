/**
 * Shared extension types.
 *
 * Types are now defined in @youtube-trendhunter/types (the single source of truth).
 * This barrel provides backward compatibility for existing extension imports.
 *
 * Prefer importing from "@youtube-trendhunter/types" directly in new code.
 */

export type {
  Trend,
  Niche,
  Plan,
  GetTrendsResponse,
  AnalyzeVideoResponse,
  ExtensionMessage,
} from "@youtube-trendhunter/types";
