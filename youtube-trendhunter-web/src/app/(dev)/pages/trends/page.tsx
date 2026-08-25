"use client";

import { notFound } from "next/navigation";
import { DevBadge } from "@/components/dev/DevBadge";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

const TREND_PIPELINE = [
  {
    step: 1,
    name: "Collect",
    icon: "📡",
    status: "complete" as const,
    description: "YouTube Data API v3 — trending videos, search, channels",
    duration: "2.1s",
  },
  {
    step: 2,
    name: "Enrich",
    icon: "📊",
    status: "complete" as const,
    description: "View velocity, engagement ratio, channel authority",
    duration: "1.4s",
  },
  {
    step: 3,
    name: "Score",
    icon: "🤖",
    status: "active" as const,
    description: "Claude evaluates trend quality and niche relevance",
    duration: "3.2s...",
  },
  {
    step: 4,
    name: "Classify",
    icon: "🏷️",
    status: "pending" as const,
    description: "Category tagging, competitor mapping",
    duration: "—",
  },
  {
    step: 5,
    name: "Alert",
    icon: "🔔",
    status: "pending" as const,
    description: "Email/webhook notification for high-score trends",
    duration: "—",
  },
];

const MOCK_TRENDS = [
  {
    title: "IA generative pour shorts YouTube",
    score: 92,
    velocity: "+340%",
    category: "AI/ML",
    age: "2h",
  },
  {
    title: "Tutoriels CapCut avancés 2026",
    score: 87,
    velocity: "+210%",
    category: "Editing",
    age: "4h",
  },
  {
    title: "Routine productivité créateur",
    score: 78,
    velocity: "+150%",
    category: "Lifestyle",
    age: "6h",
  },
  {
    title: "Setup home studio budget",
    score: 71,
    velocity: "+95%",
    category: "Equipment",
    age: "8h",
  },
];

const STATUS_STYLES = {
  complete: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  active: {
    bg: "bg-yt-red/10",
    border: "border-yt-red/20",
    text: "text-yt-red",
    dot: "bg-yt-red animate-pulse",
  },
  pending: {
    bg: "bg-dark-surface",
    border: "border-hairline-dark",
    text: "text-dark-ink-tertiary",
    dot: "bg-dark-ink-tertiary",
  },
};

export default function TrendsPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <DevBadge />
            <h1 className="text-2xl font-bold">Trend Pipeline Inspector</h1>
          </div>
          <p className="text-dark-ink-secondary">
            Real-time trend detection pipeline. Each step can be inspected and retried in debug
            mode.
          </p>
        </div>

        {/* Pipeline steps */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Pipeline Steps</h2>
          <div className="space-y-3">
            {TREND_PIPELINE.map((step, i) => {
              const style = STATUS_STYLES[step.status];
              return (
                <div key={step.step} className="flex items-stretch gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-xl ${style.bg} border ${style.border} flex items-center justify-center flex-shrink-0`}
                    >
                      <span className="text-lg">{step.icon}</span>
                    </div>
                    {i < TREND_PIPELINE.length - 1 && (
                      <div className="w-px flex-1 bg-hairline-dark my-1" />
                    )}
                  </div>
                  <div className={`flex-1 p-4 rounded-xl border ${style.border} ${style.bg} mb-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                        <h3 className={`text-sm font-semibold ${style.text}`}>
                          Step {step.step}: {step.name}
                        </h3>
                      </div>
                      <span className="text-xs text-dark-ink-tertiary font-mono">
                        {step.duration}
                      </span>
                    </div>
                    <p className="text-xs text-dark-ink-secondary mt-1">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Mock trending data */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Detected Trends (mock)</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark overflow-hidden">
            <div className="px-4 py-3 bg-dark-canvas border-b border-hairline-dark grid grid-cols-12 gap-4 text-[10px] font-medium text-dark-ink-tertiary uppercase tracking-wider">
              <span className="col-span-5">Title</span>
              <span className="col-span-2">Score</span>
              <span className="col-span-2">Velocity</span>
              <span className="col-span-1">Category</span>
              <span className="col-span-2">Age</span>
            </div>
            {MOCK_TRENDS.map((trend) => (
              <div
                key={trend.title}
                className="px-4 py-3 border-b border-hairline-dark last:border-0 grid grid-cols-12 gap-4 items-center text-sm"
              >
                <span className="col-span-5 font-medium truncate">{trend.title}</span>
                <span className="col-span-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                      trend.score >= 85
                        ? "bg-emerald-500/20 text-emerald-400"
                        : trend.score >= 70
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-dark-surface text-dark-ink-tertiary"
                    }`}
                  >
                    {trend.score}
                  </span>
                </span>
                <span className="col-span-2 text-emerald-400 text-xs font-medium">
                  {trend.velocity}
                </span>
                <span className="col-span-1 text-dark-ink-secondary text-xs">{trend.category}</span>
                <span className="col-span-2 text-dark-ink-tertiary text-xs">{trend.age}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Technical notes */}
        <section className="border-t border-hairline-dark pt-8">
          <h2 className="text-lg font-semibold mb-4">Pipeline Files</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6 text-sm text-dark-ink-secondary space-y-1">
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/trends/</code> — Trend
              detection pipeline
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/ai/</code> — Claude
              scoring integration
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/youtube/</code> —
              YouTube Data API client
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
