import React, { useState } from "react";
import "./MainScreen.css";
import type { Trend, Niche, Plan } from "../../../shared/types";

interface Props {
  niches: Niche[];
  selectedNiche: string;
  trends: Trend[];
  plan: Plan;
  onNicheChange: (slug: string) => void;
  onLogout: () => void;
}

function scoreClass(score: number) {
  if (score >= 75) return "score-hot";
  if (score >= 50) return "score-mid";
  return "score-low";
}

function TrendCardItem({ trend }: { trend: Trend }) {
  const [expanded, setExpanded] = useState(false);
  const isHot = trend.score >= 75;
  const angles = trend.contentAngles ?? [];

  const toggle = () => setExpanded((prev) => !prev);

  return (
    <div className={"trend-card" + (isHot ? " trend-hot" : "")}>
      <div className={"trend-score " + scoreClass(trend.score)}>{Math.round(trend.score)}</div>
      <div className="trend-content">
        <div className="trend-title">{trend.title || trend.keyword || "Sans titre"}</div>
        <div className="trend-meta">
          {trend.videoCount ?? "?"} vidéos · +{Math.round(trend.velocity ?? 0)}%
        </div>

        {angles.length > 0 && (
          <div className="content-angles">
            <button
              className="angle-toggle"
              onClick={toggle}
              type="button"
              aria-expanded={expanded}
            >
              <span className="angle-toggle-label">Angles de contenu</span>
              <span className="angle-toggle-count">{angles.length}</span>
              <span className={"angle-chevron" + (expanded ? " chevron-open" : "")}>&#9662;</span>
            </button>
            {expanded && (
              <div className="angle-pills">
                {angles.map((angle, ai) => (
                  <span key={ai} className="angle-pill">
                    {angle}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MainScreen({
  niches,
  selectedNiche,
  trends,
  plan,
  onNicheChange,
  onLogout,
}: Props) {
  return (
    <>
      <div className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="logo-text">TrendHunter</span>
        </div>
        <span className="plan-badge">Plan {plan}</span>
      </div>

      <div className="main-toolbar">
        <span>Niche</span>
        <select
          className="niche-select"
          value={selectedNiche}
          onChange={(e) => onNicheChange(e.target.value)}
        >
          {niches.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      <div id="trends-list">
        {trends.length === 0 ? (
          <div className="empty-state">
            <p>Aucune tendance trouvée pour cette niche.</p>
          </div>
        ) : (
          trends.map((t, i) => <TrendCardItem key={t.id ?? t.title ?? i} trend={t} />)
        )}
      </div>

      {plan === "FREE" && (
        <div className="upgrade-banner">
          <p>Passez en Pro pour plus de tendances !</p>
          <a
            href="https://trendhunter.app/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-upgrade"
          >
            Voir les offres
          </a>
        </div>
      )}

      <div className="main-footer">
        <button className="btn btn-ghost logout-btn" onClick={onLogout}>
          SE DÉCONNECTER
        </button>
      </div>
    </>
  );
}
