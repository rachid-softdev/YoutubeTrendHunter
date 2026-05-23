"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function AuditLogViewer({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/user/audit-logs?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className="text-dark-ink-tertiary text-sm">Chargement...</div>;

  return (
    <Card className="rounded-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-dark-ink-tertiary" />
          <CardTitle className="text-dark-ink">Historique d&apos;activité</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-dark-ink-secondary">Aucune activité récente.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="text-sm border-b border-hairline-dark pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{log.action.replace(/_/g, " ")}</span>
                  <span className="text-xs text-dark-ink-tertiary">
                    {new Date(log.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                {log.ipAddress && (
                  <span className="text-xs text-dark-ink-tertiary">IP: {log.ipAddress}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
