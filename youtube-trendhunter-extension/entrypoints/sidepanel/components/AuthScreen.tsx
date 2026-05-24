import React, { useState } from 'react'
import './AuthScreen.css'

interface Props {
  onConnect: (token: string) => void
}

export default function AuthScreen({ onConnect }: Props) {
  const [token, setToken] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (token.trim()) onConnect(token.trim())
  }

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="logo" style={{ marginBottom: 20 }}>
          <div className="logo-icon">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
          <span className="logo-text">TrendHunter</span>
        </div>

        <h2>Connexion</h2>
        <p>Entrez votre token API pour accéder aux tendances.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="input-field"
            placeholder="Token API (ex: th_xxxx...)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            SE CONNECTER
          </button>
        </form>

        <div className="divider">ou</div>

        <a
          href="https://trendhunter.app/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost"
          style={{ fontSize: 12 }}
        >
          OBTENIR UN TOKEN →
        </a>
      </div>
    </div>
  )
}
