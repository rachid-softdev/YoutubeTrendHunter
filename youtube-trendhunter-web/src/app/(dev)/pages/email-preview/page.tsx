"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { DevBadge } from "@/components/dev/DevBadge";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

const EMAIL_TEMPLATES = [
  {
    name: "Alert Notification",
    subject: "🔥 Trend détecté : IA generative pour shorts YouTube",
    description: "Sent when a trend score exceeds the user's alert threshold",
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F0F0F;font-family:Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F0F;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1A1A1A;border-radius:12px;overflow:hidden">
        <tr><td style="background:#FF0000;padding:24px 32px">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">🔥 TrendHunter Alert</h1>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;color:#fff;font-size:18px">IA generative pour shorts YouTube</h2>
          <p style="margin:0 0 16px;color:#999;font-size:14px">Score: <strong style="color:#FF0000">92/100</strong> · Velocity: +340%</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
            <tr>
              <td style="padding:12px;background:#0F0F0F;border-radius:8px;border:1px solid #333">
                <p style="margin:0;color:#999;font-size:12px">Channel</p>
                <p style="margin:4px 0 0;color:#fff;font-size:14px;font-weight:500">TechCreative FR</p>
              </td>
              <td style="width:12px"></td>
              <td style="padding:12px;background:#0F0F0F;border-radius:8px;border:1px solid #333">
                <p style="margin:0;color:#999;font-size:12px">Views (2h)</p>
                <p style="margin:4px 0 0;color:#fff;font-size:14px;font-weight:500">125,000</p>
              </td>
            </tr>
          </table>
          <a href="#" style="display:inline-block;padding:12px 24px;background:#FF0000;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">View Trend →</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #333">
          <p style="margin:0;color:#666;font-size:12px">TrendHunter — Veille YouTube IA</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
  {
    name: "Daily Digest",
    subject: "📊 Votre digest quotidien — 5 tendances détectées",
    description: "Daily summary of detected trends, sent at 8:00 AM",
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F0F0F;font-family:Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F0F;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1A1A1A;border-radius:12px;overflow:hidden">
        <tr><td style="background:#FF0000;padding:24px 32px">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">📊 Daily Digest</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">25 août 2026</p>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px;color:#fff;font-size:16px">5 tendances détectées aujourd'hui</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px;background:#0F0F0F;border-radius:8px;border:1px solid #333;margin-bottom:8px">
                <p style="margin:0;color:#fff;font-size:14px;font-weight:500">IA generative pour shorts</p>
                <p style="margin:4px 0 0;color:#FF0000;font-size:13px;font-weight:700">Score 92</p>
              </td>
            </tr>
            <tr><td style="height:8px"></td></tr>
            <tr>
              <td style="padding:12px;background:#0F0F0F;border-radius:8px;border:1px solid #333">
                <p style="margin:0;color:#fff;font-size:14px;font-weight:500">Tutoriels CapCut avancés</p>
                <p style="margin:4px 0 0;color:#FF0000;font-size:13px;font-weight:700">Score 87</p>
              </td>
            </tr>
            <tr><td style="height:8px"></td></tr>
            <tr>
              <td style="padding:12px;background:#0F0F0F;border-radius:8px;border:1px solid #333">
                <p style="margin:0;color:#fff;font-size:14px;font-weight:500">Routine productivité créateur</p>
                <p style="margin:4px 0 0;color:#FF0000;font-size:13px;font-weight:700">Score 78</p>
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;text-align:center">
            <a href="#" style="display:inline-block;padding:12px 24px;background:#FF0000;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Voir le dashboard →</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #333">
          <p style="margin:0;color:#666;font-size:12px">TrendHunter — Veille YouTube IA</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
];

export default function EmailPreviewPage() {
  const [activeTemplate, setActiveTemplate] = useState(0);
  const template = EMAIL_TEMPLATES[activeTemplate];

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <DevBadge />
            <h1 className="text-2xl font-bold">Email Templates</h1>
          </div>
          <p className="text-dark-ink-secondary">
            Alert notification and daily digest email templates. Table-based HTML for maximum
            compatibility.
          </p>
        </div>

        {/* Template selector */}
        <section className="mb-8">
          <div className="flex gap-2">
            {EMAIL_TEMPLATES.map((tpl, i) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => setActiveTemplate(i)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  activeTemplate === i
                    ? "border-yt-red bg-yt-red/10 text-yt-red"
                    : "border-hairline-dark bg-dark-surface text-dark-ink-secondary hover:border-yt-red/30"
                }`}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </section>

        {/* Template info */}
        <section className="mb-6">
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-4">
            <h3 className="text-sm font-semibold">{template.name}</h3>
            <p className="text-xs text-dark-ink-tertiary mt-1">{template.description}</p>
            <p className="text-xs text-dark-ink-secondary mt-2">
              <span className="font-medium">Subject:</span> {template.subject}
            </p>
          </div>
        </section>

        {/* Email preview */}
        <section className="mb-12">
          <div className="border border-hairline-dark rounded-xl overflow-hidden bg-white">
            <iframe
              srcDoc={template.html}
              title={template.name}
              className="w-full border-0"
              style={{ minHeight: 500, height: "auto" }}
              sandbox="allow-same-origin"
              loading="lazy"
              onLoad={(e) => {
                const iframe = e.currentTarget;
                try {
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc) {
                    const height =
                      doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 500;
                    iframe.style.height = `${height}px`;
                  }
                } catch {
                  // Cross-origin
                }
              }}
            />
          </div>
        </section>

        {/* Technical */}
        <section className="border-t border-hairline-dark pt-8">
          <h2 className="text-lg font-semibold mb-4">Email System</h2>
          <div className="bg-dark-surface rounded-xl border border-hairline-dark p-6 text-sm text-dark-ink-secondary space-y-1">
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/email/</code> — Email
              templates and sending
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/email/alert.ts</code> —
              Trend alert notifications
            </p>
            <p>
              <code className="text-xs bg-dark-canvas px-1 rounded">src/lib/email/digest.ts</code> —
              Daily digest generation
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
