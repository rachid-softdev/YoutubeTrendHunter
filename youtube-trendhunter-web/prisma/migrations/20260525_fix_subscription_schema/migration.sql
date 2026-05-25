CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'TEAM');
ALTER TABLE "Subscription" ADD COLUMN "userId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Subscription" ADD COLUMN "stripeCurrentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ALTER COLUMN "planKey" DROP NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "orgId" DROP NOT NULL;
-- Backfill: map planKey values to plan enum
UPDATE "Subscription" SET "plan" = CASE WHEN "planKey" = 'PRO' THEN 'PRO'::"SubscriptionPlan" WHEN "planKey" = 'TEAM' THEN 'TEAM'::"SubscriptionPlan" ELSE 'FREE'::"SubscriptionPlan" END;
-- Add unique constraint on userId
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId");
-- Drop old unique constraint
DROP INDEX IF EXISTS "Subscription_orgId_planKey_key";
-- Add userId index
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");

-- AuditAction enum
CREATE TYPE "AuditAction" AS ENUM (
  'USER_SIGNUP', 'USER_LOGIN', 'USER_LOGOUT',
  'PLAN_UPGRADE', 'PLAN_DOWNGRADE', 'SUBSCRIPTION_CANCEL', 'SUBSCRIPTION_REACTIVATE',
  'API_TOKEN_CREATE', 'API_TOKEN_DELETE', 'ALERT_CREATE', 'ALERT_DELETE',
  'DATA_EXPORT', 'ACCOUNT_DELETE', 'NICHE_SELECT', 'NICHE_DESELECT',
  'CRON_TRENDS_PROCESSED'
);
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::"AuditAction";
