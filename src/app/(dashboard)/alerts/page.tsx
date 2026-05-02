import { auth } from "@/lib/auth"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { Button } from "@/components/ui/button"
import { Bell, Mail, Webhook } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"

export default async function AlertsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  const canCreateAlert = plan !== "FREE" || limits.alerts

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Alertes</h1>
          <p className="text-gray-500 mt-1">
            Recevez des notifications quand les tendances changent
          </p>
        </div>
      </div>

      {!canCreateAlert && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Les alertes sont disponibles à partir du plan Pro.{" "}
          <a href="/pricing" className="underline font-medium">
            Passer Pro →
          </a>
        </div>
      )}

      <div className="text-center py-8 text-gray-500">
        <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p>Aucune alerte configurée</p>
        {canCreateAlert && (
          <Button className="mt-4">Créer une alerte</Button>
        )}
      </div>
    </div>
  )
}