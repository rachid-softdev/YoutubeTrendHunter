/**
 * Shared type barrel — re-exports all canonical type definitions.
 *
 * Types are now defined in @youtube-trendhunter/types (the single source of truth).
 * This barrel provides backward compatibility for existing imports.
 *
 * Prefer importing from "@youtube-trendhunter/types" directly in new code.
 */

export type {
  PlanType,
  PlanStatus,
  PaginatedResponse,
  ApiError,
  TrendScore,
  VideoScore,
  TrendInput,
  VideoInput,
} from "@youtube-trendhunter/types";
