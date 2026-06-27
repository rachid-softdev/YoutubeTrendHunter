"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Mail, Webhook, Trash2, Loader2 } from "lucide-react";

interface AlertListProps {
  alerts: Array<{
    id: string;
    type: string;
    threshold: number;
    channel: string;
    isActive: boolean;
    niche: { id: string; name: string; slug: string } | null;
  }>;
  onToggleActive: (alertId: string, isActive: boolean) => Promise<void>;
  onDelete: (alertId: string) => Promise<void>;
}

export function AlertList({ alerts, onToggleActive, onDelete }: AlertListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "SCORE_THRESHOLD":
        return "default";
      case "DAILY_DIGEST":
        return "secondary";
      case "SPIKE":
        return "destructive";
      default:
        return "default";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "SCORE_THRESHOLD":
        return "Score seuil";
      case "DAILY_DIGEST":
        return "Résumé quotidien";
      case "SPIKE":
        return "Pic d'activité";
      default:
        return type;
    }
  };

  const handleToggle = async (alertId: string, currentActive: boolean) => {
    setLoadingId(alertId);
    try {
      await onToggleActive(alertId, !currentActive);
    } catch (error) {
      console.error("Error toggling alert:", error);
      alert("Erreur lors de la mise à jour");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (alertId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette alerte ?")) return;

    setDeletingId(alertId);
    try {
      await onDelete(alertId);
    } catch (error) {
      console.error("Error deleting alert:", error);
      alert("Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  if (alerts.length === 0) {
    return (
      <Card className="rounded-none">
        <CardContent className="py-12 text-center text-dark-ink-secondary">
          <Bell className="w-8 h-8 mx-auto mb-2 text-dark-ink-tertiary" />
          <p>Aucune alerte configurée</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Card key={alert.id} className="rounded-none">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant={
                    getTypeBadgeVariant(alert.type) as "default" | "secondary" | "destructive"
                  }
                >
                  {getTypeLabel(alert.type)}
                </Badge>
                {alert.type !== "DAILY_DIGEST" && (
                  <span className="text-sm text-dark-ink-secondary">Seuil: {alert.threshold}%</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-dark-ink-tertiary">
                <span className="flex items-center gap-1">
                  {alert.channel === "EMAIL" ? (
                    <Mail className="w-3 h-3" />
                  ) : (
                    <Webhook className="w-3 h-3" />
                  )}
                  {alert.channel === "EMAIL" ? "Email" : "Webhook"}
                </span>
                {alert.niche && (
                  <span className="text-dark-ink-secondary">• {alert.niche.name}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Active toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(alert.id, alert.isActive)}
                disabled={loadingId === alert.id}
                className="text-xs"
              >
                {loadingId === alert.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : alert.isActive ? (
                  <span className="text-green-500">Actif</span>
                ) : (
                  <span className="text-dark-ink-tertiary">Inactif</span>
                )}
              </Button>

              {/* Delete button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(alert.id)}
                disabled={deletingId === alert.id}
                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                {deletingId === alert.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
