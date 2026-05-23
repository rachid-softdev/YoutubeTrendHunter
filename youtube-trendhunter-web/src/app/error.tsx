"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Play, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="bg-yt-red/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <Play className="w-8 h-8 text-yt-red" />
        </div>
        <h1 className="text-3xl font-bold">Une erreur est survenue</h1>
        <p className="text-dark-ink-secondary">
          Quelque chose s&apos;est mal passé. Nos équipes ont été notifiées.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-yt-red hover:bg-yt-red-deep text-white font-bold rounded-full transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Réessayer
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 border border-hairline-dark hover:bg-dark-surface text-dark-ink font-bold rounded-full transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
