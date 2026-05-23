export type SecurityAlertType =
  | "suspicious_login"
  | "multiple_failed_logins"
  | "rate_limit_exceeded"
  | "api_abuse"
  | "subscription_anomaly"
  | "data_breach_attempt"
  | "payment_failed";

interface SecurityAlert {
  type: SecurityAlertType;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  metadata: Record<string, unknown>;
  userId?: string;
  ip?: string;
}

export async function securityAlert(alert: SecurityAlert) {
  const timestamp = new Date().toISOString();

  console.error(`[SECURITY_ALERT] ${timestamp}`, JSON.stringify(alert));

  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const severityEmoji = { low: "ℹ️", medium: "⚠️", high: "🔴", critical: "🚨" };
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `[SECURITY ${alert.severity.toUpperCase()}] ${alert.type}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${severityEmoji[alert.severity]} ${alert.type}*\n${alert.message}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `\`${timestamp}\` | User: ${alert.userId || "anonymous"} | IP: ${alert.ip || "unknown"}`,
                },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      console.error("Slack security alert failed:", err);
    }
  }
}
