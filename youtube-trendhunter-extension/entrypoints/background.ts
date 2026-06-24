import { defineBackground } from "wxt/utils/define-background";
import { getApiBaseUrl, API_ENDPOINTS } from "../shared/constants/api";

export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    const windowId = tab.windowId ?? tab.id;
    if (!windowId) return;
    await browser.sidePanel.open({ windowId });
  });

  browser.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    const isYoutube = tab.url?.includes("youtube.com") ?? false;
    browser.sidePanel.setOptions({ tabId, enabled: isYoutube });
    // Close sidepanel if not on YouTube
    if (!isYoutube) {
      browser.sidePanel.close({ tabId }).catch(() => {}); // ignore if already closed
    }
  });

  browser.runtime.onMessage.addListener(async (message: { type: string; videoId?: string }) => {
    const API_BASE = await getApiBaseUrl();

    if (message.type === "GET_TRENDS") {
      let apiToken: string | undefined;
      let selectedNiche: string | undefined;
      try {
        const result = await browser.storage.session.get(["apiToken", "selectedNiche"]);
        apiToken = result.apiToken;
        selectedNiche = result.selectedNiche;
      } catch {
        return { error: "NOT_AUTHENTICATED" };
      }
      if (!apiToken) return { error: "NOT_AUTHENTICATED" };
      try {
        const res = await fetch(
          `${API_BASE}${API_ENDPOINTS.trends}?niche=${selectedNiche ?? "tech-ia"}`,
          { headers: { Authorization: `Bearer ${apiToken}` } },
        );
        const data = await res.json();
        return { data };
      } catch {
        return { error: "FETCH_ERROR" };
      }
    }

    if (message.type === "ANALYZE_VIDEO") {
      let apiToken: string | undefined;
      try {
        const result = await browser.storage.session.get("apiToken");
        apiToken = result.apiToken;
      } catch {
        return { error: "NOT_AUTHENTICATED" };
      }
      if (!apiToken) return { error: "NOT_AUTHENTICATED" };
      if (!message.videoId) return { error: "INVALID_VIDEO_ID" };
      try {
        const res = await fetch(`${API_BASE}${API_ENDPOINTS.analyze}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ videoId: message.videoId }),
        });
        const data = await res.json();
        return { data };
      } catch {
        return { error: "FETCH_ERROR" };
      }
    }

    // Unknown message type — caller won't get a response, which signals "unhandled"
    return undefined;
  });
});
