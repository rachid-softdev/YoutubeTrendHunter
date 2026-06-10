export const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export const API_ENDPOINTS = {
  trends: "/api/extension/trends",
  analyze: "/api/extension/analyze",
  niches: "/api/extension/trends/niches",
} as const;

export const DEFAULT_NICHES: { slug: string; name: string }[] = [
  { slug: "tech-ia", name: "Tech & IA" },
  { slug: "finance-personnelle", name: "Finance" },
  { slug: "fitness", name: "Fitness" },
  { slug: "cuisine", name: "Cuisine" },
  { slug: "business-en-ligne", name: "Business en ligne" },
];

/**
 * Read the configured API base URL from chrome.storage.sync.
 * Falls back to the environment variable or the default dev value.
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    const result = await browser.storage.sync.get("apiBaseUrl");
    if (result.apiBaseUrl && typeof result.apiBaseUrl === "string") {
      return result.apiBaseUrl;
    }
  } catch {
    // storage unavailable (e.g., background script in some contexts)
  }
  return DEFAULT_API_BASE;
}

/**
 * Persist a custom API base URL to chrome.storage.sync.
 * Pass an empty string to reset to default.
 */
export async function setApiBaseUrl(url: string): Promise<void> {
  if (!url || url.trim() === "") {
    await browser.storage.sync.remove("apiBaseUrl");
  } else {
    await browser.storage.sync.set({ apiBaseUrl: url.trim() });
  }
}
