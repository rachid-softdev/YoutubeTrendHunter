import { z } from "zod";

// ─── Stripe ───
const VALID_PRICE_IDS = [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_TEAM_PRICE_ID].filter(
  Boolean,
) as [string, ...string[]];

export const checkoutSchema = z.object({
  priceId: z
    .string()
    .min(1, "Price ID requis")
    .refine((val) => VALID_PRICE_IDS.length === 0 || VALID_PRICE_IDS.includes(val), {
      message: "Price ID invalide ou inconnu",
    }),
});

export const portalSessionSchema = z.object({
  returnUrl: z.string().url().optional(),
});

// ─── Trends ───
export const trendsQuerySchema = z.object({
  niche: z.string().min(1, "Slug de niche requis"),
});

// ─── Extension ───
export const extensionAuthSchema = z.object({
  name: z.string().max(100).optional(),
});

export const extensionAnalyzeSchema = z.object({
  videoId: z.string().min(1, "Video ID requis"),
});

// ─── Alerts ───
const alertCreateSchemaBase = z.object({
  nicheId: z.string().optional(),
  type: z.enum(["SCORE_THRESHOLD", "DAILY_DIGEST", "SPIKE"]),
  threshold: z.number().int().min(0).max(100).default(70),
  channel: z.enum(["EMAIL", "WEBHOOK"]).default("EMAIL"),
  webhookUrl: z.string().url("URL invalide").optional(),
});

export const alertCreateSchema = alertCreateSchemaBase.refine(
  (data) => data.channel !== "WEBHOOK" || (data.webhookUrl && data.webhookUrl.length > 0),
  {
    message: "Webhook URL requise pour le canal WEBHOOK",
    path: ["webhookUrl"],
  },
);

export const alertUpdateSchema = alertCreateSchemaBase
  .extend({
    isActive: z.boolean().optional(),
  })
  .partial()
  .refine((data) => data.channel !== "WEBHOOK" || (data.webhookUrl && data.webhookUrl.length > 0), {
    message: "Webhook URL requise pour le canal WEBHOOK",
    path: ["webhookUrl"],
  });

// ─── User ───
export const userExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).optional().default("json"),
  trends: z.coerce.boolean().optional().default(false),
});

export const deleteAccountSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation requise" }),
});

// ─── Cron ───
export const cronTrendsSchema = z
  .object({
    nicheSlug: z.string().optional(),
  })
  .optional();

// ─── Trends Refresh ───
export const trendsRefreshSchema = z.object({
  nicheSlug: z.string().optional(),
});

// ─── Trend Scoring (Claude JSON validation) ───
export const TrendScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  velocity: z.number().min(0).optional(),
  reasoning: z.string().optional(),
});

export { z };
