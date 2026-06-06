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

export async function scoreTrend(input: TrendInput): Promise<TrendScore> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Tu es un expert en stratégie de contenu YouTube.

Évalue cette tendance émergente et retourne UNIQUEMENT un JSON valide, sans markdown.

Tendance : "${input.title}"
Niche : ${input.niche}
Langue cible : ${input.language}
Volume de recherche mensuel : ${input.searchVolume}
Nombre de vidéos existantes : ${input.videoCount}
Vues moyennes par vidéo : ${input.avgViews}
Croissance sur 48h : +${input.velocityPercent}%

Retourne ce JSON exact :
{
  "score": <entier 0-100>,
  "status": <"EMERGING"|"GROWING"|"PEAK"|"FADING">,
  "contentAngles": [<3 angles de vidéo courts et percutants>],
  "reasoning": <une phrase expliquant le score>
}

Critères de score :
- 0-49 : tendance faible ou saturée
- 50-74 : opportunité intéressante
- 75-100 : fenêtre d'opportunité rare, agir vite`,
      },
    ],
  })

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  return JSON.parse(text) as TrendScore
}