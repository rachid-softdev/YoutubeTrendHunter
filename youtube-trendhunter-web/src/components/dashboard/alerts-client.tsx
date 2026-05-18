"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bell, Zap, Plus, X, Loader2 } from "lucide-react"
import { AlertForm } from "./alert-form"
import { AlertList } from "./alert-list"

interface AlertData {
  id: string
  type: string
  threshold: number
  channel: string
  isActive: boolean
  niche: { id: string; name: string; slug: string } | null
}

interface NicheData {
  niche: { id: string; name: string; slug: string }
}

interface AlertsClientProps {
  alerts: AlertData[]
  userNiches: NicheData[]
  plan: string
  canCreate: boolean
}

export function AlertsClient({
  alerts: initialAlerts,
  userNiches,
  plan,
  canCreate,
}: AlertsClientProps) {
  const [alerts, setAlerts] = useState<AlertData[]>(initialAlerts)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Cleanup all pending requests on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => {
        controller.abort()
      })
      abortControllersRef.current.clear()
    }
  }, [])

  const handleCreateAlert = useCallback(async (data: {
    type: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE"
    threshold: number
    channel: "EMAIL" | "WEBHOOK"
    nicheId?: string
  }) => {
    const controller = new AbortController()
    abortControllersRef.current.set("create", controller)

    setIsLoading(true)
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erreur lors de la création")
      }

      const result = await response.json()
      setAlerts((prev) => [result.alert, ...prev])
      setIsCreating(false)
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      throw error
    } finally {
      setIsLoading(false)
      abortControllersRef.current.delete("create")
    }
  }, [])

  const handleToggleActive = useCallback(async (alertId: string, isActive: boolean) => {
    const controller = new AbortController()
    abortControllersRef.current.set(`toggle-${alertId}`, controller)

    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error("Erreur lors de la mise à jour")
      }

      const result = await response.json()
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? result.alert : a))
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      throw error
    } finally {
      abortControllersRef.current.delete(`toggle-${alertId}`)
    }
  }, [])

  const handleDeleteAlert = useCallback(async (alertId: string) => {
    const controller = new AbortController()
    abortControllersRef.current.set(`delete-${alertId}`, controller)

    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "DELETE",
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error("Erreur lors de la suppression")
      }

      setAlerts((prev) => prev.filter((a) => a.id !== alertId))
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      throw error
    } finally {
      abortControllersRef.current.delete(`delete-${alertId}`)
    }
  }, [])

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Alertes</h1>
          <p className="text-dark-ink-secondary mt-1">
            Recevez des notifications quand les tendances changent
          </p>
        </div>
        {canCreate && !isCreating && (
          <Button
            onClick={() => setIsCreating(true)}
            className="rounded-none"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle alerte
          </Button>
        )}
      </div>

      {/* Plan restrictions for FREE users */}
      {!canCreate && (
        <Alert variant="warning" className="mb-6 rounded-none">
          <Zap className="h-4 w-4" />
          <AlertTitle>Fonctionnalité Pro</AlertTitle>
          <AlertDescription>
            Les alertes sont disponibles à partir du plan Pro.{" "}
            <a href="/pricing" className="font-medium underline">
              Passer à Pro →
            </a>
          </AlertDescription>
        </Alert>
      )}

      {/* Create form */}
      {isCreating && canCreate && (
        <Card className="mb-6 rounded-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Nouvelle alerte</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <AlertForm
              userNiches={userNiches}
              onSubmit={handleCreateAlert}
              onCancel={() => setIsCreating(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Alert list */}
      <AlertList
        alerts={alerts}
        onToggleActive={handleToggleActive}
        onDelete={handleDeleteAlert}
      />
    </div>
  )
}