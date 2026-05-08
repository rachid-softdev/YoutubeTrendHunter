import { auth } from "@/lib/auth"
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan-check"
import { Button } from "@/components/ui/button"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Bell, Zap } from "lucide-react"

export default async function AlertsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)
  const limits = PLAN_LIMITS[plan]

  const canCreateAlert = plan !== "FREE" || limits.alerts

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Alertes</h1>
        <p className="text-dark-ink-secondary mt-1">
          Recevez des notifications quand les tendances changent
        </p>
      </div>

      {!canCreateAlert && (
        <Alert variant="warning" className="mb-6 rounded-none">
          <Zap className="h-4 w-4" />
          <AlertTitle>Fonctionnalité Pro</AlertTitle>
          <AlertDescription>
            Les alertes sont disponibles à partir du plan Pro.{" "}
            <a href="/pricing" className="font-medium underline">
              Passer Pro →
            </a>
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-none">
        <CardContent className="py-12 text-center text-dark-ink-secondary">
          <Bell className="w-8 h-8 mx-auto mb-2 text-dark-ink-tertiary" />
          <p>Aucune alerte configurée</p>
          {canCreateAlert && (
            <Button className="mt-4" variant="default">Créer une alerte</Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}