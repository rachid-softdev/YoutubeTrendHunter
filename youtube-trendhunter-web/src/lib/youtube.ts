const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY!
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

export interface YouTubeVideoResult {
  videoId: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string
  thumbnails: { default?: { url: string }; medium?: { url: string }; high?: { url: string } }
}

export interface YouTubeSearchResponse {
  videos: YouTubeVideoResult[]
  totalResults: number
}

export interface YouTubeVideoStats {
  videoId: string
  viewCount: number
  likeCount: number
  commentCount: number
  publishedAt: string
}

export async function searchVideos(keywords: string[], maxResults: number = 10): Promise<YouTubeSearchResponse> {
  const query = keywords.join(" | ")
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    maxResults: String(maxResults),
    type: "video",
    relevanceLanguage: "fr",
    regionCode: "FR",
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`)
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`)
  const data = await res.json()

  const videos: YouTubeVideoResult[] = data.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnails: item.snippet.thumbnails,
  }))

  return { videos, totalResults: data.pageInfo?.totalResults ?? 0 }
}

export async function getVideoStats(videoIds: string[]): Promise<YouTubeVideoStats[]> {
  const params = new URLSearchParams({
    part: "statistics,snippet",
    id: videoIds.join(","),
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube videos failed: ${res.status}`)
  const data = await res.json()

  return data.items.map((item: any) => ({
    videoId: item.id,
    viewCount: parseInt(item.statistics?.viewCount ?? "0"),
    likeCount: parseInt(item.statistics?.likeCount ?? "0"),
    commentCount: parseInt(item.statistics?.commentCount ?? "0"),
    publishedAt: item.snippet.publishedAt,
  }))
}

export async function getTrendingVideos(regionCode: string = "FR", categoryId?: string): Promise<YouTubeVideoResult[]> {
  const params = new URLSearchParams({
    part: "snippet",
    chart: "mostPopular",
    regionCode,
    maxResults: "20",
    key: YOUTUBE_API_KEY,
  })
  if (categoryId) params.set("videoCategoryId", categoryId)

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube trending failed: ${res.status}`)
  const data = await res.json()

  return data.items.map((item: any) => ({
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnails: item.snippet.thumbnails,
  }))
}

export interface YouTubeVideoDetails {
  videoId: string
  title: string
  description: string
  channelTitle: string
  channelId: string
  publishedAt: string
  thumbnailUrl: string
  tags: string[]
  categoryId: string
}

export async function getVideoDetails(videoId: string): Promise<YouTubeVideoDetails> {
  const params = new URLSearchParams({
    part: "snippet,statistics",
    id: videoId,
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`)
  if (!res.ok) throw new Error(`YouTube video details failed: ${res.status}`)
  const data = await res.json()

  if (!data.items || data.items.length === 0) {
    throw new Error("Video not found")
  }

  const item = data.items[0]
  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? "",
    tags: item.snippet.tags ?? [],
    categoryId: item.snippet.categoryId,
  }
}
