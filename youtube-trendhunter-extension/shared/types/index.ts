export interface Trend {
  title: string
  keyword: string
  score: number
  velocity: number
  videoCount: number
  contentAngles?: string[]
}

export interface Niche {
  slug: string
  name: string
}

export type Plan = 'FREE' | 'PRO' | 'BUSINESS'

export interface GetTrendsResponse {
  data?: { trends: Trend[]; plan: Plan }
  error?: 'NOT_AUTHENTICATED' | 'FETCH_ERROR'
}

export interface AnalyzeVideoResponse {
  data?: { score: number; videoCount?: number; velocity?: number; title?: string; keyword?: string }
  error?: 'NOT_AUTHENTICATED' | 'FETCH_ERROR'
}

export type ExtensionMessage =
  | { type: 'GET_TRENDS' }
  | { type: 'ANALYZE_VIDEO'; videoId: string }
