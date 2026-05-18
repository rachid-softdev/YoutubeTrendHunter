import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

type AuditAction =
  | "user_signup"
  | "user_login"
  | "user_logout"
  | "plan_upgrade"
  | "plan_downgrade"
  | "subscription_cancel"
  | "subscription_reactivate"
  | "api_token_create"
  | "api_token_delete"
  | "alert_create"
  | "alert_delete"
  | "data_export"
  | "account_delete"
  | "niche_select"
  | "niche_deselect"

interface AuditMeta {
  ip?: string
  userAgent?: string
  plan?: string
  from?: string
  to?: string
  tokenName?: string
  alertType?: string
  niche?: string
  [key: string]: unknown
}

export async function auditLog(action: AuditAction, userId: string, meta: AuditMeta = {}) {
  const timestamp = new Date()

  console.log(JSON.stringify({
    type: "audit",
    timestamp: timestamp.toISOString(),
    action,
    userId,
    ...meta,
  }))

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: meta as Prisma.InputJsonValue,
        createdAt: timestamp,
      },
    })
  } catch (err) {
    console.error("Audit log write failed:", err)
  }
}

export async function getAuditLogs(userId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}