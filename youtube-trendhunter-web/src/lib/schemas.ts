import { z } from "zod";

// ─── Stripe ───
export const checkoutSchema = z.object({
  priceId: z.string().min(1, "Price ID requis"),
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
  .refine(
    (data) => data.channel !== "WEBHOOK" || (data.webhookUrl && data.webhookUrl.length > 0),
    {
      message: "Webhook URL requise pour le canal WEBHOOK",
      path: ["webhookUrl"],
    },
  );

// ─── User ───
export const deleteAccountSchema = z.object({
  confirm: z.literal(true, { message: "Confirmation requise" }),
});

// ─── Trends Refresh ───
export const trendsRefreshSchema = z.object({
  nicheSlug: z.string().optional(),
});

export { z };
