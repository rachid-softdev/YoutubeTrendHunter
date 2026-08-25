"use client";

export function DevBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold bg-yt-red text-white px-2.5 py-1 rounded-md uppercase tracking-wider ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
      Dev Only
    </span>
  );
}
