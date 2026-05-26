import { prisma } from "@/lib/prisma";
import { sendAlertEmail, sendDigestEmail } from "@/lib/email";
import { validateWebhookUrl } from "@/lib/validate-url";
import type { Alert, Trend } from "@prisma/client";

type WebhookAlert = Alert & {
  webhookUrl: string | null;
};

export async function sendWebhookAlert(alert: WebhookAlert, trends: Trend[]): Promise<boolean> {
  const webhookUrl = alert.webhookUrl;
  if (!webhookUrl) return false;

  const validation = await validateWebhookUrl(webhookUrl);
  if (!validation.valid) {
    console.error("[Alerts] Webhook URL rejected:", validation.error, "URL:", webhookUrl);
    return false;
  }

  try {
    const payload = {
      event: "trend_alert",
      alert: {
        id: alert.id,
        type: alert.type,
        threshold: alert.threshold,
        nicheId: alert.nicheId,
      },
      trends: trends.map((t) => ({
        id: t.id,
        title: t.title,
        score: t.score,
        status: t.status,
        avgViews: t.avgViews,
        velocity: t.velocity,
        detectedAt: t.detectedAt.toISOString(),
      })),
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TrendHunter/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch (error) {
    console.error("Webhook failed:", error);
    return false;
  }
}

export async function checkAlertsForUser(userId: string): Promise<number> {
  const alerts = await prisma.alert.findMany({
    where: { userId, isActive: true },
    include: { user: { select: { email: true } } },
  });

  let sent = 0;

  for (const alert of alerts) {
    const trends = await getTrendsForAlert(alert);
    if (trends.length === 0) continue;

    // Handle webhook alerts
    if (alert.channel === "WEBHOOK" && alert.webhookUrl) {
      const success = await sendWebhookAlert(alert as WebhookAlert, trends);
      if (success) {
        sent++;
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastSentAt: new Date() },
        });
      }
      continue;
    }

    // Handle email alerts
    if (!alert.user.email) continue;

    switch (alert.type) {
      case "SCORE_THRESHOLD": {
        const matching = trends.filter((t) => t.score >= alert.threshold);
        if (matching.length > 0) {
          await sendAlertEmail(
            alert.user.email,
            "Vos niches",
            matching.map((t) => ({ title: t.title, score: t.score })),
          );
          sent++;
        }
        break;
      }
      case "DAILY_DIGEST": {
        await sendDigestEmail(
          alert.user.email,
          "Vos niches",
          trends.map((t) => ({ title: t.title, score: t.score, status: t.status })),
        );
        sent++;
        break;
      }
      case "SPIKE": {
        const spikes = trends.filter((t) => t.velocity >= alert.threshold);
        if (spikes.length > 0) {
          await sendAlertEmail(
            alert.user.email,
            "Pic d'activité",
            spikes.map((t) => ({ title: t.title, score: t.score })),
          );
          sent++;
        }
        break;
      }
    }

    if (sent > 0) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastSentAt: new Date() },
      });
    }
  }

  return sent;
}

async function getTrendsForAlert(alert: Alert): Promise<Trend[]> {
  const where: Record<string, unknown> = {
    expiresAt: { gte: new Date() },
  };

  if (alert.nicheId) {
    where.nicheId = alert.nicheId;
  }

  return prisma.trend.findMany({
    where,
    orderBy: { score: "desc" },
    take: 10,
  });
}

export async function createAlert(data: {
  userId: string;
  nicheId?: string;
  type: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE";
  threshold: number;
  channel: "EMAIL" | "WEBHOOK";
  webhookUrl?: string;
}): Promise<Alert> {
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

export async function updateAlert(
  id: string,
  userId: string,
  data: {
    type?: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE";
    threshold?: number;
    channel?: "EMAIL" | "WEBHOOK";
    isActive?: boolean;
    nicheId?: string | null;
  },
): Promise<Alert> {
  return prisma.alert.update({ where: { id, userId }, data });
}

export async function deleteAlert(id: string, userId: string): Promise<void> {
  await prisma.alert.delete({ where: { id, userId } });
}

export async function checkAllUsers(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { alerts: { some: { isActive: true } } },
    select: { id: true },
  });

  let totalSent = 0;
  for (const user of users) {
    totalSent += await checkAlertsForUser(user.id);
  }

  return totalSent;
}
