import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { getVideoStats, getVideoDetails } from "@/lib/youtube"
import { scoreVideo } from "@/lib/trend-scorer"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 })
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!apiToken) {
    return NextResponse.json({ error: "Token invalide", code: "INVALID_TOKEN" }, { status: 401 })
  }

  // Update last used
  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  })

  try {
    const body = await req.json()
    const { videoId } = body

    if (!videoId) {
      return NextResponse.json({ error: "videoId requis" }, { status: 400 })
    }

    // Get video stats and details from YouTube API
    const [stats, videoDetails] = await Promise.all([
      getVideoStats([videoId]).catch(() => []),
      getVideoDetails(videoId).catch(() => null),
    ])

    const videoStat = stats[0]
    
    if (!videoStat && !videoDetails) {
      return NextResponse.json(
        { error: "Vidéo introuvable ou supprimée", code: "VIDEO_NOT_FOUND" },
        { status: 404 }
      )
    }

    const plan = await getUserPlan(apiToken.userId)
    
    // If FREE plan, limit analysis (mock score for demo)
    if (plan === "FREE") {
      return NextResponse.json({
        score: 0,
        status: "LIMITED",
        message: "Passez Pro pour analyser les vidéos",
        upgradeUrl: "/pricing",
        videoId,
      })
    }

    // Get user's followed niches to find the best match
    const userNiches = await prisma.userNiche.findMany({
      where: { userId: apiToken.userId },
      include: { niche: true },
    })

    const defaultNiche = userNiches[0]?.niche?.name ?? "Tech & IA"
    const defaultLanguage = userNiches[0]?.niche?.language ?? "fr"

    // Calculate metrics for scoring
    const videoData = {
      title: videoDetails?.title ?? `Video ${videoId}`,
      description: videoDetails?.description ?? "",
      channelTitle: videoDetails?.channelTitle ?? "",
      viewCount: videoStat?.viewCount ?? 0,
      likeCount: videoStat?.likeCount ?? 0,
      commentCount: videoStat?.commentCount ?? 0,
      publishedAt: videoStat?.publishedAt ?? "",
    }

    // Score the video using Claude
    const scoreResult = await scoreVideo({
      title: videoData.title,
      description: videoData.description,
      channelTitle: videoData.channelTitle,
      viewCount: videoData.viewCount,
      likeCount: videoData.likeCount,
      commentCount: videoData.commentCount,
      publishedAt: videoData.publishedAt,
      niche: defaultNiche,
      language: defaultLanguage,
    })

    return NextResponse.json({
      videoId,
      title: videoData.title,
      channelTitle: videoData.channelTitle,
      views: videoData.viewCount,
      ...scoreResult,
    })
  } catch (error) {
    console.error("Video analysis error:", error)
    return NextResponse.json(
      { error: "Erreur lors de l'analyse", code: "ANALYSIS_FAILED" },
      { status: 500 }
    )
  }
}