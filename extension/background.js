const API_BASE = "http://localhost:3000"

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.includes("youtube.com")) {
    chrome.sidePanel.setOptions({ tabId, path: "sidebar/index.html", enabled: true })
  } else {
    chrome.sidePanel.setOptions({ tabId, enabled: false })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TRENDS") {
    chrome.storage.local.get(["apiToken", "selectedNiche"], async ({ apiToken, selectedNiche }) => {
      if (!apiToken) {
        sendResponse({ error: "NOT_AUTHENTICATED" })
        return
      }

      try {
        const res = await fetch(
          `${API_BASE}/api/extension/trends?niche=${selectedNiche ?? "tech"}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          }
        )
        const data = await res.json()
        sendResponse({ data })
      } catch (err) {
        sendResponse({ error: "FETCH_ERROR" })
      }
    })
    return true
  }

  if (message.type === "ANALYZE_VIDEO") {
    chrome.storage.local.get("apiToken", async ({ apiToken }) => {
      if (!apiToken) {
        sendResponse({ error: "NOT_AUTHENTICATED" })
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/extension/analyze`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ videoId: message.videoId }),
        })
        const data = await res.json()
        sendResponse({ data })
      } catch (err) {
        sendResponse({ error: "FETCH_ERROR" })
      }
    })
    return true
  }
})