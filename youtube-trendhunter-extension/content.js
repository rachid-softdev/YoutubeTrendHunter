(function () {
  "use strict"

  let currentVideoId = null

  function getVideoId() {
    var params = new URLSearchParams(window.location.search)
    return params.get("v")
  }

  function injectBadge(trendData) {
    removeBadge()

    var container = document.querySelector("#above-the-fold #title") || document.querySelector("h1.ytd-video-primary-info-renderer")
    if (!container) return

    var badge = document.createElement("div")
    badge.id = "trendhunter-badge"
    badge.style.cssText = "display:inline-flex;align-items:center;gap:8px;margin:8px 0;padding:8px 12px;background:#212121;border:1px solid #3D3D3D;border-radius:8px;font-family:Roboto,Arial,sans-serif;font-size:13px;color:#F1F1F1"

    if (trendData && trendData.score) {
      var scoreColor = trendData.score >= 75 ? "#FF0000" : trendData.score >= 50 ? "#F59E0B" : "#22C55E"
      badge.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="background:' + scoreColor + ';color:white;padding:2px 8px;border-radius:4px;font-weight:700;font-size:14px">' + Math.round(trendData.score) + '</span>' +
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

    container.parentNode.insertBefore(badge, container.nextSibling)
  }

  function removeBadge() {
    var existing = document.getElementById("trendhunter-badge")
    if (existing) existing.remove()
  }

  function checkVideo() {
    var videoId = getVideoId()
    if (videoId && videoId !== currentVideoId) {
      currentVideoId = videoId
      chrome.storage.local.get("apiToken", function (result) {
        if (result.apiToken) {
          chrome.runtime.sendMessage({ type: "ANALYZE_VIDEO", videoId: videoId }, function (response) {
            if (response && response.data) {
              injectBadge(response.data)
            } else {
              injectBadge(null)
            }
          })
        }
      })
    }
  }

  // Watch for YouTube SPA navigation
  var observer = new MutationObserver(function () {
    checkVideo()
  })

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  })

  // Initial check
  checkVideo()
})()
