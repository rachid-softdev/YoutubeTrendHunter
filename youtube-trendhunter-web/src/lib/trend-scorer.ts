import { anthropic } from "@/lib/anthropic"

interface TrendInput {
  title: string
  searchVolume: number
  videoCount: number
  avgViews: number
  velocityPercent: number
  niche: string
  language: string
}

interface TrendScore {
  score: number
  status: "EMERGING" | "GROWING" | "PEAK" | "FADING"
  contentAngles: string[]
  reasoning: string
}

interface VideoInput {
  title: string
  description: string
  channelTitle: string
  viewCount: number
  likeCount: number
  commentCount: number
  publishedAt: string
  niche: string
  language: string
}

interface VideoScore {
  score: number
  status: "EMERGING" | "GROWING" | "PEAK" | "FADING"
  contentAngles: string[]
}

export async function scoreTrend(input: TrendInput): Promise<TrendScore> {
  const jsonExample = '{"score": 85, "status": "GROWING", "contentAngles": ["Angle 1", "Angle 2"], "reasoning": "Explication du score"}'
  
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          "Tu es un expert en strategie de contenu YouTube.",
          "",
          "Tendance: " + input.title,
          "Niche: " + input.niche,
          "Langue cible: " + input.language,
          "Volume de recherche mensuel: " + input.searchVolume,
          "Nombre de videos existantes: " + input.videoCount,
          "Vues moyennes par video: " + input.avgViews,
          "Croissance sur 48h: +" + input.velocityPercent + "%",
          "",
          "Exemple de retour attendu: " + jsonExample,
          "",
          "Retourne ONLY ce JSON avec les champs: score (0-100), status (EMERGING ou GROWING ou PEAK ou FADING), contentAngles (3 angles en francais), reasoning (une phrase)"
        ].join("\n"),
      },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return JSON.parse(text) as TrendScore
}

export async function scoreVideo(input: VideoInput): Promise<VideoScore> {
  const engagementRate = input.viewCount > 0 
    ? ((input.likeCount + input.commentCount) / input.viewCount) * 100 
    : 0

  const daysSincePub = Math.floor(
    (Date.now() - new Date(input.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
  )

  const viewsPerDay = daysSincePub > 0 ? input.viewCount / daysSincePub : input.viewCount

  const jsonExample = '{"score": 85, "status": "PEAK", "contentAngles": ["Angle 1", "Angle 2"]}'
  
  const promptParts = [
    "Tu es un expert en strategie de contenu YouTube.",
    "Analyse cette video pour un createur de contenu.",
    "",
    "Video: " + input.title,
    "Chaine: " + input.channelTitle,
    "Vues: " + input.viewCount.toLocaleString(),
    "J'aime: " + input.likeCount.toLocaleString(),
    "Commentaires: " + input.commentCount.toLocaleString(),
    "Taux d'engagement: " + engagementRate.toFixed(2) + "%",
    "Vues/jour: " + Math.round(viewsPerDay).toLocaleString(),
    "Age de la video: " + daysSincePub + " jours",
    "Niche: " + input.niche,
    "",
    "Exemple: " + jsonExample,
    "",
    "Retourne ONLY ce JSON avec score (0-100), status (EMERGING/GROWING/PEAK/FADING), contentAngles (3 angles en francais)"
  ]

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      { role: "user", content: promptParts.join("\n") },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return JSON.parse(text) as VideoScore
}