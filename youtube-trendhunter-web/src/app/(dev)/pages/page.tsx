"use client";

import { notFound } from "next/navigation";
import { DevBadge } from "@/components/dev/DevBadge";
import { PagePreview } from "@/components/dev/PagePreview";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

const STATE_PAGES = [
  { title: "404 — Page introuvable", url: "/dev/404-preview" },
  { title: "Error — Erreur applicative", url: "/dev/pages/error" },
  { title: "Global Error — Erreur critique", url: "/dev/pages/global-error" },
];

export default function DevPagesHub() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <DevBadge />
            <h1 className="text-2xl font-bold">Dev Pages</h1>
          </div>
          <p className="text-dark-ink-secondary">
            Trend pipeline inspector, AI scorer debug, email previews, and app state previews.
          </p>
        </div>

        {/* Quick links */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href="/dev/pages/trends"
              className="block p-5 rounded-xl border border-hairline-dark bg-dark-surface hover:border-yt-red/50 transition-colors"
            >
              <span className="text-2xl mb-2 block">📈</span>
              <h3 className="text-sm font-semibold">Trend Pipeline</h3>
              <p className="text-xs text-dark-ink-secondary mt-1">
                Trend detection + cache inspector
              </p>
            </a>
            <a
              href="/dev/pages/ai-scorer"
              className="block p-5 rounded-xl border border-hairline-dark bg-dark-surface hover:border-yt-red/50 transition-colors"
            >
              <span className="text-2xl mb-2 block">🤖</span>
              <h3 className="text-sm font-semibold">AI Scorer Debug</h3>
              <p className="text-xs text-dark-ink-secondary mt-1">Test trend scoring with Claude</p>
            </a>
            <a
              href="/dev/pages/email-preview"
              className="block p-5 rounded-xl border border-hairline-dark bg-dark-surface hover:border-yt-red/50 transition-colors"
            >
              <span className="text-2xl mb-2 block">📧</span>
              <h3 className="text-sm font-semibold">Email Templates</h3>
              <p className="text-xs text-dark-ink-secondary mt-1">Alert + digest email previews</p>
            </a>
            <a
              href="/dev/brand"
              className="block p-5 rounded-xl border border-hairline-dark bg-dark-surface hover:border-yt-red/50 transition-colors"
            >
              <span className="text-2xl mb-2 block">🎯</span>
              <h3 className="text-sm font-semibold">Brand & Design</h3>
              <p className="text-xs text-dark-ink-secondary mt-1">Colors, typography, tokens</p>
            </a>
          </div>
        </section>

        {/* State pages */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-2">App State Previews</h2>
          <p className="text-dark-ink-secondary mb-6">
            Error states and 404 rendered in isolation.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {STATE_PAGES.map((page) => (
              <PagePreview key={page.url} title={page.title} url={page.url} />
            ))}
          </div>
        </section>

        {/* Technical */}
        <section className="border-t border-hairline-dark pt-8">
          <h2 className="text-lg font-semibold mb-4">Technical Details</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6 text-sm text-dark-ink-secondary space-y-2">
            <p>
              <span className="font-medium text-dark-ink">Protection:</span> New middleware blocks{" "}
              <code className="text-xs bg-dark-canvas px-1 rounded">/dev/*</code> in production via
              rewrite to <code className="text-xs bg-dark-canvas px-1 rounded">/404</code> + layout{" "}
              <code className="text-xs bg-dark-canvas px-1 rounded">notFound()</code> guard.
            </p>
            <p>
              <span className="font-medium text-dark-ink">Brand:</span> YouTube Red{" "}
              <code className="text-xs bg-dark-canvas px-1 rounded">#FF0000</code>, dark canvas{" "}
              <code className="text-xs bg-dark-canvas px-1 rounded">#0F0F0F</code>, Roboto font
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
