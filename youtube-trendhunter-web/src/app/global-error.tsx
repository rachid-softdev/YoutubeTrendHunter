"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);

    if (typeof window !== "undefined" && window.Sentry) {
      window.Sentry.captureException(error, {
        extra: {
          digest: error.digest,
        },
      });
    }
  }, [error]);

  return (
    <html lang="fr">
      <body className="min-h-screen bg-dark-canvas text-dark-ink flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="bg-yt-red/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-yt-red" />
          </div>

          <h1 className="text-3xl font-bold">Erreur critique</h1>
          <p className="text-dark-ink-secondary">
            Une erreur inattendue s&apos;est produite. Nos équipes ont été notifiées.
          </p>

          {error.digest && (
            <p className="text-xs text-dark-ink-tertiary">Référence: {error.digest}</p>
          )}

          <Button onClick={reset} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </Button>
        </div>
      </body>
    </html>
  );
}
