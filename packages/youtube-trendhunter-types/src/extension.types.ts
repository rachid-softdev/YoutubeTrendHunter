/**
 * Extension-specific types for Chrome extension API communication.
 */

export interface Trend {
  title: string;
  keyword: string;
  score: number;
  velocity: number;
  videoCount: number;
  /** Trend lifecycle stage — mirrors TrendScore.status */
  status?: "EMERGING" | "GROWING" | "PEAK" | "FADING";
  contentAngles?: string[];
}

export interface Niche {
  slug: string;
  name: string;
}

export type Plan = "FREE" | "PRO" | "TEAM";

export interface GetTrendsResponse {
  data?: { trends: Trend[]; plan: Plan; nextCursor: string | null };
  error?: "NOT_AUTHENTICATED" | "FETCH_ERROR";
}

export interface AnalyzeVideoResponse {
  data?: {
    score: number;
    videoCount?: number;
    velocity?: number;
    title?: string;
    keyword?: string;
  };
  error?: "NOT_AUTHENTICATED" | "FETCH_ERROR";
}

export type ExtensionMessage = { type: "GET_TRENDS" } | { type: "ANALYZE_VIDEO"; videoId: string };
