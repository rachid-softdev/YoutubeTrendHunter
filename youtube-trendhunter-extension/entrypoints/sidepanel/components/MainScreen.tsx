import React from 'react'
import './MainScreen.css'
import type { Trend, Niche, Plan } from '../../../shared/types'

interface Props {
  niches: Niche[]
  selectedNiche: string
  trends: Trend[]
  plan: Plan
  onNicheChange: (slug: string) => void
  onLogout: () => void
}

function scoreClass(score: number) {
  if (score >= 75) return 'score-hot'
  if (score >= 50) return 'score-mid'
  return 'score-low'
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
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
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
          trends.map((t, i) => {
            const isHot = t.score >= 75
            return (
              <div
                key={i}
                className={'trend-card' + (isHot ? ' trend-hot' : '')}
              >
                <div className={'trend-score ' + scoreClass(t.score)}>
                  {Math.round(t.score)}
                </div>
                <div className="trend-content">
                  <div className="trend-title">
                    {t.title || t.keyword || 'Sans titre'}
                  </div>
                  <div className="trend-meta">
                    {t.videoCount ?? '?'} vidéos · +{Math.round(t.velocity ?? 0)}%
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {plan === 'FREE' && (
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
  )
}
