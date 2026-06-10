/**
 * @youtube-trendhunter/types — Canonical type definitions for YouTube TrendHunter.
 *
 * This is the single source of truth for all shared types between
 * the web app, extension, and any future clients.
 */

export type { PlanType, PlanStatus } from "./plan.types";
export type { PaginatedResponse, ApiError } from "./api.types";
export type { TrendScore, VideoScore, TrendInput, VideoInput } from "./trend.types";
export type {
  Trend,
  Niche,
  Plan,
  GetTrendsResponse,
  AnalyzeVideoResponse,
  ExtensionMessage,
} from "./extension.types";
