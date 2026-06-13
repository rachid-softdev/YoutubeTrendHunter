import { anthropic } from "@/lib/anthropic"
import { z } from "zod"

const trendScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(["EMERGING", "GROWING", "PEAK", "FADING"]),
  contentAngles: z.array(z.string()).length(3),
  reasoning: z.string(),
})

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

---BEGIN DATA---
Tendance : "${input.title.replace(/["\\]/g, "\\$&")}"
Niche : ${input.niche}
Langue cible : ${input.language}
Volume de recherche mensuel : ${input.searchVolume}
Nombre de vidéos existantes : ${input.videoCount}
Vues moyennes par vidéo : ${input.avgViews}
Croissance sur 48h : +${input.velocityPercent}%
---END DATA---

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

  const text =
    message.content.length > 0 && message.content[0].type === "text"
      ? message.content[0].text
      : ""

  if (!text) {
    throw new Error("Claude a retourné une réponse vide")
  }

  const cleaned = text.replace(/```json|```/g, "").trim()
  const parsed = JSON.parse(cleaned)
  return trendScoreSchema.parse(parsed)
}
