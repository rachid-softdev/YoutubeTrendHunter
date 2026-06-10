import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "TrendHunter — Veille YouTube IA",
    version: "1.0.0",
    description: "Détectez les tendances YouTube émergentes avant vos concurrents.",
    permissions: ["storage", "activeTab", "sidePanel"],
    host_permissions: [
      "https://www.youtube.com/*",
      "https://trendhunter.app/*",
      "http://localhost:3000/*",
    ],
    side_panel: {
      default_path: "sidepanel.html",
    },
    action: {
      default_title: "TrendHunter",
      default_icon: {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    icons: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
