import { auth } from "@/lib/auth";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { AlertsClient } from "@/components/dashboard/alerts-client";
import { getUserAlerts } from "@/lib/services/alert.service";
import { getUserNiches } from "@/lib/services/niche.service";

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const plan = await getUserPlan(session.user.id);
  const limits = PLAN_LIMITS[plan];

  const [alerts, userNiches] = await Promise.all([
    getUserAlerts(session.user.id),
    getUserNiches(session.user.id),
  ]);

  return (
    <AlertsClient alerts={alerts} userNiches={userNiches} plan={plan} canCreate={limits.alerts} />
  );
}
