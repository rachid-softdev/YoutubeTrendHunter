import { defineContentScript } from 'wxt/utils/define-content-script'
import type { AnalyzeVideoResponse } from '../shared/types'

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    let currentVideoId: string | null = null

    function getVideoId(): string | null {
      const params = new URLSearchParams(window.location.search)
      return params.get('v')
    }

    function injectBadge(score: number | null) {
      removeBadge()
      const container =
        document.querySelector('#above-the-fold #title') ||
        document.querySelector('h1.ytd-video-primary-info-renderer')
      if (!container) return

      const badge = document.createElement('div')
      badge.id = 'trendhunter-badge'
      badge.style.cssText =
        'display:inline-flex;align-items:center;gap:8px;margin:8px 0;padding:8px 12px;background:#212121;border:1px solid #3D3D3D;border-radius:8px;font-family:Roboto,Arial,sans-serif;font-size:13px;color:#F1F1F1'

      if (score != null) {
        const scoreColor =
          score >= 75 ? '#FF0000' : score >= 50 ? '#F59E0B' : '#22C55E'
        badge.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="background:' +
          scoreColor +
          ';color:white;padding:2px 8px;border-radius:4px;font-weight:700;font-size:14px">' +
          Math.round(score) +
          '</span>' +
          '<span>Score TrendHunter</span>' +
          '<span style="color:#AAAAAA;font-size:11px">via TrendHunter</span>' +
          '</div>'
      } else {
        badge.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:500">Analyser avec TrendHunter</span>' +
          '<span style="color:#AAAAAA;font-size:11px">Extension</span>' +
          '</div>'
      }

      container.parentNode?.insertBefore(badge, container.nextSibling)
    }

    function removeBadge() {
      document.getElementById('trendhunter-badge')?.remove()
    }

    async function checkVideo() {
      const videoId = getVideoId()
      if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId
        const { apiToken } = await browser.storage.local.get('apiToken')
        if (apiToken) {
          const response: AnalyzeVideoResponse = await browser.runtime.sendMessage({
            type: 'ANALYZE_VIDEO',
            videoId,
          })
          injectBadge(response?.data?.score ?? null)
        } else {
          injectBadge(null)
        }
      }
    }

    const observer = new MutationObserver(() => { checkVideo() })
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    })

    checkVideo()
  },
})
