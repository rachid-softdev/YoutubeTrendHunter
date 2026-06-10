import { prisma } from "@/lib/prisma";
import type { Alert } from "@prisma/client";

// ─── Types ───

export type AlertCreateInput = {
  userId: string;
  nicheId?: string;
  type: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE";
  threshold: number;
  channel: "EMAIL" | "WEBHOOK";
  webhookUrl?: string;
};

export type AlertUpdateInput = {
  nicheId?: string | null;
  type?: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE";
  threshold?: number;
  channel?: "EMAIL" | "WEBHOOK";
  webhookUrl?: string;
  isActive?: boolean;
};

// ─── Queries ───

/**
 * Get all alerts for a user with niche info.
 */
export async function getUserAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId },
    include: {
      niche: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single alert by ID with niche info.
 */
export async function getAlertById(id: string) {
  return prisma.alert.findUnique({
    where: { id },
    include: {
      niche: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
}

/**
 * Create a new alert.
 */
export async function createAlert(data: AlertCreateInput): Promise<Alert> {
  return prisma.alert.create({
    data: {
      userId: data.userId,
      nicheId: data.nicheId ?? null,
      type: data.type,
      threshold: data.threshold,
      channel: data.channel,
      webhookUrl: data.webhookUrl ?? null,
    },
  });
}

/**
 * Update an existing alert. Ownership should be verified by the caller.
 */
export async function updateAlert(id: string, data: AlertUpdateInput): Promise<Alert> {
  return prisma.alert.update({ where: { id }, data });
}

/**
 * Delete an alert by ID. Ownership should be verified by the caller.
 */
export async function deleteAlert(id: string): Promise<void> {
  await prisma.alert.delete({ where: { id } });
}

/**
 * Count active alerts.
 */
export async function getActiveAlertCount() {
  return prisma.alert.count({ where: { isActive: true } });
}
