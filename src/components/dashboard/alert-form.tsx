"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Bell, Mail, Webhook } from "lucide-react"

interface AlertFormProps {
  userNiches: Array<{
    niche: { id: string; name: string; slug: string }
  }>
  alert?: {
    id: string
    type: string
    threshold: number
    channel: string
    nicheId: string | null
    isActive: boolean
  }
  onSubmit: (data: {
    type: "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE"
    threshold: number
    channel: "EMAIL" | "WEBHOOK"
    nicheId?: string
  }) => Promise<void>
  onCancel?: () => void
}

export function AlertForm({
  userNiches,
  alert,
  onSubmit,
  onCancel,
}: AlertFormProps) {
  const [type, setType] = useState<string>(alert?.type || "SCORE_THRESHOLD")
  const [threshold, setThreshold] = useState(alert?.threshold || 70)
  const [channel, setChannel] = useState<string>(alert?.channel || "EMAIL")
  const [nicheId, setNicheId] = useState<string>(alert?.nicheId || "all")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await onSubmit({
        type: type as "SCORE_THRESHOLD" | "DAILY_DIGEST" | "SPIKE",
        threshold,
        channel: channel as "EMAIL" | "WEBHOOK",
        nicheId: nicheId === "all" ? undefined : nicheId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setIsLoading(false)
    }
  }

  const getTypeDescription = () => {
    switch (type) {
      case "SCORE_THRESHOLD":
        return "Déclenché quand un trend dépasse un score défini"
      case "DAILY_DIGEST":
        return "Envoie un résumé quotidien de toutes les tendances"
      case "SPIKE":
        return "Déclenché quand la vélocité dépasse un seuil défini"
      default:
        return ""
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Alert Type */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-dark-ink-secondary">
          Type d&apos;alerte
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="flex h-10 w-full items-center justify-between rounded-none border border-hairline-dark bg-dark-canvas px-3 py-2 text-sm text-dark-ink focus:outline-none focus:ring-2 focus:ring-yt-link"
        >
          <option value="SCORE_THRESHOLD">Score seuil</option>
          <option value="DAILY_DIGEST">Résumé quotidien</option>
          <option value="SPIKE">Pic d&apos;activité</option>
        </select>
        <p className="text-xs text-dark-ink-tertiary">{getTypeDescription()}</p>
      </div>

      {/* Threshold (only for SCORE_THRESHOLD and SPIKE) */}
      {type !== "DAILY_DIGEST" && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-dark-ink-secondary">
            Seuil ({threshold}%)
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-dark-ink-tertiary">
            {type === "SCORE_THRESHOLD"
              ? "Déclenchera quand le score dépasse ce seuil"
              : "Déclenchera quand la vélocité dépasse ce seuil"}
          </p>
        </div>
      )}

      {/* Niche */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-dark-ink-secondary">Niche</label>
        <select
          value={nicheId}
          onChange={(e) => setNicheId(e.target.value)}
          className="flex h-10 w-full items-center justify-between rounded-none border border-hairline-dark bg-dark-canvas px-3 py-2 text-sm text-dark-ink focus:outline-none focus:ring-2 focus:ring-yt-link"
        >
          <option value="all">Toutes les niches</option>
          {userNiches.map(({ niche }) => (
            <option key={niche.id} value={niche.id}>
              {niche.name}
            </option>
          ))}
        </select>
      </div>

      {/* Channel */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-dark-ink-secondary">Canal</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="flex h-10 w-full items-center justify-between rounded-none border border-hairline-dark bg-dark-canvas px-3 py-2 text-sm text-dark-ink focus:outline-none focus:ring-2 focus:ring-yt-link"
        >
          <option value="EMAIL">Email</option>
          <option value="WEBHOOK">Webhook</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm rounded-none">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button type="submit" disabled={isLoading} className="rounded-none">
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {alert ? "Mettre à jour" : "Créer l'alerte"}
        </Button>
      </div>
    </form>
  )
}