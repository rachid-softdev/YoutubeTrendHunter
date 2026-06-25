import { defineContentScript } from "wxt/utils/define-content-script";
import type { AnalyzeVideoResponse } from "../shared/types";

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_idle",
  main() {
    let currentVideoId: string | null = null;

    function getVideoId(): string | null {
      const params = new URLSearchParams(window.location.search);
      return params.get("v");
    }

    function injectBadge(score: number | null) {
      removeBadge();
      const container =
        document.querySelector("#above-the-fold #title") ||
        document.querySelector("h1.ytd-video-primary-info-renderer");
      if (!container) return;

      const badge = document.createElement("div");
      badge.id = "trendhunter-badge";
      badge.style.cssText =
        "display:inline-flex;align-items:center;gap:8px;margin:8px 0;padding:8px 12px;background:#212121;border:1px solid #3D3D3D;border-radius:8px;font-family:Roboto,Arial,sans-serif;font-size:13px;color:#F1F1F1";

      const innerDiv = document.createElement("div");
      innerDiv.style.display = "flex";
      innerDiv.style.alignItems = "center";
      innerDiv.style.gap = "8px";

      if (score != null && typeof score === "number" && !isNaN(score)) {
        const scoreColor = score >= 75 ? "#FF0000" : score >= 50 ? "#F59E0B" : "#22C55E";

        const scoreSpan = document.createElement("span");
        scoreSpan.style.background = scoreColor;
        scoreSpan.style.color = "white";
        scoreSpan.style.padding = "2px 8px";
        scoreSpan.style.borderRadius = "4px";
        scoreSpan.style.fontWeight = "700";
        scoreSpan.style.fontSize = "14px";
        scoreSpan.textContent = String(Math.round(score));

        const labelSpan = document.createElement("span");
        labelSpan.textContent = "Score TrendHunter";

        const sourceSpan = document.createElement("span");
        sourceSpan.style.color = "#AAAAAA";
        sourceSpan.style.fontSize = "11px";
        sourceSpan.textContent = "via TrendHunter";

        innerDiv.appendChild(scoreSpan);
        innerDiv.appendChild(labelSpan);
        innerDiv.appendChild(sourceSpan);
      } else {
        const labelSpan = document.createElement("span");
        labelSpan.style.fontWeight = "500";
        labelSpan.textContent = "Analyser avec TrendHunter";

        const sourceSpan = document.createElement("span");
        sourceSpan.style.color = "#AAAAAA";
        sourceSpan.style.fontSize = "11px";
        sourceSpan.textContent = "Extension";

        innerDiv.appendChild(labelSpan);
        innerDiv.appendChild(sourceSpan);
      }

      badge.appendChild(innerDiv);

      container.parentNode?.insertBefore(badge, container.nextSibling);
    }

    function removeBadge() {
      document.getElementById("trendhunter-badge")?.remove();
    }

    async function checkVideo() {
      const videoId = getVideoId();
      if (videoId && videoId !== currentVideoId) {
        currentVideoId = videoId;
        try {
          const { apiToken } = await browser.storage.session.get("apiToken");
          if (apiToken) {
            const response: AnalyzeVideoResponse = await browser.runtime.sendMessage({
              type: "ANALYZE_VIDEO",
              videoId,
            });
            const score = response?.data?.score;
            if (typeof score === "number" && !isNaN(score)) {
              injectBadge(score);
            } else {
              injectBadge(null);
            }
          } else {
            injectBadge(null);
          }
        } catch {
          // Extension context invalidated or port disconnected — silently degrade
          injectBadge(null);
        }
      } else if (!videoId && currentVideoId) {
        // Navigated away from a video (homepage, search, etc.) — remove stale badge
        currentVideoId = null;
        removeBadge();
      }
    }

    const debouncedCheck = debounce(() => {
      checkVideo();
    }, 500);
    const observer = new MutationObserver(() => {
      debouncedCheck();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    checkVideo();
  },
});
