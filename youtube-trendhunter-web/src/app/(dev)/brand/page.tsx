"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { DevBadge } from "@/components/dev/DevBadge";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

const COLORS = [
  { name: "YouTube Red", value: "#FF0000", css: "--yt-red" },
  { name: "Red Deep", value: "#CC0000", css: "--yt-red-deep" },
  { name: "Dark Canvas", value: "#0F0F0F", css: "--dark-canvas" },
  { name: "Dark Surface", value: "#1A1A1A", css: "--dark-surface" },
  { name: "Dark Ink", value: "#F1F1F1", css: "--dark-ink" },
  { name: "Dark Ink Secondary", value: "#AAAAAA", css: "--dark-ink-secondary" },
  { name: "Dark Ink Tertiary", value: "#717171", css: "--dark-ink-tertiary" },
  { name: "Hairline Dark", value: "#333333", css: "--hairline-dark" },
];

const FONTS = [
  {
    name: "Roboto",
    family: "Roboto, sans-serif",
    usage: "Body text, UI, everything",
    weights: "400, 500, 700",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
        copied
          ? "bg-emerald-500 text-white"
          : "bg-hairline-dark text-dark-ink-tertiary hover:bg-dark-ink-tertiary/20"
      }`}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

export default function BrandPage() {
  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <DevBadge />
            <h1 className="text-2xl font-bold">Brand & Design System</h1>
          </div>
          <p className="text-dark-ink-secondary">
            TrendHunter design tokens, color palette, typography, and component patterns.
          </p>
        </div>

        {/* Color Palette */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Color Palette</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLORS.map((color) => (
              <div
                key={color.css}
                className="border border-hairline-dark rounded-xl overflow-hidden bg-dark-surface"
              >
                <div className="h-20 w-full" style={{ backgroundColor: color.value }} />
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{color.name}</p>
                    <p className="text-xs text-dark-ink-tertiary font-mono">{color.value}</p>
                    <p className="text-[10px] text-dark-ink-tertiary font-mono mt-0.5">
                      {color.css}
                    </p>
                  </div>
                  <CopyButton text={color.value} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Typography</h2>
          <div className="border border-hairline-dark rounded-xl overflow-hidden bg-dark-surface p-6">
            <p className="text-3xl mb-2" style={{ fontFamily: "Roboto, sans-serif" }}>
              Aa Bb Cc 123
            </p>
            <p className="text-sm font-medium">Roboto</p>
            <p className="text-xs text-dark-ink-secondary">Body text, UI elements, everything</p>
            <p className="text-xs text-dark-ink-tertiary font-mono mt-2">Weights: 400, 500, 700</p>
          </div>
        </section>

        {/* CSS Variables */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">CSS Variables</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6">
            <pre className="text-xs text-dark-ink-tertiary font-mono whitespace-pre-wrap leading-relaxed">
              {`:root {
  --yt-red: #FF0000;
  --yt-red-deep: #CC0000;
  --dark-canvas: #0F0F0F;
  --dark-surface: #1A1A1A;
  --dark-ink: #F1F1F1;
  --dark-ink-secondary: #AAAAAA;
  --dark-ink-tertiary: #717171;
  --hairline-dark: #333333;
  --font-roboto: Roboto, sans-serif;
}`}
            </pre>
          </div>
        </section>

        {/* Component patterns */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6">Component Patterns</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="border border-hairline-dark rounded-xl bg-dark-surface p-6">
              <p className="text-xs text-dark-ink-tertiary uppercase tracking-wider mb-3">
                Button — Primary
              </p>
              <button
                type="button"
                className="px-4 py-2 bg-yt-red hover:bg-yt-red-deep text-white font-bold rounded-full text-sm transition-colors"
              >
                Détecter les tendances
              </button>
            </div>
            <div className="border border-hairline-dark rounded-xl bg-dark-surface p-6">
              <p className="text-xs text-dark-ink-tertiary uppercase tracking-wider mb-3">
                Button — Secondary
              </p>
              <button
                type="button"
                className="px-4 py-2 border border-hairline-dark hover:bg-dark-surface text-dark-ink font-bold rounded-full text-sm transition-colors"
              >
                Voir le dashboard
              </button>
            </div>
            <div className="border border-hairline-dark rounded-xl bg-dark-surface p-6">
              <p className="text-xs text-dark-ink-tertiary uppercase tracking-wider mb-3">
                Score Badge
              </p>
              <div className="flex gap-2">
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold">
                  92
                </span>
                <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold">
                  75
                </span>
                <span className="px-2.5 py-1 bg-dark-canvas text-dark-ink-tertiary rounded-full text-xs font-bold">
                  45
                </span>
              </div>
            </div>
            <div className="border border-hairline-dark rounded-xl bg-dark-surface p-6">
              <p className="text-xs text-dark-ink-tertiary uppercase tracking-wider mb-3">Input</p>
              <input
                type="text"
                placeholder="Rechercher une tendance..."
                className="w-full px-3 py-2 bg-dark-canvas border border-hairline-dark rounded-lg text-sm text-dark-ink placeholder:text-dark-ink-tertiary/50 focus:outline-none focus:ring-2 focus:ring-yt-red/50"
              />
            </div>
          </div>
        </section>

        {/* Technical */}
        <section className="border-t border-hairline-dark pt-8">
          <h2 className="text-lg font-semibold mb-4">Technical Notes</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6 text-sm text-dark-ink-secondary space-y-2">
            <p>
              <span className="font-medium text-dark-ink">Framework:</span> Next.js App Router with
              Tailwind CSS v4
            </p>
            <p>
              <span className="font-medium text-dark-ink">Font:</span> Roboto via next/font/google
            </p>
            <p>
              <span className="font-medium text-dark-ink">Theme:</span> Dark-first with YouTube Red
              accent
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
