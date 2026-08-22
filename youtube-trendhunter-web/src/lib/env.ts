import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_PRO_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_TEAM_PRICE_ID: z.string().startsWith("price_"),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  YOUTUBE_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().startsWith("re_"),
  CRON_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_URL: z.string().url().optional(),
  HEALTH_CHECK_SECRET: z.string().min(16).optional(),
  ADMIN_EMAILS: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    console.error(`[ENV] Invalid environment variables:\n  ${missing}`);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Invalid environment configuration:\n  ${missing}`);
    }
  }
}
