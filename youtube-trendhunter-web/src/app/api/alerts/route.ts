import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { alertCreateSchema } from "@/lib/schemas";
import { auditLog } from "@/lib/audit-log";
import { withRateLimit } from "@/lib/rate-limit";
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InternalError,
} from "@/lib/api-error";
import { getUserAlerts, createAlert, getAlertById } from "@/lib/services/alert.service";
import { getUserNiches, getNicheById } from "@/lib/services/niche.service";

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "general");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  try {
    const plan = await getUserPlan(session.user.id);
    const limits = PLAN_LIMITS[plan];

    // Execute all queries in parallel for better performance
    const [alerts, userNiches] = await Promise.all([
      getUserAlerts(session.user.id),
      getUserNiches(session.user.id),
    ]);

    return NextResponse.json({
      alerts,
      userNiches,
      plan,
      canCreate: limits.alerts,
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return InternalError();
  }
}

export async function POST(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "general");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  try {
    // Check plan - FREE users cannot create alerts
    const plan = await getUserPlan(session.user.id);
    const limits = PLAN_LIMITS[plan];

    if (!limits.alerts) {
      return ForbiddenError(
        "Les alertes sont disponibles à partir du plan Pro. Passez à Pro pour créer des alertes.",
      );
    }

    // Validate body
    const body = await req.json();
    const parsed = alertCreateSchema.safeParse(body);
    if (!parsed.success) {
      return ValidationError(parsed.error.issues[0].message);
    }

    const { nicheId, type, threshold, channel, webhookUrl } = parsed.data;

    // Verify niche if provided
    if (nicheId) {
      const niche = await getNicheById(nicheId);
      if (!niche) {
        return NotFoundError("Niche");
      }
    }

    // Create alert
    const alert = await createAlert({
      userId: session.user.id,
      nicheId: nicheId || undefined,
      type,
      threshold,
      channel,
      webhookUrl,
    });

    // Audit log
    await auditLog("alert_create", session.user.id, {
      alertType: type,
      channel,
      niche: nicheId || "all",
      plan,
    });

    // Fetch the alert with niche for response
    const fullAlert = await getAlertById(alert.id);

    return NextResponse.json({ alert: fullAlert }, { status: 201 });
  } catch (error) {
    console.error("Error creating alert:", error);
    return InternalError();
  }
}
