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
    chrome.storage.local.get(["apiToken", "selectedNiche", "apiBaseUrl"], async ({ apiToken, selectedNiche, apiBaseUrl }) => {
      if (!apiToken) {
        sendResponse({ error: "NOT_AUTHENTICATED" })
        return
      }

      const baseUrl = apiBaseUrl || API_BASE

      try {
        const res = await fetch(
          `${baseUrl}/api/extension/trends?niche=${selectedNiche ?? "tech"}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          }
        )
        const data = await res.json()
        sendResponse({ data })
      } catch {
        sendResponse({ error: "FETCH_ERROR" })
      }
    })
    return true
  }
})
