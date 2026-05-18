// ============================================
// Migration Script: Create initial Plans, Features, and migrate Subscriptions
// Usage: npx tsx scripts/migrate-entitlements.ts
// ============================================

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("[Migration] Starting entitlements migration...")

  // ============================================
  // 1. Create Plans
  // ============================================
  console.log("[Migration] Creating plans...")

  const plans = [
    {
      key: "free",
      name: "Free",
      priceMonthly: 0,
      isActive: true,
      sortOrder: 0
    },
    {
      key: "pro",
      name: "Pro",
      priceMonthly: 1500, // 15 EUR in cents
      isActive: true,
      sortOrder: 1
    },
    {
      key: "team",
      name: "Team",
      priceMonthly: 3900, // 39 EUR in cents
      isActive: true,
      sortOrder: 2
    },
    {
      key: "enterprise",
      name: "Enterprise",
      priceMonthly: 0, // Custom pricing
      isActive: true,
      sortOrder: 3
    }
  ]

  for (const planData of plans) {
    await prisma.plan.upsert({
      where: { key: planData.key },
      update: planData,
      create: planData
    })
    console.log(`  - Plan: ${planData.key}`)
  }

  // ============================================
  // 2. Create Features
  // ============================================
  console.log("[Migration] Creating features...")

  const features = [
    {
      key: "UNLIMITED_NICHES",
      name: "Unlimited Niches",
      description: "Follow unlimited niches instead of just 1",
      type: "BOOLEAN" as const
    },
    {
      key: "UNLIMITED_TRENDS",
      name: "Unlimited Trends",
      description: "View unlimited trends per niche",
      type: "BOOLEAN" as const
    },
    {
      key: "REALTIME_ALERTS",
      name: "Real-time Alerts",
      description: "Receive real-time alerts when trends emerge",
      type: "BOOLEAN" as const
    },
    {
      key: "AI_ANGLES",
      name: "AI Content Angles",
      description: "Get AI-generated content angle suggestions",
      type: "BOOLEAN" as const
    },
    {
      key: "EXPORT_CSV",
      name: "CSV Export",
      description: "Export trends data to CSV",
      type: "LIMIT" as const,
      defaultConfig: null
    },
    {
      key: "API_ACCESS",
      name: "API Access",
      description: "Programmatic access via REST API",
      type: "BOOLEAN" as const
    },
    {
      key: "WEBHOOKS",
      name: "Webhooks",
      description: "Configure webhooks for notifications",
      type: "BOOLEAN" as const
    },
    {
      key: "TEAM_MEMBERS",
      name: "Team Members",
      description: "Number of team members",
      type: "LIMIT" as const,
      defaultConfig: { maxMembers: 5 }
    },
    {
      key: "NEW_DASHBOARD",
      name: "New Dashboard (Beta)",
      description: "A/B test: new dashboard design",
      type: "EXPERIMENT" as const,
      defaultConfig: { percentage: 50, seed: "NEW_DASHBOARD_v1" }
    }
  ]

  for (const featureData of features) {
    await prisma.feature.upsert({
      where: { key: featureData.key },
      update: featureData,
      create: featureData
    })
    console.log(`  - Feature: ${featureData.key}`)
  }

  // ============================================
  // 3. Create Plan Features
  // ============================================
  console.log("[Migration] Creating plan features...")

  // Get plan and feature IDs
  const freePlan = await prisma.plan.findUnique({ where: { key: "free" } })
  const proPlan = await prisma.plan.findUnique({ where: { key: "pro" } })
  const teamPlan = await prisma.plan.findUnique({ where: { key: "team" } })
  const enterprisePlan = await prisma.plan.findUnique({ where: { key: "enterprise" } })

  const planFeatures = [
    // FREE plan
    { planId: freePlan!.id, featureKey: "UNLIMITED_NICHES", enabled: false },
    { planId: freePlan!.id, featureKey: "UNLIMITED_TRENDS", enabled: false, limitValue: 5 },
    { planId: freePlan!.id, featureKey: "REALTIME_ALERTS", enabled: false },
    { planId: freePlan!.id, featureKey: "AI_ANGLES", enabled: false },
    { planId: freePlan!.id, featureKey: "EXPORT_CSV", enabled: false, limitValue: 0 },
    { planId: freePlan!.id, featureKey: "API_ACCESS", enabled: false },
    { planId: freePlan!.id, featureKey: "WEBHOOKS", enabled: false },
    { planId: freePlan!.id, featureKey: "TEAM_MEMBERS", enabled: false, limitValue: 1 },
    { planId: freePlan!.id, featureKey: "NEW_DASHBOARD", enabled: true, configJson: { percentage: 10, seed: "NEW_DASHBOARD_v1" } },

    // PRO plan
    { planId: proPlan!.id, featureKey: "UNLIMITED_NICHES", enabled: true },
    { planId: proPlan!.id, featureKey: "UNLIMITED_TRENDS", enabled: true, limitValue: null }, // null = unlimited
    { planId: proPlan!.id, featureKey: "REALTIME_ALERTS", enabled: true },
    { planId: proPlan!.id, featureKey: "AI_ANGLES", enabled: true },
    { planId: proPlan!.id, featureKey: "EXPORT_CSV", enabled: true, limitValue: 100 },
    { planId: proPlan!.id, featureKey: "API_ACCESS", enabled: false },
    { planId: proPlan!.id, featureKey: "WEBHOOKS", enabled: false },
    { planId: proPlan!.id, featureKey: "TEAM_MEMBERS", enabled: false, limitValue: 1 },
    { planId: proPlan!.id, featureKey: "NEW_DASHBOARD", enabled: true, configJson: { percentage: 50, seed: "NEW_DASHBOARD_v1" } },

    // TEAM plan
    { planId: teamPlan!.id, featureKey: "UNLIMITED_NICHES", enabled: true },
    { planId: teamPlan!.id, featureKey: "UNLIMITED_TRENDS", enabled: true, limitValue: null },
    { planId: teamPlan!.id, featureKey: "REALTIME_ALERTS", enabled: true },
    { planId: teamPlan!.id, featureKey: "AI_ANGLES", enabled: true },
    { planId: teamPlan!.id, featureKey: "EXPORT_CSV", enabled: true, limitValue: null }, // unlimited
    { planId: teamPlan!.id, featureKey: "API_ACCESS", enabled: true },
    { planId: teamPlan!.id, featureKey: "WEBHOOKS", enabled: true },
    { planId: teamPlan!.id, featureKey: "TEAM_MEMBERS", enabled: true, limitValue: 5 },
    { planId: teamPlan!.id, featureKey: "NEW_DASHBOARD", enabled: true, configJson: { percentage: 100, seed: "NEW_DASHBOARD_v1" } },

    // ENTERPRISE plan
    { planId: enterprisePlan!.id, featureKey: "UNLIMITED_NICHES", enabled: true },
    { planId: enterprisePlan!.id, featureKey: "UNLIMITED_TRENDS", enabled: true, limitValue: null },
    { planId: enterprisePlan!.id, featureKey: "REALTIME_ALERTS", enabled: true },
    { planId: enterprisePlan!.id, featureKey: "AI_ANGLES", enabled: true },
    { planId: enterprisePlan!.id, featureKey: "EXPORT_CSV", enabled: true, limitValue: null },
    { planId: enterprisePlan!.id, featureKey: "API_ACCESS", enabled: true },
    { planId: enterprisePlan!.id, featureKey: "WEBHOOKS", enabled: true },
    { planId: enterprisePlan!.id, featureKey: "TEAM_MEMBERS", enabled: true, limitValue: null }, // unlimited
    { planId: enterprisePlan!.id, featureKey: "NEW_DASHBOARD", enabled: true, configJson: { percentage: 100, seed: "NEW_DASHBOARD_v1" } }
  ]

  for (const pf of planFeatures) {
    const feature = await prisma.feature.findUnique({ where: { key: pf.featureKey } })
    
    await prisma.planFeature.upsert({
      where: {
        planId_featureId: {
          planId: pf.planId,
          featureId: feature!.id
        }
      },
      update: {
        enabled: pf.enabled,
        limitValue: pf.limitValue ?? undefined,
        configJson: pf.configJson ?? undefined
      },
      create: {
        planId: pf.planId,
        featureId: feature!.id,
        enabled: pf.enabled,
        limitValue: pf.limitValue ?? undefined,
        configJson: pf.configJson ?? undefined
      }
    })
    console.log(`  - Plan ${pf.featureKey}: ${pf.enabled ? "enabled" : "disabled"}${pf.limitValue !== undefined ? ` (limit: ${pf.limitValue})` : ""}`)
  }

  // ============================================
  // 4. Migrate existing subscriptions to Organization model
  // ============================================
  console.log("[Migration] Migrating existing users/organizations...")

  // Get users with existing subscriptions
  const usersWithSubscriptions = await prisma.user.findMany({
    where: {
      subscription: {
        isNot: null
      }
    },
    include: {
      subscription: true
    }
  })

  for (const user of usersWithSubscriptions) {
    if (!user.subscription) continue

    // Create or get organization for user
    let org = await prisma.organization.findFirst({
      where: { users: { some: { id: user.id } } }
    })

    if (!org) {
      // Create new organization
      org = await prisma.organization.create({
        data: {
          name: `${user.email}'s Organization`,
          stripeCustomerId: user.stripeCustomerId,
          users: {
            connect: { id: user.id }
          }
        }
      })
    }

    // Create subscription in new model
    await prisma.subscription.upsert({
      where: {
        orgId_planKey: {
          orgId: org.id,
          planKey: user.subscription.plan.toLowerCase()
        }
      },
      update: {
        status: mapStatus(user.subscription.status),
        stripeSubscriptionId: user.subscription.stripeSubscriptionId,
        stripePriceId: user.subscription.stripePriceId,
        currentPeriodStart: user.subscription.stripeCurrentPeriodEnd 
          ? new Date(user.subscription.stripeCurrentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
          : undefined,
        currentPeriodEnd: user.subscription.stripeCurrentPeriodEnd,
        trialEnd: user.subscription.trialEnd,
        trialStart: user.subscription.trialStart
      },
      create: {
        orgId: org.id,
        planKey: user.subscription.plan.toLowerCase(),
        status: mapStatus(user.subscription.status),
        stripeSubscriptionId: user.subscription.stripeSubscriptionId,
        stripePriceId: user.subscription.stripePriceId,
        currentPeriodStart: user.subscription.stripeCurrentPeriodEnd 
          ? new Date(user.subscription.stripeCurrentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
          : new Date(),
        currentPeriodEnd: user.subscription.stripeCurrentPeriodEnd,
        trialEnd: user.subscription.trialEnd,
        trialStart: user.subscription.trialStart
      }
    })

    console.log(`  - Migrated user ${user.email} -> org ${org.id}`)
  }

  // Create organizations for users without existing subscription
  const usersWithoutOrg = await prisma.user.findMany({
    where: {
      orgId: null
    }
  })

  for (const user of usersWithoutOrg) {
    const org = await prisma.organization.create({
      data: {
        name: `${user.email}'s Organization`,
        stripeCustomerId: user.stripeCustomerId,
        users: {
          connect: { id: user.id }
        }
      }
    })

    // Create FREE subscription
    await prisma.subscription.create({
      data: {
        orgId: org.id,
        planKey: "free",
        status: "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      }
    })

    console.log(`  - Created org for ${user.email}`)
  }

  console.log("[Migration] Complete!")
}

function mapStatus(oldStatus: string): "ACTIVE" | "CANCELED" | "PAST_DUE" | "TRIALING" | "INCOMPLETE" {
  switch (oldStatus) {
    case "ACTIVE": return "ACTIVE"
    case "CANCELED": return "CANCELED"
    case "PAST_DUE": return "PAST_DUE"
    case "TRIALING": return "TRIALING"
    case "INCOMPLETE": return "INCOMPLETE"
    default: return "ACTIVE"
  }
}

main()
  .catch((e) => {
    console.error("[Migration] Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })