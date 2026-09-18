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
}
