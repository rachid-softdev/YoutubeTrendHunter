import { prisma } from "@/lib/prisma"
import { searchVideos, getVideoStats } from "@/lib/youtube"
import { scoreTrend } from "@/lib/trend-scorer"
import { setCached, getCached, acquireLock, releaseLock, invalidateCache } from "@/lib/redis"
import type { Niche } from "@prisma/client"

interface TrendCandidate {
  title: string
  keyword: string
  videoCount: number
  totalViews: number
}

async function collectCandidates(niche: Niche): Promise<TrendCandidate[]> {
  const candidates: TrendCandidate[] = []
  const seen = new Set<string>()

  try {
    const { videos } = await searchVideos(niche.keywords, 15)
    const videoIds = videos.map(v => v.videoId)
    const stats = await getVideoStats(videoIds)
    const statsMap = new Map(stats.map(s => [s.videoId, s]))

    for (const video of videos) {
      const normalized = video.title.toLowerCase().trim()
      if (seen.has(normalized)) continue
      seen.add(normalized)

      const videoStats = statsMap.get(video.videoId)
      candidates.push({
        title: video.title,
        keyword: niche.keywords[0],
        videoCount: 1,
        totalViews: videoStats?.viewCount ?? 0,
      })
    }
  } catch (err) {
    console.error(`Failed to collect candidates for niche ${niche.slug}:`, err)
  }

  return candidates
}

export async function collectAndScoreTrends(niche: Niche): Promise<number> {
  const cacheKey = `trends:pipeline:${niche.slug}`

  // Check cache
  const cached = await getCached<{ timestamp: number }>(cacheKey)
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return 0 // Recently processed
  }

  // Acquire lock to prevent concurrent processing
  const locked = await acquireLock(`pipeline:${niche.slug}`, 600)
  if (!locked) {
    console.log(`Skipping ${niche.slug}, already being processed`)
    return 0
  }

  try {
    const candidates = await collectCandidates(niche)

    let created = 0
    for (const candidate of candidates) {
      // Check if already exists recently
      const existing = await prisma.trend.findFirst({
        where: {
          nicheId: niche.id,
          title: candidate.title,
          detectedAt: { gte: new Date(Date.now() - 86400000) },
        },
      })
      if (existing) continue

      const scoreResult = await scoreTrend({
        title: candidate.title,
        niche: niche.name,
        videoCount: candidate.videoCount,
        searchVolume: 0,
        avgViews: candidate.totalViews,
        velocityPercent: 0,
        language: niche.language,
      })

      await prisma.trend.create({
        data: {
          nicheId: niche.id,
          title: candidate.title,
          description: scoreResult.reasoning?.slice(0, 500) ?? null,
          score: scoreResult.score,
          velocity: 0,
          status: scoreResult.status,
          videoCount: candidate.videoCount,
          avgViews: candidate.totalViews,
          contentAngles: scoreResult.contentAngles ?? [],
          detectedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000), // 24h
        },
      })
      created++
    }

    // Cache the processing timestamp
    await setCached(cacheKey, { timestamp: Date.now() }, 3600)

    // Invalidate trend list cache
    await invalidateCache(`trends:list:${niche.slug}*`)

    return created
  } catch (err) {
    console.error(`Pipeline failed for niche ${niche.slug}:`, err)
    return 0
  } finally {
    await releaseLock(`pipeline:${niche.slug}`)
  }
}

export async function cleanExpiredTrends(): Promise<number> {
  const result = await prisma.trend.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}

export async function processAllNiches(): Promise<Record<string, number>> {
  const niches = await prisma.niche.findMany({ where: { isActive: true } })
  const results: Record<string, number> = {}

  for (const niche of niches) {
    results[niche.slug] = await collectAndScoreTrends(niche)
  }

  const cleaned = await cleanExpiredTrends()
  console.log(`Cleaned ${cleaned} expired trends`)

  return results
}
