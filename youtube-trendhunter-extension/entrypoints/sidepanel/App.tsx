import React, { useState, useEffect } from 'react'
import AuthScreen from './components/AuthScreen'
import MainScreen from './components/MainScreen'
import LoadingScreen from './components/LoadingScreen'
import { API_BASE, API_ENDPOINTS, DEFAULT_NICHES } from '../../shared/constants/api'
import type { Trend, Niche, Plan } from '../../shared/types'

type Screen = 'loading' | 'auth' | 'main'

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [niches, setNiches] = useState<Niche[]>([])
  const [selectedNiche, setSelectedNiche] = useState<string>('tech-ia')
  const [trends, setTrends] = useState<Trend[]>([])
  const [plan, setPlan] = useState<Plan>('FREE')

  async function loadNiches() {
    try {
      const res = await fetch(`${API_BASE}${API_ENDPOINTS.niches}`)
      const data = await res.json()
      if (Array.isArray(data)) setNiches(data)
      else setNiches(DEFAULT_NICHES)
    } catch {
      setNiches(DEFAULT_NICHES)
    }
  }

  async function loadTrends() {
    const response = await browser.runtime.sendMessage({ type: 'GET_TRENDS' })
    if (response?.error === 'NOT_AUTHENTICATED') {
      setScreen('auth')
      return
    }
    if (response?.data) {
      setTrends(response.data.trends ?? [])
      setPlan(response.data.plan ?? 'FREE')
    }
    setScreen('main')
  }

  async function handleConnect(token: string) {
    await browser.storage.local.set({ apiToken: token })
    setScreen('loading')
    await loadNiches()
    await loadTrends()
  }

  async function handleLogout() {
    await browser.storage.local.remove('apiToken')
    setTrends([])
    setPlan('FREE')
    setScreen('auth')
  }

  async function handleNicheChange(slug: string) {
    setSelectedNiche(slug)
    await browser.storage.local.set({ selectedNiche: slug })
    const response = await browser.runtime.sendMessage({
      type: 'GET_TRENDS',
    })
    if (response?.data) {
      setTrends(response.data.trends ?? [])
      setPlan(response.data.plan ?? 'FREE')
    }
  }

  useEffect(() => {
    ;(async () => {
      const { apiToken, selectedNiche } = await browser.storage.local.get(['apiToken', 'selectedNiche'])
      if (!apiToken) {
        setScreen('auth')
        return
      }
      if (!selectedNiche) {
        await browser.storage.local.set({ selectedNiche: 'tech-ia' })
      }
      await loadNiches()
      await loadTrends()
    })()
  }, [])

  if (screen === 'loading') return <LoadingScreen />
  if (screen === 'auth') return <AuthScreen onConnect={handleConnect} />

  return (
    <MainScreen
      niches={niches}
      selectedNiche={selectedNiche}
      trends={trends}
      plan={plan}
      onNicheChange={handleNicheChange}
      onLogout={handleLogout}
    />
  )
}
