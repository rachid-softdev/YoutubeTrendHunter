import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
  | "niche_deselect";

interface AuditMeta {
  ip?: string;
  userAgent?: string;
  plan?: string;
  from?: string;
  to?: string;
  tokenName?: string;
  alertType?: string;
  niche?: string;
  [key: string]: unknown;
}

function anonymizeIP(ip: string): string {
  if (!ip) return ip;

  // IPv4: keep first 3 octets
  const ipv4Match = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (ipv4Match) return `${ipv4Match[1]}.0`;

  // IPv6: keep first 64 bits (first 4 groups), handle shorthand like ::1
  if (ip.includes(":")) {
    // Normalize IPv6: expand :: to full zeros
    let normalized = ip;
    if (normalized.includes("::")) {
      const parts = normalized.split("::");
      const left = parts[0] ? parts[0].split(":") : [];
      const right = parts[1] ? parts[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      const zeros = Array(missing).fill("0");
      normalized = [...left, ...zeros, ...right].join(":");
    }

    const groups = normalized.split(":");
    // Keep first 4 groups (64 bits), zero out the rest
    const first4 = groups.slice(0, 4);
    // Pad short addresses (like "1" from "::1") with leading zeros
    const padded = first4.map((g) => g.padStart(4, "0"));
    return `${padded.join(":")}::`;
  }

  return "0.0.0.0";
}

export async function auditLog(action: AuditAction, userId: string, meta: AuditMeta = {}) {
  const timestamp = new Date();

  console.log(
    JSON.stringify({
      type: "audit",
      timestamp: timestamp.toISOString(),
      action,
      userId,
      ...meta,
    }),
  );

  // Anonymize IP before storing
  if (meta.ip) {
    meta.ip = anonymizeIP(meta.ip);
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: action as import("@prisma/client").$Enums.AuditAction,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: meta as Prisma.InputJsonValue,
        createdAt: timestamp,
      },
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

export async function getAuditLogs(userId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
