export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse-glow">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-dark-surface rounded" />
          <div className="h-4 w-64 bg-dark-surface rounded" />
        </div>
        <div className="h-10 w-40 bg-dark-surface rounded-full" />
      </div>

      {/* Trend cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-6 bg-dark-surface border border-hairline-dark space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-dark-overlay rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-dark-overlay rounded w-3/4" />
                <div className="h-3 bg-dark-overlay rounded w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 bg-dark-overlay rounded w-full" />
              <div className="h-3 bg-dark-overlay rounded w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
