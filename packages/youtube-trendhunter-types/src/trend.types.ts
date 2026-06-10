/**
 * Trend & video scoring types.
 * Canonical source for TrendInput, TrendScore, VideoInput, VideoScore.
 */

export interface TrendScore {
  score: number;
  status: "EMERGING" | "GROWING" | "PEAK" | "FADING";
  contentAngles: string[];
  reasoning?: string;
}

export interface VideoScore {
  score: number;
  status: "EMERGING" | "GROWING" | "PEAK" | "FADING";
  contentAngles: string[];
}

export interface TrendInput {
  title: string;
  searchVolume: number;
  videoCount: number;
  avgViews: number;
  velocityPercent: number;
  niche: string;
  language: string;
}

export interface VideoInput {
  title: string;
  description: string;
  channelTitle: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  niche: string;
  language: string;
}
