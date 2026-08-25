"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { DevBadge } from "@/components/dev/DevBadge";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

const MOCK_SCORING = {
  input: {
    title: "IA generative pour shorts YouTube",
    channel: "TechCreative FR",
    views: 125000,
    likes: 8900,
    comments: 1200,
    publishedAt: "2h ago",
    category: "AI/ML",
  },
  output: {
    score: 92,
    confidence: 0.87,
    reasoning:
      "Strong early velocity (+340% views/hour), high engagement ratio (7.1%), category trending upward for 3 weeks. Channel authority score: 8.2/10.",
    factors: [
      { name: "Velocity", weight: 0.35, value: 95 },
      { name: "Engagement", weight: 0.25, value: 88 },
      { name: "Category Trend", weight: 0.2, value: 90 },
      { name: "Channel Authority", weight: 0.15, value: 82 },
      { name: "Freshness", weight: 0.05, value: 98 },
    ],
  },
};

export default function AiScorerPage() {
  const [customTitle, setCustomTitle] = useState("");
  const [customViews, setCustomViews] = useState("50000");

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <DevBadge />
            <h1 className="text-2xl font-bold">AI Scorer Debug</h1>
          </div>
          <p className="text-dark-ink-secondary">
            Test how Claude evaluates trend quality. Inspect input, output, and scoring factors.
          </p>
        </div>

        {/* Input form */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Test Input</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-dark-ink-secondary mb-1 block">
                Video Title
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={MOCK_SCORING.input.title}
                className="w-full px-3 py-2 bg-dark-surface border border-hairline-dark rounded-lg text-sm text-dark-ink placeholder:text-dark-ink-tertiary/50 focus:outline-none focus:ring-2 focus:ring-yt-red/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-dark-ink-secondary mb-1 block">
                Views
              </label>
              <input
                type="text"
                value={customViews}
                onChange={(e) => setCustomViews(e.target.value)}
                className="w-full px-3 py-2 bg-dark-surface border border-hairline-dark rounded-lg text-sm text-dark-ink placeholder:text-dark-ink-tertiary/50 focus:outline-none focus:ring-2 focus:ring-yt-red/50"
              />
            </div>
          </div>
        </section>

        {/* Scoring output */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Scoring Output (mock)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score card */}
            <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-yt-red/10 border-4 border-yt-red">
                  <span className="text-3xl font-black text-yt-red">
                    {MOCK_SCORING.output.score}
                  </span>
                </div>
                <p className="text-xs text-dark-ink-tertiary mt-2">
                  Confidence: {(MOCK_SCORING.output.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <p className="text-sm text-dark-ink-secondary leading-relaxed">
                {MOCK_SCORING.output.reasoning}
              </p>
            </div>

            {/* Factor breakdown */}
            <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6">
              <h3 className="text-sm font-semibold mb-4">Scoring Factors</h3>
              <div className="space-y-4">
                {MOCK_SCORING.output.factors.map((factor) => (
                  <div key={factor.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-dark-ink-secondary">{factor.name}</span>
                      <span className="text-xs text-dark-ink-tertiary">
                        {factor.value}/100 · weight {(factor.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-dark-canvas rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-yt-red"
                        style={{ width: `${factor.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Claude prompt */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4">Claude Prompt (template)</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6">
            <pre className="text-xs text-dark-ink-secondary font-mono whitespace-pre-wrap leading-relaxed">
              {`You are a YouTube trend analyst. Score this video's trend potential (0-100).

Video: "${MOCK_SCORING.input.title}"
Channel: ${MOCK_SCORING.input.channel}
Views: ${MOCK_SCORING.input.views.toLocaleString()} (${MOCK_SCORING.input.publishedAt})
Engagement: ${((MOCK_SCORING.input.likes / MOCK_SCORING.input.views) * 100).toFixed(1)}% like ratio

Respond with JSON:
{
  "score": <0-100>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>",
  "factors": [{ "name": "...", "weight": <0-1>, "value": <0-100> }]
}`}
            </pre>
          </div>
        </section>

        {/* Technical */}
        <section className="border-t border-hairline-dark pt-8">
          <h2 className="text-lg font-semibold mb-4">AI Integration</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6 text-sm text-dark-ink-secondary space-y-1">
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/ai/scorer.ts</code> —
              Trend scoring with Claude
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/ai/prompts.ts</code> —
              Prompt templates
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/ai/config.ts</code> —
              Model configuration
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
