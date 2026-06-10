import { z } from "zod";
import { anthropic } from "@/lib/anthropic";
import { withRetry } from "@/lib/retry";
import { TrendScoreSchema } from "@/lib/schemas";
import type { TrendInput, TrendScore, VideoInput, VideoScore } from "@/lib/types";

const trendScoreSchema = TrendScoreSchema.extend({
  status: z.enum(["EMERGING", "GROWING", "PEAK", "FADING"]),
  contentAngles: z.array(z.string()).min(1),
});

const videoScoreSchema = z.object({
  score: z.number().min(0).max(100),
  status: z.enum(["EMERGING", "GROWING", "PEAK", "FADING"]),
  contentAngles: z.array(z.string()).min(1),
});

export async function scoreTrend(input: TrendInput): Promise<TrendScore> {
  const jsonExample =
    '{"score": 85, "status": "GROWING", "contentAngles": ["Angle 1", "Angle 2"], "reasoning": "Explication du score"}';

  const message = await withRetry(
    () =>
      anthropic.messages.create({
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
              "Retourne ONLY ce JSON avec les champs: score (0-100), status (EMERGING ou GROWING ou PEAK ou FADING), contentAngles (3 angles en francais), reasoning (une phrase)",
            ].join("\n"),
          },
        ],
      }),
    {
      maxRetries: 2,
      baseDelayMs: 2000,
      timeoutMs: 45000,
    },
  );

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  try {
    const parsed = JSON.parse(text);
    return trendScoreSchema.parse(parsed);
  } catch (err) {
    console.warn(
      `[TrendScorer] Failed to parse Claude response for "${input.title}": ${err instanceof Error ? err.message : String(err)}`,
    );

    // Fallback: score basé sur les métriques uniquement
    const metricScore = Math.min(
      100,
      Math.round(
        input.velocityPercent * 0.4 +
          Math.min(input.searchVolume / 1000, 50) * 0.3 +
          Math.min(input.avgViews / 10000, 50) * 0.3,
      ),
    );

    return {
      score: Math.max(0, metricScore),
      status: "EMERGING",
      contentAngles: [],
      reasoning: "Fallback: erreur de parsing Claude, score basé sur les métriques",
    };
  }
}

export async function scoreVideo(input: VideoInput): Promise<VideoScore> {
  const engagementRate =
    input.viewCount > 0 ? ((input.likeCount + input.commentCount) / input.viewCount) * 100 : 0;

  const daysSincePub = Math.floor(
    (Date.now() - new Date(input.publishedAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const viewsPerDay = daysSincePub > 0 ? input.viewCount / daysSincePub : input.viewCount;

  const jsonExample = '{"score": 85, "status": "PEAK", "contentAngles": ["Angle 1", "Angle 2"]}';

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
    "Retourne ONLY ce JSON avec score (0-100), status (EMERGING/GROWING/PEAK/FADING), contentAngles (3 angles en francais)",
  ];

  const message = await withRetry(
    () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: promptParts.join("\n") }],
      }),
    {
      maxRetries: 2,
      baseDelayMs: 2000,
      timeoutMs: 45000,
    },
  );

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  try {
    const parsed = JSON.parse(text);
    return videoScoreSchema.parse(parsed);
  } catch (err) {
    console.warn(
      `[TrendScorer] Failed to parse Claude response for video "${input.title}": ${err instanceof Error ? err.message : String(err)}`,
    );

    // Fallback: score basé sur l'engagement uniquement
    const engagementRate =
      input.viewCount > 0 ? ((input.likeCount + input.commentCount) / input.viewCount) * 100 : 0;
    const metricScore = Math.min(100, Math.round(engagementRate * 5));

    return { score: Math.max(0, metricScore), status: "EMERGING", contentAngles: [] };
  }
}
