import { defineBackground } from 'wxt/utils/define-background'
import { API_BASE, API_ENDPOINTS } from '../shared/constants/api'
import type { GetTrendsResponse, AnalyzeVideoResponse } from '../shared/types'

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    await browser.sidePanel.open({ windowId: tab.windowId })
  })

  browser.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    const isYoutube = tab.url?.includes('youtube.com') ?? false
    browser.sidePanel.setOptions({ tabId, enabled: isYoutube })
  })

  browser.runtime.onMessage.addListener(
    async (message: { type: string; videoId?: string }) => {
      if (message.type === 'GET_TRENDS') {
        const { apiToken, selectedNiche } = await browser.storage.local.get([
          'apiToken',
          'selectedNiche',
        ])
        if (!apiToken) return { error: 'NOT_AUTHENTICATED' }
        try {
          const res = await fetch(
            `${API_BASE}${API_ENDPOINTS.trends}?niche=${selectedNiche ?? 'tech-ia'}`,
            { headers: { Authorization: `Bearer ${apiToken}` } }
          )
          const data = await res.json()
          return { data }
        } catch {
          return { error: 'FETCH_ERROR' }
        }
      }

      if (message.type === 'ANALYZE_VIDEO') {
        const { apiToken } = await browser.storage.local.get('apiToken')
        if (!apiToken) return { error: 'NOT_AUTHENTICATED' }
        try {
          const res = await fetch(`${API_BASE}${API_ENDPOINTS.analyze}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: message.videoId }),
          })
          const data = await res.json()
          return { data }
        } catch {
          return { error: 'FETCH_ERROR' }
        }
      }
    }
  )
})
