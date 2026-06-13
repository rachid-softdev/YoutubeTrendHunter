"use client"

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-gray-500">Une erreur est survenue</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-black text-white rounded-lg text-sm"
      >
        Réessayer
      </button>
    </div>
  )
}
